package provider

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

var (
	codexLoginCmd    *exec.Cmd
	codexLoginOutput string
	codexLoginMutex  sync.Mutex
	codexLoginURL    string
	codexLoginCode   string
	codexLoginDone   chan error
	codexLoginCancel context.CancelFunc
	codexAccountName string
)

// InitiateCodexLogin starts the `codex login --device-auth` process.
func (h *Handler) InitiateCodexLogin(c *gin.Context) {
	var req struct {
		AccountName string `json:"account_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.AccountName = "Default"
	}
	if req.AccountName == "" {
		req.AccountName = "Default"
	}

	codexLoginMutex.Lock()
	if codexLoginCmd != nil {
		if codexLoginCmd.ProcessState == nil {
			codexLoginMutex.Unlock()
			response.BadRequest(c, "A Codex login process is already running")
			return
		}
		// Reset state if previous process finished
		codexLoginCmd = nil
		codexLoginOutput = ""
		codexLoginURL = ""
		codexLoginCode = ""
		codexLoginDone = nil
		codexAccountName = ""
		if codexLoginCancel != nil {
			codexLoginCancel()
			codexLoginCancel = nil
		}
	}
	codexLoginMutex.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute) // 10 minutes timeout to prevent zombie process
	cmd := exec.CommandContext(ctx, "codex", "login", "--device-auth")
	env := append(os.Environ(), "BROWSER=none")
	if req.AccountName != "Default" {
		configDir := filepath.Join(os.Getenv("HOME"), ".config", "qmon", "codex_profiles", req.AccountName)
		if err := os.MkdirAll(configDir, 0755); err == nil {
			env = append(env, "XDG_CONFIG_HOME="+configDir)
		}
	}
	cmd.Env = env

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		response.ServerError(c, err.Error())
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		response.ServerError(c, err.Error())
		return
	}

	if err := cmd.Start(); err != nil {
		cancel()
		response.ServerError(c, err.Error())
		return
	}

	codexLoginMutex.Lock()
	codexLoginCmd = cmd
	codexLoginDone = make(chan error, 1)
	codexLoginOutput = ""
	codexLoginURL = ""
	codexLoginCode = ""
	codexLoginCancel = cancel
	codexAccountName = req.AccountName
	codexLoginMutex.Unlock()

	go func() {
		err := cmd.Wait()
		codexLoginDone <- err
	}()

	// Parse stdout and stderr to capture the device code and URL
	urlRegex := regexp.MustCompile(`(https://[^\s]+device)`)
	codeRegex := regexp.MustCompile(`([A-Z0-9]{4}-[A-Z0-9]{5})`)

	ready := make(chan bool, 1)

	processLine := func(line string) {
		codexLoginMutex.Lock()
		codexLoginOutput += line + "\n"

		if urlRegex.MatchString(line) {
			matches := urlRegex.FindStringSubmatch(line)
			codexLoginURL = matches[1]
		}
		if codeRegex.MatchString(line) {
			matches := codeRegex.FindStringSubmatch(line)
			codexLoginCode = matches[1]
		}

		if codexLoginURL != "" && codexLoginCode != "" {
			select {
			case ready <- true:
			default:
			}
		}
		codexLoginMutex.Unlock()
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			processLine(scanner.Text())
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			processLine(scanner.Text())
		}
	}()

	// Wait up to 10 seconds for the URL and code to appear
	select {
	case <-ready:
		codexLoginMutex.Lock()
		url := codexLoginURL
		code := codexLoginCode
		codexLoginMutex.Unlock()
		response.OK(c, "Codex login initiated", gin.H{
			"url":  url,
			"code": code,
		})
	case <-time.After(10 * time.Second):
		codexLoginMutex.Lock()
		out := codexLoginOutput
		codexLoginMutex.Unlock()
		response.ServerError(c, fmt.Sprintf("Timeout waiting for Codex device code flow. Output: %s", out))
	}
}

// CodexLoginStatus checks the status of the Codex login process.
func (h *Handler) CodexLoginStatus(c *gin.Context) {
	codexLoginMutex.Lock()
	defer codexLoginMutex.Unlock()

	if codexLoginCmd == nil {
		response.OK(c, "No Codex login in progress", gin.H{
			"status": "idle",
		})
		return
	}

	select {
	case err := <-codexLoginDone:
		// Process finished
		status := "success"
		msg := "Codex login completed successfully"
		if err != nil {
			status = "error"
			msg = fmt.Sprintf("Codex login failed: %v\nOutput:\n%s", err, codexLoginOutput)
		} else {
			// Save the profile to DB so polling can find it
			_ = h.repo.SaveCredential(0, "codex", codexAccountName, "isolated_profile")
		}

		codexLoginCmd = nil // allow new login

		response.OK(c, msg, gin.H{
			"status": status,
			"output": codexLoginOutput,
		})
	default:
		// Process still running
		response.OK(c, "Codex login is waiting for user authorization", gin.H{
			"status": "waiting",
			"url":    codexLoginURL,
			"code":   codexLoginCode,
			"output": codexLoginOutput,
		})
	}
}

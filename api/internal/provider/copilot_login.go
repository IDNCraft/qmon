package provider

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"sync"
	"time"

	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

var (
	copilotLoginCmd    *exec.Cmd
	copilotLoginOutput string
	copilotLoginMutex  sync.Mutex
	copilotLoginURL    string
	copilotLoginCode   string
	copilotLoginDone   chan error
	copilotAccountName string
)

// InitiateCopilotLogin starts the `gh auth login` device flow process.
func (h *Handler) InitiateCopilotLogin(c *gin.Context) {
	// Parse optional account_name
	var req struct {
		AccountName string `json:"account_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.AccountName = "Default"
	}
	if req.AccountName == "" {
		req.AccountName = "Default"
	}

	copilotLoginMutex.Lock()
	if copilotLoginCmd != nil {
		if copilotLoginCmd.ProcessState == nil {
			copilotLoginMutex.Unlock()
			response.BadRequest(c, "A Copilot login process is already running")
			return
		}
		// Reset state if previous process finished
		copilotLoginCmd = nil
		copilotLoginOutput = ""
		copilotLoginURL = ""
		copilotLoginCode = ""
		copilotLoginDone = nil
		copilotAccountName = ""
	}
	// Set account name for this session
	copilotAccountName = req.AccountName
	copilotLoginMutex.Unlock()

	ctx := context.Background() // Use background so it survives HTTP request
	cmd := exec.CommandContext(ctx, "gh", "auth", "login", "-p", "https", "-w", "-h", "github.com", "--scopes", "copilot")

	// Unset GITHUB_TOKEN so gh auth login actually runs interactively
	cmd.Env = os.Environ()
	for i, env := range cmd.Env {
		if len(env) >= 12 && env[:12] == "GITHUB_TOKEN" {
			cmd.Env = append(cmd.Env[:i], cmd.Env[i+1:]...)
			break
		}
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		response.ServerError(c, err.Error())
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		response.ServerError(c, err.Error())
		return
	}

	if err := cmd.Start(); err != nil {
		response.ServerError(c, err.Error())
		return
	}

	copilotLoginMutex.Lock()
	copilotLoginCmd = cmd
	copilotLoginDone = make(chan error, 1)
	copilotLoginOutput = ""
	copilotLoginURL = ""
	copilotLoginCode = ""
	copilotLoginMutex.Unlock()

	go func() {
		err := cmd.Wait()
		copilotLoginDone <- err
	}()

	// Parse stdout and stderr to capture the device code and URL
	urlRegex := regexp.MustCompile(`(https://github.com/login/device)`)
	codeRegex := regexp.MustCompile(`code:\s+([A-Z0-9\-]+)`)

	ready := make(chan bool, 1)

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			copilotLoginMutex.Lock()
			copilotLoginOutput += line + "\n"

			if urlRegex.MatchString(line) {
				matches := urlRegex.FindStringSubmatch(line)
				copilotLoginURL = matches[1]
			}
			if codeRegex.MatchString(line) {
				matches := codeRegex.FindStringSubmatch(line)
				copilotLoginCode = matches[1]
			}

			if copilotLoginURL != "" && copilotLoginCode != "" {
				select {
				case ready <- true:
				default:
				}
			}
			copilotLoginMutex.Unlock()
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			copilotLoginMutex.Lock()
			copilotLoginOutput += line + "\n"

			if urlRegex.MatchString(line) {
				matches := urlRegex.FindStringSubmatch(line)
				copilotLoginURL = matches[1]
			}
			if codeRegex.MatchString(line) {
				matches := codeRegex.FindStringSubmatch(line)
				copilotLoginCode = matches[1]
			}

			if copilotLoginURL != "" && copilotLoginCode != "" {
				select {
				case ready <- true:
				default:
				}
			}
			copilotLoginMutex.Unlock()
		}
	}()

	// Wait up to 10 seconds for the URL and code to appear
	select {
	case <-ready:
		copilotLoginMutex.Lock()
		url := copilotLoginURL
		code := copilotLoginCode
		copilotLoginMutex.Unlock()
		response.OK(c, "Copilot login initiated", gin.H{
			"url":  url,
			"code": code,
		})
	case <-time.After(10 * time.Second):
		copilotLoginMutex.Lock()
		out := copilotLoginOutput
		copilotLoginMutex.Unlock()
		response.ServerError(c, fmt.Sprintf("Timeout waiting for Copilot device code flow. Output: %s", out))
	}
}

// CopilotLoginStatus checks the status of the Copilot login process.
func (h *Handler) CopilotLoginStatus(c *gin.Context) {
	copilotLoginMutex.Lock()
	defer copilotLoginMutex.Unlock()

	if copilotLoginCmd == nil {
		response.OK(c, "No Copilot login in progress", gin.H{
			"status": "idle",
		})
		return
	}

	select {
	case err := <-copilotLoginDone:
		// Process finished
		status := "success"
		msg := "Copilot login completed successfully"
		if err != nil {
			status = "error"
			msg = fmt.Sprintf("Copilot login failed: %v\nOutput:\n%s", err, copilotLoginOutput)
		} else {
			// Save credential so account picker works next time
			if userID, ok := getUserID(c); ok {
				name := copilotAccountName
				if name == "" {
					name = "Default"
				}
				if saveErr := h.repo.SaveCredential(userID, "copilot", name, "gh-managed"); saveErr != nil {
					msg += fmt.Sprintf(" (warning: failed to save credential: %v)", saveErr)
				}
			}
		}

		copilotLoginCmd = nil // allow new login

		response.OK(c, msg, gin.H{
			"status": status,
			"output": copilotLoginOutput,
		})
	default:
		// Process still running
		response.OK(c, "Copilot login is waiting for user authorization", gin.H{
			"status": "waiting",
			"url":    copilotLoginURL,
			"code":   copilotLoginCode,
			"output": copilotLoginOutput,
		})
	}
}

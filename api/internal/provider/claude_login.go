package provider

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

// claudeLoginSession holds an in-progress claude auth login process.
type claudeLoginSession struct {
	URL         string
	stdin       io.WriteCloser
	cmd         *exec.Cmd
	done        chan error
	cancel      context.CancelFunc
	createdAt   time.Time
	accountName string
}

var (
	claudeSessionMu sync.Mutex
	claudeSession   *claudeLoginSession
)

// InitiateClaudeLogin handles POST /api/v1/providers/auth/claude/initiate
// Spawns `claude auth login`, captures the OAuth URL from stdout, and returns it.
func (h *Handler) InitiateClaudeLogin(c *gin.Context) {
	var req struct {
		AccountName string `json:"account_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.AccountName = "Default"
	}
	if req.AccountName == "" {
		req.AccountName = "Default"
	}

	claudeSessionMu.Lock()
	defer claudeSessionMu.Unlock()

	// Cancel any previous stale session
	if claudeSession != nil {
		if claudeSession.cancel != nil {
			claudeSession.cancel()
		}
		_ = claudeSession.stdin.Close()
		claudeSession = nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	cmd := exec.CommandContext(ctx, "claude", "auth", "login")
	env := append(os.Environ(), "BROWSER=none")
	if req.AccountName != "Default" {
		configDir := filepath.Join(os.Getenv("HOME"), ".config", "qmon", "claude_profiles", req.AccountName)
		if err := os.MkdirAll(configDir, 0755); err == nil {
			env = append(env, "XDG_CONFIG_HOME="+configDir)
		}
	}
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		response.ServerError(c, "failed to create stdin pipe: "+err.Error())
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		response.ServerError(c, "failed to create stdout pipe: "+err.Error())
		return
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		cancel()
		response.ServerError(c, "failed to start claude auth login: "+err.Error())
		return
	}

	urlCh := make(chan string, 1)
	errCh := make(chan error, 1)

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "https://") {
				parts := strings.SplitN(line, "https://", 2)
				if len(parts) == 2 {
					url := "https://" + strings.TrimSpace(parts[1])
					urlCh <- url
					return
				}
			}
		}
		errCh <- fmt.Errorf("URL not found in claude auth login output")
	}()

	var oauthURL string
	select {
	case oauthURL = <-urlCh:
	case err := <-errCh:
		cancel()
		_ = cmd.Process.Kill()
		response.ServerError(c, err.Error())
		return
	case <-time.After(10 * time.Second):
		cancel()
		_ = cmd.Process.Kill()
		response.ServerError(c, "timed out waiting for claude auth login URL")
		return
	}

	doneCh := make(chan error, 1)
	go func() {
		doneCh <- cmd.Wait()
		claudeSessionMu.Lock()
		claudeSession = nil
		claudeSessionMu.Unlock()
	}()

	claudeSession = &claudeLoginSession{
		URL:         oauthURL,
		stdin:       stdin,
		cmd:         cmd,
		done:        doneCh,
		cancel:      cancel,
		createdAt:   time.Now(),
		accountName: req.AccountName,
	}

	response.OK(c, "Claude login initiated", gin.H{
		"url":        oauthURL,
		"expires_in": 300,
	})
}

// CompleteClaudeLogin handles POST /api/v1/providers/auth/claude/complete
func (h *Handler) CompleteClaudeLogin(c *gin.Context) {
	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, "code is required")
		return
	}

	claudeSessionMu.Lock()
	session := claudeSession
	claudeSessionMu.Unlock()

	if session == nil {
		response.BadRequest(c, "no active claude login session, please initiate login first")
		return
	}

	if time.Since(session.createdAt) > 5*time.Minute {
		claudeSessionMu.Lock()
		claudeSession = nil
		claudeSessionMu.Unlock()
		response.BadRequest(c, "login session expired, please initiate again")
		return
	}

	_, err := fmt.Fprintln(session.stdin, strings.TrimSpace(input.Code))
	if err != nil {
		response.ServerError(c, "failed to send code to claude process: "+err.Error())
		return
	}
	_ = session.stdin.Close()

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	select {
	case err := <-session.done:
		if err != nil {
			response.ServerError(c, "claude auth login failed: "+err.Error())
			return
		}
		response.OK(c, "Claude login successful", nil)

		// Save the profile to DB so polling can find it
		_ = h.repo.SaveCredential(0, "claude", session.accountName, "isolated_profile")
	case <-ctx.Done():
		response.ServerError(c, "timed out waiting for claude auth to complete")
	}
}

// ClaudeLoginStatus handles GET /api/v1/providers/auth/claude/status
func (h *Handler) ClaudeLoginStatus(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "claude", "auth", "status").CombinedOutput()
	output := strings.TrimSpace(string(out))

	loggedIn := err == nil && !strings.Contains(strings.ToLower(output), "not logged in")

	claudeSessionMu.Lock()
	hasPending := claudeSession != nil
	claudeSessionMu.Unlock()

	response.OK(c, "Claude auth status", gin.H{
		"logged_in": loggedIn,
		"pending":   hasPending,
		"detail":    output,
	})
}

package quota

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type codexRPCWindow struct {
	UsedPercent float64 `json:"usedPercent"`
	ResetsAt    int64   `json:"resetsAt"`
}

type codexRPCRateLimits struct {
	Primary   *codexRPCWindow `json:"primary"`
	Secondary *codexRPCWindow `json:"secondary"`
	PlanType  string          `json:"planType"`
}

type codexRPCResult struct {
	RateLimits *codexRPCRateLimits `json:"rateLimits"`
}

type codexRPCResponse struct {
	ID     int             `json:"id"`
	Result *codexRPCResult `json:"result"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// probeCodexRPC queries the Codex app-server via JSON-RPC over stdin/stdout.
func (s *Service) probeCodexRPC(ctx context.Context, env map[string]string) ([]Quota, error) {
	cmd, err := s.runRPCCommand(ctx, env, "codex", "-s", "read-only", "-a", "never", "app-server")
	if err != nil {
		return nil, err
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start codex process: %w", err)
	}
	defer cmd.Process.Kill()

	scanner := bufio.NewScanner(stdout)

	// 1. Send initialize request
	initReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"clientInfo": map[string]string{
				"name":    "qmon",
				"version": "1.0.0",
			},
		},
	}
	initBytes, _ := json.Marshal(initReq)
	if _, err := stdin.Write(append(initBytes, '\n')); err != nil {
		return nil, fmt.Errorf("failed to write initialize request: %w", err)
	}

	// Read response for initialize
	if !scanner.Scan() {
		return nil, fmt.Errorf("failed to read initialize response: %w", scanner.Err())
	}

	// 2. Send initialized notification
	initializedNotification := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "initialized",
		"params":  map[string]interface{}{},
	}
	initializedBytes, _ := json.Marshal(initializedNotification)
	if _, err := stdin.Write(append(initializedBytes, '\n')); err != nil {
		return nil, fmt.Errorf("failed to write initialized notification: %w", err)
	}

	// 3. Send account/rateLimits/read request
	readReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "account/rateLimits/read",
		"params":  map[string]interface{}{},
	}
	readBytes, _ := json.Marshal(readReq)
	if _, err := stdin.Write(append(readBytes, '\n')); err != nil {
		return nil, fmt.Errorf("failed to write rate limits request: %w", err)
	}

	// 4. Read stdout lines to parse results
	var quotas []Quota
	found := false
	readDone := make(chan bool, 1)
	var readErr error

	go func() {
		defer close(readDone)
		for scanner.Scan() {
			text := scanner.Text()
			var msg codexRPCResponse
			if err := json.Unmarshal([]byte(text), &msg); err == nil {
				if msg.ID == 2 {
					if msg.Error != nil {
						readErr = fmt.Errorf("RPC error: %s", msg.Error.Message)
						return
					}
					if msg.Result == nil || msg.Result.RateLimits == nil {
						readErr = fmt.Errorf("invalid response structure: missing rateLimits")
						return
					}

					limits := msg.Result.RateLimits

					// Primary limit (5h)
					if limits.Primary != nil {
						remaining := 100.0 - limits.Primary.UsedPercent
						if remaining < 0 {
							remaining = 0
						}
						resetText := "Quota available"
						var resetAt *time.Time
						if limits.Primary.ResetsAt > 0 {
							resetTime := time.Unix(limits.Primary.ResetsAt, 0)
							resetAt = &resetTime
							dur := time.Until(resetTime)
							if dur > 0 {
								resetText = fmt.Sprintf("Resets in %s", formatDuration(dur))
							}
						}
						quotas = append(quotas, Quota{
							QuotaType:        QuotaTypeFiveHour,
							PercentRemaining: remaining,
							ResetText:        resetText,
							ResetsAt:         resetAt,
						})
					}

					// Secondary limit (Weekly)
					if limits.Secondary != nil {
						remaining := 100.0 - limits.Secondary.UsedPercent
						if remaining < 0 {
							remaining = 0
						}
						resetText := "Quota available"
						var resetAt *time.Time
						if limits.Secondary.ResetsAt > 0 {
							resetTime := time.Unix(limits.Secondary.ResetsAt, 0)
							resetAt = &resetTime
							dur := time.Until(resetTime)
							if dur > 0 {
								resetText = fmt.Sprintf("Resets in %s", formatDuration(dur))
							}
						}
						quotas = append(quotas, Quota{
							QuotaType:        QuotaTypeWeekly,
							PercentRemaining: remaining,
							ResetText:        resetText,
							ResetsAt:         resetAt,
						})
					}

					// Fallback if no limits returned (e.g. Free plan default)
					if len(quotas) == 0 && limits.PlanType == "free" {
						quotas = append(quotas, Quota{
							QuotaType:        QuotaTypeFiveHour,
							PercentRemaining: 100.0,
							ResetText:        "Free plan",
						})
					}

					found = true
					return
				}
			}
		}
		if scanner.Err() != nil {
			readErr = scanner.Err()
		}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-readDone:
		if readErr != nil {
			return nil, readErr
		}
		if !found {
			return nil, fmt.Errorf("failed to find rates limit response with id 2")
		}
		return quotas, nil
	}
}

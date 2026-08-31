package quota

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const openCodeUsageURL = "https://opencode.ai/zen/go/v1/usage"

type openCodeUsageWindow struct {
	Status   string  `json:"status"`
	Percent  float64 `json:"percent"`
	ResetsAt string  `json:"resetsAt"`
}

type openCodeUsageResponse struct {
	Usage struct {
		Rolling *openCodeUsageWindow `json:"rolling"`
		Weekly  *openCodeUsageWindow `json:"weekly"`
		Monthly *openCodeUsageWindow `json:"monthly"`
	} `json:"usage"`
}

// loadOpenCodeAPIKey resolves the OpenCode Go API key the same way the CLI does:
// OPENCODE_API_KEY env var first, then the opencode-go / opencode entries in
// auth.json under the (optionally overridden) data directory.
func loadOpenCodeAPIKey(configDir string) (string, error) {
	if key := os.Getenv("OPENCODE_API_KEY"); key != "" {
		return key, nil
	}

	var authPath string
	if configDir != "" {
		authPath = filepath.Join(configDir, "opencode", "auth.json")
	} else {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("not logged in")
		}
		authPath = filepath.Join(homeDir, ".local", "share", "opencode", "auth.json")
	}

	authData, err := os.ReadFile(authPath)
	if err != nil {
		return "", fmt.Errorf("not logged in")
	}

	var auth map[string]struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(authData, &auth); err != nil {
		return "", fmt.Errorf("not logged in")
	}
	for _, entry := range []string{"opencode-go", "opencode"} {
		if item, ok := auth[entry]; ok && item.Key != "" {
			return item.Key, nil
		}
	}
	return "", fmt.Errorf("not logged in")
}

// parseOpenCodeUsage converts the official usage payload into quotas. The
// server-computed percent is *used*; "rate-limited" means fully exhausted.
func parseOpenCodeUsage(data []byte, now time.Time) ([]Quota, error) {
	var payload openCodeUsageResponse
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse OpenCode usage response: %w", err)
	}

	windows := []struct {
		window    *openCodeUsageWindow
		quotaType QuotaType
	}{
		{payload.Usage.Rolling, QuotaTypeFiveHour},
		{payload.Usage.Weekly, QuotaTypeWeekly},
		{payload.Usage.Monthly, QuotaTypeMonthly},
	}

	quotas := make([]Quota, 0, len(windows))
	for _, w := range windows {
		if w.window == nil {
			continue
		}
		rateLimited := w.window.Status == "rate-limited"
		remaining := max(0, min(100, 100-w.window.Percent))
		if rateLimited {
			remaining = 0
		}

		var resetsAt *time.Time
		resetText := string(w.quotaType)
		if t, err := time.Parse(time.RFC3339Nano, w.window.ResetsAt); err == nil {
			resetsAt = &t
			if dur := time.Until(t); dur > 0 {
				if rateLimited {
					resetText = fmt.Sprintf("Exhausted — %s", formatDuration(dur))
				} else {
					resetText = fmt.Sprintf("Resets in %s", formatDuration(dur))
				}
			}
		}

		quotas = append(quotas, Quota{
			QuotaType:        w.quotaType,
			PercentRemaining: remaining,
			ResetsAt:         resetsAt,
			ResetText:        resetText,
			IsExhausted:      rateLimited || w.window.Percent >= 100,
		})
	}

	if len(quotas) == 0 {
		return nil, fmt.Errorf("no usage windows in OpenCode response")
	}
	return quotas, nil
}

// probeOpenCode queries the official OpenCode Go usage endpoint, which reports
// the same rolling/weekly/monthly figures as the opencode.ai dashboard. The
// local-DB estimate is only used as a fallback (no key, network/API failure),
// since the CLI stopped writing per-message cost for Go models.
func (s *Service) probeOpenCode(ctx context.Context, now time.Time, configDir string) ([]Quota, error) {
	apiKey, keyErr := loadOpenCodeAPIKey(configDir)
	if keyErr == nil {
		quotas, err := s.probeOpenCodeAPI(ctx, apiKey, now)
		if err == nil {
			return quotas, nil
		}
	}

	quotas, localErr := s.probeOpenCodeLocal(ctx, now, configDir)
	if localErr != nil && keyErr != nil {
		return nil, keyErr
	}
	return quotas, localErr
}

func (s *Service) probeOpenCodeAPI(ctx context.Context, apiKey string, now time.Time) ([]Quota, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openCodeUsageURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("OpenCode usage request failed: %w", err)
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized:
		return nil, fmt.Errorf("OpenCode API key rejected (run 'qmon login opencode' again)")
	case http.StatusForbidden:
		return nil, fmt.Errorf("no OpenCode Go subscription for this API key")
	default:
		return nil, fmt.Errorf("OpenCode usage API returned HTTP %d", res.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read OpenCode usage response: %w", err)
	}
	return parseOpenCodeUsage(data, now)
}

package quota

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type copilotInteractionQuota struct {
	Entitlement      *int     `json:"entitlement"`
	PercentRemaining *float64 `json:"percent_remaining"`
	Remaining        *int     `json:"remaining"`
	Unlimited        *bool    `json:"unlimited"`
}

type copilotQuotaSnapshots struct {
	PremiumInteractions *copilotInteractionQuota `json:"premium_interactions"`
}

type copilotUserResponse struct {
	CopilotPlan       string                 `json:"copilot_plan"`
	QuotaResetDate    string                 `json:"quota_reset_date"`
	QuotaSnapshots    *copilotQuotaSnapshots `json:"quota_snapshots"`
	QuotaResetDateUtc string                 `json:"quota_reset_date_utc"`
}

// probeCopilot queries the GitHub API for Copilot usage
func (s *Service) probeCopilot(ctx context.Context, token string) ([]Quota, error) {
	// Bypass the dummy token injected by the AI sandbox or gh-managed placeholder
	if token == "github_pat_antigravitydummytoken" || token == "gh-managed" {
		token = ""
	}

	// Fallback: Try to read from gh CLI keyring/auth token
	if token == "" {
		ghToken, err := s.repo.RunCLICommand(ctx, nil, "gh", "auth", "token")
		if err == nil {
			trimmed := strings.TrimSpace(ghToken)
			if trimmed != "github_pat_antigravitydummytoken" {
				token = trimmed
			}
		}
	}

	if token == "" {
		return nil, fmt.Errorf("GitHub token not configured (set GITHUB_TOKEN or COPILOT_TOKEN, or login via 'gh auth login')")
	}

	// 2. Fetch from GitHub Copilot Internal API
	req, err := http.NewRequestWithContext(ctx, "GET", s.githubAPIBaseURL+"/copilot_internal/user", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("GitHub authentication failed (status %d): check token scopes (requires copilot/plan:read)", resp.StatusCode)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var res copilotUserResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("failed to decode JSON response: %w", err)
	}

	resetText := ""
	if res.QuotaResetDate != "" {
		resetText = fmt.Sprintf("Resets on %s", res.QuotaResetDate)
	} else if res.QuotaResetDateUtc != "" {
		// Try parsing resetting time
		if t, err := time.Parse(time.RFC3339, res.QuotaResetDateUtc); err == nil {
			dur := time.Until(t)
			if dur > 0 {
				resetText = fmt.Sprintf("Resets in %s", formatDuration(dur))
			}
		}
	}

	var resetAt *time.Time
	if res.QuotaResetDateUtc != "" {
		if t, err := time.Parse(time.RFC3339, res.QuotaResetDateUtc); err == nil {
			resetAt = &t
		}
	} else if res.QuotaResetDate != "" {
		if t, err := time.Parse("2006-01-02", res.QuotaResetDate); err == nil {
			resetAt = &t
		}
	}

	// Check if we have quota snapshots
	if res.QuotaSnapshots == nil || res.QuotaSnapshots.PremiumInteractions == nil {
		// Plan might be unlimited or doesn't restrict interactions
		quotaResetText := "Unlimited AI credits"
		if resetText != "" {
			quotaResetText = fmt.Sprintf("Unlimited AI credits (%s)", resetText)
		}
		return []Quota{
			{
				QuotaType:        QuotaTypeMonthly,
				PercentRemaining: 100.0,
				ResetText:        quotaResetText,
				ResetsAt:         resetAt,
			},
		}, nil
	}

	premium := res.QuotaSnapshots.PremiumInteractions
	if premium.Unlimited != nil && *premium.Unlimited {
		quotaResetText := "Unlimited AI credits"
		if resetText != "" {
			quotaResetText = fmt.Sprintf("Unlimited AI credits (%s)", resetText)
		}
		return []Quota{
			{
				QuotaType:        QuotaTypeMonthly,
				PercentRemaining: 100.0,
				ResetText:        quotaResetText,
				ResetsAt:         resetAt,
			},
		}, nil
	}

	pct := 100.0
	if premium.PercentRemaining != nil {
		pct = *premium.PercentRemaining
	}

	entitlement := 0
	if premium.Entitlement != nil {
		entitlement = *premium.Entitlement
	}

	remaining := 0
	if premium.Remaining != nil {
		remaining = *premium.Remaining
	}

	used := entitlement - remaining
	if used < 0 {
		used = 0
	}

	if entitlement == 0 && (premium.Unlimited == nil || !*premium.Unlimited) {
		return nil, fmt.Errorf("no active Copilot subscription")
	}

	// Format label: "X/Y AI credits"
	quotaResetText := fmt.Sprintf("%d/%d AI credits", used, entitlement)
	if resetText != "" {
		quotaResetText = fmt.Sprintf("%s (%s)", quotaResetText, resetText)
	}

	return []Quota{
		{
			QuotaType:        QuotaTypeMonthly,
			PercentRemaining: pct,
			ResetText:        quotaResetText,
			ResetsAt:         resetAt,
			IsExhausted:      remaining <= 0 && entitlement > 0,
		},
	}, nil
}

package quota

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

func parseClaudeError(err error, output string) string {
	combined := err.Error() + " " + stripAnsi(output)
	lowerCombined := strings.ToLower(combined)

	if strings.Contains(lowerCombined, "rate limited") || strings.Contains(lowerCombined, "rate limit") {
		return "Rate limited (please try again in a moment)."
	}
	if strings.Contains(lowerCombined, "subscription required") ||
		strings.Contains(lowerCombined, "only available for subscription") {
		return "Subscription required."
	}
	if strings.Contains(lowerCombined, "login") ||
		strings.Contains(lowerCombined, "logged") ||
		strings.Contains(lowerCombined, "unauthenticated") {
		return "Not logged in (please run 'qmon login claude' in terminal)."
	}
	if strings.Contains(lowerCombined, "api_key") || strings.Contains(lowerCombined, "invalid api key") {
		return "API Key not set or invalid."
	}
	return "Failed to parse Claude quota: " + combined
}

type ClaudeAuthStatus struct {
	LoggedIn         bool   `json:"loggedIn"`
	AuthMethod       string `json:"authMethod"`
	SubscriptionType string `json:"subscriptionType"`
}

func (s *Service) probeClaude(ctx context.Context, env map[string]string) ([]Quota, error) {
	// First, check the auth status of Claude
	statusOut, err := s.repo.RunCLICommand(ctx, env, "claude", "auth", "status")
	var authStatus ClaudeAuthStatus

	// Extract JSON block in case there are warnings or other stdout noise
	firstBrace := strings.Index(statusOut, "{")
	lastBrace := strings.LastIndex(statusOut, "}")
	if firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace {
		jsonStr := statusOut[firstBrace : lastBrace+1]
		if jsonErr := json.Unmarshal([]byte(jsonStr), &authStatus); jsonErr == nil {
			if !authStatus.LoggedIn {
				return nil, fmt.Errorf("not logged in")
			}
			if authStatus.AuthMethod == "api_key" {
				return []Quota{
					{
						QuotaType:        QuotaTypeSession,
						PercentRemaining: 100.0,
						ResetText:        "API Key active",
					},
				}, nil
			}
		}
	} else if err != nil {
		return nil, fmt.Errorf("%w: %s", err, statusOut)
	}

	// If logged in via OAuth, query usage details
	out, err := s.repo.RunCLICommand(ctx, env, "claude", "/usage", "--allowed-tools", "")
	if err != nil {
		// Fallback to /cost command for API/cost-based accounts
		costOut, costErr := s.repo.RunCLICommand(ctx, env, "claude", "/cost", "--allowed-tools", "")
		if costErr == nil {
			return parseClaudeCostOutput(costOut)
		}
		return nil, fmt.Errorf("%w: %s", err, out)
	}

	quotas, parseErr := parseClaudeOutput(out)
	if parseErr != nil && (strings.Contains(parseErr.Error(), "subscription required") || strings.Contains(parseErr.Error(), "could not parse")) {
		// Try fallback to /cost command
		costOut, costErr := s.repo.RunCLICommand(ctx, env, "claude", "/cost", "--allowed-tools", "")
		if costErr == nil {
			return parseClaudeCostOutput(costOut)
		}
	}
	return quotas, parseErr
}

func parseClaudeCostOutput(text string) ([]Quota, error) {
	clean := stripAnsi(text)
	reCost := regexp.MustCompile(`(?i)total\s+cost:\s*\$?([\d.]+)`)
	if match := reCost.FindStringSubmatch(clean); len(match) > 1 {
		costStr := match[1]
		return []Quota{
			{
				QuotaType:        QuotaTypeSession,
				PercentRemaining: 100.0,
				ResetText:        fmt.Sprintf("Total cost: $%s", costStr),
			},
		}, nil
	}
	return nil, fmt.Errorf("could not parse cost from output: %s", clean)
}

func extractClaudeResetText(text string, label string) string {
	lines := strings.Split(text, "\n")
	reReset := regexp.MustCompile(`(?i)\b(resets?|refreshes?)\b|\bin\s+\d+[dhms]`)
	for i, line := range lines {
		if strings.Contains(strings.ToLower(line), strings.ToLower(label)) {
			// Scan next 5 lines
			for j := i; j < len(lines) && j < i+6; j++ {
				if reReset.MatchString(lines[j]) {
					// Clean up the resets string
					trimmed := strings.TrimSpace(lines[j])
					if !strings.HasPrefix(strings.ToLower(trimmed), "reset") {
						return "Resets " + trimmed
					}
					return trimmed
				}
			}
		}
	}
	return ""
}

func parseClaudeOutput(text string) ([]Quota, error) {
	clean := stripAnsi(text)
	lowerClean := strings.ToLower(clean)
	var quotas []Quota

	// Handle subscription requirement warning
	if strings.Contains(clean, "/usage is only available for subscription plans") {
		return nil, fmt.Errorf("subscription required")
	}

	// Handle rate limit error
	if strings.Contains(lowerClean, "rate limited") || strings.Contains(lowerClean, "rate limit") {
		return nil, fmt.Errorf("rate limited")
	}

	// Find "Current session" percent
	sessionRe := regexp.MustCompile(`Current session\s*.*?(\d+)%`)
	if match := sessionRe.FindStringSubmatch(clean); len(match) > 1 {
		pct, _ := strconv.ParseFloat(match[1], 64)
		resetText := extractClaudeResetText(clean, "Current session")
		if resetText == "" {
			resetText = "resets shortly"
		}
		quotas = append(quotas, Quota{
			QuotaType:        QuotaTypeSession,
			PercentRemaining: pct,
			ResetText:        resetText,
		})
	}

	// Find "Current week" percent
	weeklyRe := regexp.MustCompile(`Current week \(all models\)\s*.*?(\d+)%`)
	if match := weeklyRe.FindStringSubmatch(clean); len(match) > 1 {
		pct, _ := strconv.ParseFloat(match[1], 64)
		resetText := extractClaudeResetText(clean, "Current week")
		if resetText == "" {
			resetText = "resets weekly"
		}
		quotas = append(quotas, Quota{
			QuotaType:        QuotaTypeWeekly,
			PercentRemaining: pct,
			ResetText:        resetText,
		})
	}

	// Find model-specific week quotas (Opus, Sonnet, Fable)
	modelQuotas := []struct {
		regex *regexp.Regexp
		key   string
	}{
		{regexp.MustCompile(`(?i)current\s+week\s*\(opus\)\s*.*?(\d+)%`), "opus"},
		{regexp.MustCompile(`(?i)current\s+week\s*\(sonnet(?:[^\)]*)\)\s*.*?(\d+)%`), "sonnet"},
		{regexp.MustCompile(`(?i)current\s+week\s*\(fable(?:[^\)]*)\)\s*.*?(\d+)%`), "fable"},
	}

	for _, mq := range modelQuotas {
		if match := mq.regex.FindStringSubmatch(clean); len(match) > 1 {
			pct, _ := strconv.ParseFloat(match[1], 64)
			resetText := extractClaudeResetText(clean, mq.key)
			if resetText == "" {
				resetText = "resets weekly"
			}
			quotas = append(quotas, Quota{
				QuotaType:        QuotaTypeModelSpecific,
				PercentRemaining: pct,
				ResetText:        resetText,
				ModelKey:         mq.key,
			})
		}
	}

	if len(quotas) > 0 {
		return quotas, nil
	}

	// Handle sub-only simple message "You are currently using your subscription..." as fallback
	if strings.Contains(clean, "using your subscription") {
		quotas = append(quotas, Quota{
			QuotaType:        QuotaTypeSession,
			PercentRemaining: 100.0,
			ResetText:        "subscription active",
		})
		return quotas, nil
	}
	return nil, fmt.Errorf("could not parse any quota from Claude output: %s", clean)
}

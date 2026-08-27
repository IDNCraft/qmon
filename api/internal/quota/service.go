package quota

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"qmon-api/internal/provider"
)

type Service struct {
	repo             Repository
	credRepo         *provider.Repository
	runRPCCommand    func(ctx context.Context, env map[string]string, name string, args ...string) (*exec.Cmd, error)
	githubAPIBaseURL string
}

func NewService(repo Repository, credRepo *provider.Repository) *Service {
	return &Service{
		repo:     repo,
		credRepo: credRepo,
		runRPCCommand: func(ctx context.Context, envVars map[string]string, name string, args ...string) (*exec.Cmd, error) {
			cmd := exec.CommandContext(ctx, name, args...)
			cmd.Env = append(os.Environ(), "BROWSER=none")
			if envVars != nil {
				for k, v := range envVars {
					cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
				}
			}
			return cmd, nil
		},
		githubAPIBaseURL: "https://api.github.com",
	}
}

// GetSnapshot retrieves status and usage details for active providers.
func (s *Service) GetSnapshot(ctx context.Context, filterProvider string, userID int) (QuotaSnapshotResponse, error) {
	now := time.Now()
	var providers []string
	if filterProvider != "" {
		providers = []string{strings.ToLower(strings.TrimSpace(filterProvider))}
	} else {
		providers = []string{"claude", "codex", "antigravity", "copilot", "opencode"}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	var snapshots []ProviderSnapshot

	for _, p := range providers {
		var creds []provider.Credential
		if s.credRepo != nil {
			creds, _ = s.credRepo.GetCredentials(userID, p)
			if len(creds) == 0 && userID > 0 {
				creds, _ = s.credRepo.GetCredentials(0, p)
			}
		}

		if len(creds) == 0 {
			creds = append(creds, provider.Credential{AccountName: "Default", Token: ""})
		}

		for _, cred := range creds {
			wg.Add(1)
			go func(p string, cred provider.Credential) {
				defer wg.Done()

				snapshot := ProviderSnapshot{
					ProviderID: p,
					IsEnabled:  true,
					CapturedAt: now,
				}
				accountSuffix := ""
				if cred.AccountName != "Default" && cred.AccountName != "" {
					accountSuffix = fmt.Sprintf(" (%s)", cred.AccountName)
				}

				switch p {
				case "claude":
					snapshot.Name = "Claude" + accountSuffix
					snapshot.IsAvailable = s.repo.CheckCLIAvailable(ctx, "claude")
					if snapshot.IsAvailable {
						if cred.AccountName == "Default" && cred.Token == "" {
							snapshot.LastError = "Not logged in (please run 'qmon login claude' in terminal)."
						} else {
							var env map[string]string
							if cred.AccountName != "Default" && cred.AccountName != "" {
								configDir := filepath.Join(os.Getenv("HOME"), ".config", "qmon", "claude_profiles", cred.AccountName)
								env = map[string]string{"XDG_CONFIG_HOME": configDir}
							}
							quotas, err := s.probeClaude(ctx, env)
							if err != nil {
								snapshot.LastError = parseClaudeError(err, err.Error())
							} else {
								snapshot.Quotas = quotas
							}
						}
					}
				case "codex":
					snapshot.Name = "Codex" + accountSuffix
					snapshot.IsAvailable = s.repo.CheckCLIAvailable(ctx, "codex")
					if snapshot.IsAvailable {
						if cred.AccountName == "Default" && cred.Token == "" {
							snapshot.LastError = "Not logged in (please run 'qmon login codex' in terminal)."
						} else {
							var env map[string]string
							if cred.AccountName != "Default" && cred.AccountName != "" {
								configDir := filepath.Join(os.Getenv("HOME"), ".config", "qmon", "codex_profiles", cred.AccountName)
								env = map[string]string{"XDG_CONFIG_HOME": configDir}
							}
							quotas, err := s.probeCodex(ctx, env)
							if err != nil {
								snapshot.LastError = parseCodexError(err, err.Error())
							} else {
								snapshot.Quotas = quotas
							}
						}
					}
				case "antigravity":
					snapshot.Name = "Antigravity" + accountSuffix
					snapshot.IsAvailable = true
					if snapshot.IsAvailable {
						if cred.AccountName == "Default" && cred.Token == "" {
							snapshot.LastError = "Not logged in (please run 'qmon login antigravity' in terminal)."
						} else {
							quotas, err := s.probeAntigravity(ctx, cred.Token, cred.AccountName, cred.UserID)
							if err != nil {
								snapshot.LastError = err.Error()
							} else {
								snapshot.Quotas = quotas
							}
						}
					}
				case "copilot":
					snapshot.Name = "GitHub Copilot" + accountSuffix
					token := cred.Token
					snapshot.IsAvailable = true
					if snapshot.IsAvailable {
						if cred.AccountName == "Default" && cred.Token == "" {
							snapshot.LastError = "Not logged in (please run 'qmon login copilot' in terminal)."
						} else {
							quotas, err := s.probeCopilot(ctx, token)
							if err != nil {
								snapshot.LastError = err.Error()
							} else {
								snapshot.Quotas = quotas
							}
						}
					}
				case "opencode":
					snapshot.Name = "OpenCode" + accountSuffix
					snapshot.IsAvailable = s.repo.CheckCLIAvailable(ctx, "opencode")
					if snapshot.IsAvailable {
						if cred.AccountName == "Default" && cred.Token == "" {
							snapshot.LastError = "Not logged in (please run 'qmon login opencode' in terminal)."
						} else {
							var configDir string
							if cred.AccountName != "Default" && cred.AccountName != "" {
								configDir = filepath.Join(os.Getenv("HOME"), ".local", "share", "qmon", "opencode_profiles", cred.AccountName)
							}

							quotas, err := s.probeOpenCode(ctx, now, configDir)
							if err != nil {
								if err.Error() == "not logged in" {
									snapshot.LastError = "Not logged in (please run 'qmon login opencode' in terminal)."
								} else {
									snapshot.LastError = err.Error()
								}
							} else {
								snapshot.Quotas = quotas
							}
						}
					}
				}

				mu.Lock()
				snapshots = append(snapshots, snapshot)
				mu.Unlock()
			}(p, cred)
		}
	}

	wg.Wait()

	sort.Slice(snapshots, func(i, j int) bool {
		if snapshots[i].ProviderID == snapshots[j].ProviderID {
			return snapshots[i].Name < snapshots[j].Name
		}
		return snapshots[i].ProviderID < snapshots[j].ProviderID
	})

	return QuotaSnapshotResponse{
		CapturedAt: now,
		Providers:  snapshots,
	}, nil
}

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

func (s *Service) probeOpenCode(ctx context.Context, now time.Time, configDir string) ([]Quota, error) {
	var authPath string
	if configDir != "" {
		authPath = filepath.Join(configDir, "opencode", "auth.json")
	} else {
		homeDir, _ := os.UserHomeDir()
		authPath = filepath.Join(homeDir, ".local", "share", "opencode", "auth.json")
	}

	authData, err := os.ReadFile(authPath)
	if err != nil {
		return nil, fmt.Errorf("not logged in")
	}

	var auth map[string]interface{}
	if err := json.Unmarshal(authData, &auth); err != nil {
		return nil, fmt.Errorf("not logged in")
	}

	if _, ok := auth["opencode"]; !ok {
		// Also check opencode-go for backward compatibility, but we treat it as opencode
		if _, ok2 := auth["opencode-go"]; !ok2 {
			return nil, fmt.Errorf("not logged in")
		}
	}

	fiveHourLimit := 12.0
	weeklyLimit := 30.0
	monthlyLimit := 60.0

	fiveHourAgo := now.Add(-5*time.Hour).UnixNano() / 1e6
	weekStart := startOfWeekUTC(now).UnixNano() / 1e6

	subQuery := `
    SELECT
      CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS t,
      CAST(json_extract(data, '$.cost') AS REAL) AS cost
    FROM message
    WHERE json_valid(data)
      AND json_extract(data, '$.providerID') IN ('opencode-go', 'opencode')
      AND json_extract(data, '$.role') = 'assistant'
      AND json_type(data, '$.cost') IN ('integer', 'real')
	`

	primarySQL := fmt.Sprintf(`
        SELECT
          COALESCE(SUM(CASE WHEN t >= %d THEN cost ELSE 0 END), 0) AS five_hour_cost,
          COALESCE(SUM(CASE WHEN t >= %d THEN cost ELSE 0 END), 0) AS weekly_cost,
          MIN(CASE WHEN t >= %d THEN t ELSE NULL END) AS five_hour_oldest_ms,
          MIN(t) AS anchor_ms
        FROM (%s)
	`, fiveHourAgo, weekStart, fiveHourAgo, subQuery)

	var env map[string]string
	if configDir != "" {
		env = map[string]string{"XDG_DATA_HOME": configDir}
	}

	res, err := s.repo.QueryLocalDB(ctx, env, primarySQL)
	if err != nil {
		return nil, err
	}

	type PrimaryRow struct {
		FiveHourCost     float64 `json:"five_hour_cost"`
		WeeklyCost       float64 `json:"weekly_cost"`
		FiveHourOldestMs *int64  `json:"five_hour_oldest_ms"`
		AnchorMs         *int64  `json:"anchor_ms"`
	}

	var rows []PrimaryRow
	if err := json.Unmarshal([]byte(res), &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("no primary window data returned")
	}

	row := rows[0]
	fiveHourRemaining := percentRemaining(row.FiveHourCost, fiveHourLimit)
	weeklyRemaining := percentRemaining(row.WeeklyCost, weeklyLimit)

	// If there are older messages (AnchorMs != nil) but no recent activity (weekly cost = 0),
	// the user is likely not subscribed anymore — mark as exhausted.
	notSubscribed := row.AnchorMs != nil && weeklyRemaining == 100 && row.WeeklyCost == 0

	weekEnd := startOfWeekUTC(now).Add(7 * 24 * time.Hour)
	weekDur := time.Until(weekEnd)
	weeklyResetText := "weekly"
	if weekDur > 0 {
		if notSubscribed {
			weeklyResetText = fmt.Sprintf("Exhausted — %s", formatDuration(weekDur))
		} else {
			weeklyResetText = fmt.Sprintf("Resets in %s", formatDuration(weekDur))
		}
	}

	fiveHourResetText := fmt.Sprintf("5-hour rolling ($%.2f / $%.2f)", row.FiveHourCost, fiveHourLimit)
	weeklyResetText += fmt.Sprintf(" ($%.2f / $%.2f)", row.WeeklyCost, weeklyLimit)

	quotas := []Quota{
		{
			QuotaType:        QuotaTypeSession,
			PercentRemaining: fiveHourRemaining,
			ResetText:        fiveHourResetText,
			IsExhausted:      notSubscribed,
		},
		{
			QuotaType:        QuotaTypeWeekly,
			PercentRemaining: weeklyRemaining,
			ResetText:        weeklyResetText,
			IsExhausted:      notSubscribed,
		},
	}

	// Calculate monthly if anchor exists
	if row.AnchorMs != nil {
		anchorTime := time.Unix(0, *row.AnchorMs*1e6)
		mStart, mEnd := anchoredMonthBounds(now, anchorTime)
		mStartMs := mStart.UnixNano() / 1e6
		mEndMs := mEnd.UnixNano() / 1e6

		monthlySQL := fmt.Sprintf(`
			SELECT COALESCE(SUM(cost), 0) AS monthly_cost
			FROM (%s)
			WHERE t >= %d AND t < %d
		`, subQuery, mStartMs, mEndMs)

		mRes, err := s.repo.QueryLocalDB(ctx, env, monthlySQL)
		if err == nil {
			type MonthlyRow struct {
				MonthlyCost float64 `json:"monthly_cost"`
			}
			var mRows []MonthlyRow
			if err := json.Unmarshal([]byte(mRes), &mRows); err == nil && len(mRows) > 0 {
				mRemaining := percentRemaining(mRows[0].MonthlyCost, monthlyLimit)
				mDur := time.Until(mEnd)
				monthlyResetText := "monthly"
				if mDur > 0 {
					if notSubscribed {
						monthlyResetText = fmt.Sprintf("Exhausted — %s", formatDuration(mDur))
					} else {
						monthlyResetText = fmt.Sprintf("Resets in %s", formatDuration(mDur))
					}
				}
				monthlyResetText += fmt.Sprintf(" ($%.2f / $%.2f)", mRows[0].MonthlyCost, monthlyLimit)

				quotas = append(quotas, Quota{
					QuotaType:        QuotaTypeMonthly,
					PercentRemaining: mRemaining,
					ResetText:        monthlyResetText,
					ResetsAt:         &mEnd,
					IsExhausted:      notSubscribed,
				})
			}
		}
	}

	return quotas, nil
}

func (s *Service) probeCodex(ctx context.Context, env map[string]string) ([]Quota, error) {
	// First, check login status. If not logged in, we shouldn't attempt RPC because
	// it might return a dummy/offline quota instead of an error.
	out, err := s.repo.RunCLICommand(ctx, env, "codex", "login", "status")
	if err != nil {
		return nil, fmt.Errorf("not logged in")
	}

	if !strings.Contains(strings.ToLower(out), "logged in") && !strings.Contains(strings.ToLower(out), "chatgpt") {
		return nil, fmt.Errorf("not logged in")
	}

	// Try querying Codex via JSON-RPC over stdin/stdout
	rpcQuotas, err := s.probeCodexRPC(ctx, env)
	if err == nil && len(rpcQuotas) > 0 {
		return rpcQuotas, nil
	}

	// If RPC fails but we are logged in, return a placeholder for the 5h window.
	return []Quota{
		{
			QuotaType:        QuotaTypeFiveHour,
			PercentRemaining: 100.0,
			ResetText:        "Active",
		},
	}, nil
}

func parseCodexError(err error, output string) string {
	combined := err.Error() + " " + stripAnsi(output)
	lowerCombined := strings.ToLower(combined)

	if strings.Contains(lowerCombined, "not logged in") ||
		strings.Contains(lowerCombined, "logged out") ||
		strings.Contains(lowerCombined, "unauthenticated") {
		return "Not logged in (please run 'qmon login codex' in terminal)."
	}
	return "Failed to parse Codex status: " + combined
}

// Helpers

func stripAnsi(str string) string {
	ansi := regexp.MustCompile(`\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])`)
	return ansi.ReplaceAllString(str, "")
}

func percentRemaining(used, limit float64) float64 {
	if limit <= 0 {
		return 100
	}
	rem := ((limit - used) / limit) * 100
	if rem < 0 {
		return 0
	}
	if rem > 100 {
		return 100
	}
	return rem
}

func startOfWeekUTC(t time.Time) time.Time {
	t = t.UTC()
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	daysToSubtract := weekday - 1
	return time.Date(t.Year(), t.Month(), t.Day()-daysToSubtract, 0, 0, 0, 0, time.UTC)
}

func anchoredMonthBounds(now, anchor time.Time) (time.Time, time.Time) {
	now = now.UTC()
	anchor = anchor.UTC()

	// Preserving day-of-month
	day := anchor.Day()
	start := time.Date(now.Year(), now.Month(), day, anchor.Hour(), anchor.Minute(), anchor.Second(), 0, time.UTC)

	if start.After(now) {
		start = start.AddDate(0, -1, 0)
	}

	end := start.AddDate(0, 1, 0)
	return start, end
}

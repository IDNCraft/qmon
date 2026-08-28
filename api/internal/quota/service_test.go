package quota

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type mockRepository struct {
	CheckCLIAvailableFunc func(ctx context.Context, command string) bool
	RunCLICommandFunc     func(ctx context.Context, env map[string]string, name string, args ...string) (string, error)
	QueryLocalDBFunc      func(ctx context.Context, env map[string]string, sqlQuery string) (string, error)
}

func (m *mockRepository) CheckCLIAvailable(ctx context.Context, command string) bool {
	if m.CheckCLIAvailableFunc != nil {
		return m.CheckCLIAvailableFunc(ctx, command)
	}
	return true
}

func (m *mockRepository) RunCLICommand(ctx context.Context, env map[string]string, name string, args ...string) (string, error) {
	if m.RunCLICommandFunc != nil {
		return m.RunCLICommandFunc(ctx, env, name, args...)
	}
	return "", nil
}

func (m *mockRepository) QueryLocalDB(ctx context.Context, env map[string]string, sqlQuery string) (string, error) {
	if m.QueryLocalDBFunc != nil {
		return m.QueryLocalDBFunc(ctx, env, sqlQuery)
	}
	return "", nil
}

func TestParseClaudeOutput(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		expectError bool
		errorMsg    string
		expectQuota []Quota
	}{
		{
			name:        "Subscription Required Warning",
			input:       "Error: /usage is only available for subscription plans.",
			expectError: true,
			errorMsg:    "subscription required",
		},
		{
			name:        "Using Subscription",
			input:       "You are currently using your subscription to power your Claude Code usage",
			expectError: false,
			expectQuota: []Quota{
				{
					QuotaType:        QuotaTypeSession,
					PercentRemaining: 100.0,
					ResetText:        "subscription active",
				},
			},
		},
		{
			name: "Session and Weekly Quotas",
			input: `Current session: 80% remaining.
Current week (all models): 65% remaining.`,
			expectError: false,
			expectQuota: []Quota{
				{
					QuotaType:        QuotaTypeSession,
					PercentRemaining: 80.0,
					ResetText:        "resets shortly",
				},
				{
					QuotaType:        QuotaTypeWeekly,
					PercentRemaining: 65.0,
					ResetText:        "resets weekly",
				},
			},
		},
		{
			name: "Session, Weekly, and Model Specific Quotas with Resets",
			input: `Current session: 80% remaining.
Resets in 15m.
Current week (all models): 65% remaining.
Resets tomorrow.
Current week (Opus): 50% remaining.
Current week (Sonnet only): 70% remaining.`,
			expectError: false,
			expectQuota: []Quota{
				{
					QuotaType:        QuotaTypeSession,
					PercentRemaining: 80.0,
					ResetText:        "Resets in 15m.",
				},
				{
					QuotaType:        QuotaTypeWeekly,
					PercentRemaining: 65.0,
					ResetText:        "Resets tomorrow.",
				},
				{
					QuotaType:        QuotaTypeModelSpecific,
					PercentRemaining: 50.0,
					ResetText:        "resets weekly",
					ModelKey:         "opus",
				},
				{
					QuotaType:        QuotaTypeModelSpecific,
					PercentRemaining: 70.0,
					ResetText:        "resets weekly",
					ModelKey:         "sonnet",
				},
			},
		},
		{
			name:        "Rate Limited Output",
			input:       "Error: Usage endpoint is rate limited. Please try again in a moment.",
			expectError: true,
			errorMsg:    "rate limited",
		},
		{
			name:        "Empty or Invalid Output",
			input:       "invalid output here",
			expectError: true,
			errorMsg:    "could not parse any quota from Claude output",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			quotas, err := parseClaudeOutput(tc.input)
			if tc.expectError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if !strings.Contains(err.Error(), tc.errorMsg) {
					t.Errorf("expected error containing %q, got %q", tc.errorMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(quotas) != len(tc.expectQuota) {
					t.Fatalf("expected %d quotas, got %d", len(tc.expectQuota), len(quotas))
				}
				for i, q := range quotas {
					expected := tc.expectQuota[i]
					if q.QuotaType != expected.QuotaType {
						t.Errorf("at index %d: expected type %v, got %v", i, expected.QuotaType, q.QuotaType)
					}
					if q.PercentRemaining != expected.PercentRemaining {
						t.Errorf("at index %d: expected percent %v, got %v", i, expected.PercentRemaining, q.PercentRemaining)
					}
					if q.ResetText != expected.ResetText {
						t.Errorf("at index %d: expected reset text %v, got %v", i, expected.ResetText, q.ResetText)
					}
				}
			}
		})
	}
}

func TestAntigravitySubscriptionExpired(t *testing.T) {
	tests := []struct {
		name     string
		paidTier *cloudCodeTier
		expected bool
	}{
		{
			name:     "free tier",
			paidTier: &cloudCodeTier{ID: "free-tier"},
			expected: true,
		},
		{
			name:     "paid tier",
			paidTier: &cloudCodeTier{ID: "g1-pro-tier"},
			expected: false,
		},
		{
			name:     "missing tier",
			expected: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			loadResp := cloudCodeLoadResponse{PaidTier: test.paidTier}
			if got := antigravitySubscriptionExpired(loadResp); got != test.expected {
				t.Fatalf("expected subscription expired=%t, got %t", test.expected, got)
			}
		})
	}
}

func TestProbeClaude(t *testing.T) {
	tests := []struct {
		name        string
		statusOut   string
		statusErr   error
		usageOut    string
		usageErr    error
		expectError bool
		errorMsg    string
		expectQuota []Quota
	}{
		{
			name:        "Logged Out",
			statusOut:   `{"loggedIn": false, "authMethod": "none"}`,
			statusErr:   errors.New("exit status 1"),
			expectError: true,
			errorMsg:    "not logged in",
		},
		{
			name:        "Logged in via API Key",
			statusOut:   `{"loggedIn": true, "authMethod": "api_key"}`,
			statusErr:   nil,
			expectError: false,
			expectQuota: []Quota{
				{
					QuotaType:        QuotaTypeSession,
					PercentRemaining: 100.0,
					ResetText:        "API Key active",
				},
			},
		},
		{
			name:      "Logged in via OAuth with valid usage",
			statusOut: `{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro"}`,
			statusErr: nil,
			usageOut: `Current session: 75% remaining.
Current week (all models): 50% remaining.`,
			usageErr:    nil,
			expectError: false,
			expectQuota: []Quota{
				{
					QuotaType:        QuotaTypeSession,
					PercentRemaining: 75.0,
					ResetText:        "resets shortly",
				},
				{
					QuotaType:        QuotaTypeWeekly,
					PercentRemaining: 50.0,
					ResetText:        "resets weekly",
				},
			},
		},
		{
			name:        "Logged in via OAuth rate limited",
			statusOut:   `{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro"}`,
			statusErr:   nil,
			usageOut:    "Error: Usage endpoint is rate limited.",
			usageErr:    nil,
			expectError: true,
			errorMsg:    "rate limited",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockRepo := &mockRepository{
				RunCLICommandFunc: func(ctx context.Context, env map[string]string, name string, args ...string) (string, error) {
					if name == "claude" && len(args) > 1 && args[0] == "auth" && args[1] == "status" {
						return tc.statusOut, tc.statusErr
					}
					if name == "claude" && len(args) > 0 && args[0] == "/usage" {
						return tc.usageOut, tc.usageErr
					}
					return "", nil
				},
			}
			service := NewService(mockRepo, nil)
			quotas, err := service.probeClaude(context.Background(), nil)
			if tc.expectError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if !strings.Contains(err.Error(), tc.errorMsg) {
					t.Errorf("expected error containing %q, got %q", tc.errorMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(quotas) != len(tc.expectQuota) {
					t.Fatalf("expected %d quotas, got %d", len(tc.expectQuota), len(quotas))
				}
				for i, q := range quotas {
					expected := tc.expectQuota[i]
					if q.QuotaType != expected.QuotaType {
						t.Errorf("expected type %v, got %v", expected.QuotaType, q.QuotaType)
					}
					if q.PercentRemaining != expected.PercentRemaining {
						t.Errorf("expected percent %v, got %v", expected.PercentRemaining, q.PercentRemaining)
					}
					if q.ResetText != expected.ResetText {
						t.Errorf("expected reset text %v, got %v", expected.ResetText, q.ResetText)
					}
				}
			}
		})
	}
}

func TestParseClaudeError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		output   string
		expected string
	}{
		{
			name:     "Rate Limited Error",
			err:      errors.New("CLI exec failed"),
			output:   "Error: Usage endpoint is rate limited. Please try again in a moment.",
			expected: "Rate limited (please try again in a moment).",
		},
		{
			name:     "Subscription Required Error",
			err:      errors.New("CLI exec failed"),
			output:   "/usage is only available for subscription plans",
			expected: "Subscription required.",
		},
		{
			name:     "Login Error",
			err:      errors.New("CLI exec failed"),
			output:   "Please run 'claude login' to authenticate",
			expected: "Not logged in (please run 'qmon login claude' in terminal).",
		},
		{
			name:     "API Key Error",
			err:      errors.New("CLI exec failed"),
			output:   "invalid api key format",
			expected: "API Key not set or invalid.",
		},
		{
			name:     "Generic Error",
			err:      errors.New("some system error"),
			output:   "unexpected error detail",
			expected: "Failed to parse Claude quota: some system error unexpected error detail",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := parseClaudeError(tc.err, tc.output)
			if res != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, res)
			}
		})
	}
}

func TestParseCodexError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		output   string
		expected string
	}{
		{
			name:     "Not Logged In Error",
			err:      errors.New("CLI exec failed"),
			output:   "Error: Not logged in. Please run 'codex login' to authenticate.",
			expected: "Not logged in (please run 'qmon login codex' in terminal).",
		},
		{
			name:     "Generic Codex Error",
			err:      errors.New("CLI exec failed"),
			output:   "some unexpected error message",
			expected: "Failed to parse Codex status: CLI exec failed some unexpected error message",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := parseCodexError(tc.err, tc.output)
			if res != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, res)
			}
		})
	}
}

func TestProbeCodex(t *testing.T) {
	tests := []struct {
		name        string
		statusOut   string
		statusErr   error
		expectError bool
		errorMsg    string
		expectQuota []Quota
	}{
		{
			name:        "Logged Out",
			statusOut:   "Not logged in",
			statusErr:   errors.New("exit status 1"),
			expectError: true,
			errorMsg:    "not logged in",
		},
		{
			name:        "Logged in via ChatGPT",
			statusOut:   "Logged in using ChatGPT",
			statusErr:   nil,
			expectError: false,
			expectQuota: []Quota{
				{
					QuotaType:        QuotaTypeFiveHour,
					PercentRemaining: 100.0,
					ResetText:        "Active",
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockRepo := &mockRepository{
				RunCLICommandFunc: func(ctx context.Context, env map[string]string, name string, args ...string) (string, error) {
					if name == "codex" && len(args) > 1 && args[0] == "login" && args[1] == "status" {
						return tc.statusOut, tc.statusErr
					}
					return "", nil
				},
			}
			service := NewService(mockRepo, nil)
			service.runRPCCommand = func(ctx context.Context, env map[string]string, name string, args ...string) (*exec.Cmd, error) {
				return nil, fmt.Errorf("mock rpc command disabled in test")
			}
			quotas, err := service.probeCodex(context.Background(), nil)
			if tc.expectError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if !strings.Contains(err.Error(), tc.errorMsg) {
					t.Errorf("expected error containing %q, got %q", tc.errorMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(quotas) != len(tc.expectQuota) {
					t.Fatalf("expected %d quotas, got %d", len(tc.expectQuota), len(quotas))
				}
				for i, q := range quotas {
					expected := tc.expectQuota[i]
					if q.QuotaType != expected.QuotaType {
						t.Errorf("expected type %v, got %v", expected.QuotaType, q.QuotaType)
					}
					if q.PercentRemaining != expected.PercentRemaining {
						t.Errorf("expected percent %v, got %v", expected.PercentRemaining, q.PercentRemaining)
					}
					if q.ResetText != expected.ResetText {
						t.Errorf("expected reset text %v, got %v", expected.ResetText, q.ResetText)
					}
				}
			}
		})
	}
}

func TestProbeCodexRPCSuccess(t *testing.T) {
	tests := []struct {
		name         string
		planType     string
		expectedType QuotaType
	}{
		{"Free plan maps primary to session", "free", QuotaTypeSession},
		{"Paid plan maps primary to 5h", "paid", QuotaTypeFiveHour},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			mockRepo := &mockRepository{
				RunCLICommandFunc: func(ctx context.Context, env map[string]string, name string, args ...string) (string, error) {
					if name == "codex" && len(args) > 1 && args[0] == "login" && args[1] == "status" {
						return "Logged in using ChatGPT", nil
					}
					return "", nil
				},
			}
			service := NewService(mockRepo, nil)

			service.runRPCCommand = func(ctx context.Context, env map[string]string, name string, args ...string) (*exec.Cmd, error) {
				if name != "codex" || len(args) != 5 || args[0] != "-s" || args[1] != "read-only" || args[2] != "-a" || args[3] != "never" || args[4] != "app-server" {
					t.Fatalf("unexpected Codex app-server command: %s %v", name, args)
				}
				cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=TestHelperRPCProcess")
				cmd.Env = append(os.Environ(), "GO_WANT_HELPER_PROCESS=1", "CODEX_TEST_PLAN_TYPE="+tc.planType)
				return cmd, nil
			}

			quotas, err := service.probeCodex(context.Background(), nil)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(quotas) != 2 {
				t.Fatalf("expected 2 quotas, got %d", len(quotas))
			}

			if quotas[0].QuotaType != tc.expectedType {
				t.Errorf("expected %s quota type, got %s", tc.expectedType, quotas[0].QuotaType)
			}

			if quotas[0].PercentRemaining != 40.0 {
				t.Errorf("expected 40%% remaining, got %v", quotas[0].PercentRemaining)
			}

			if quotas[1].QuotaType != QuotaTypeWeekly {
				t.Errorf("expected weekly quota type, got %s", quotas[1].QuotaType)
			}

			if quotas[1].PercentRemaining != 80.0 {
				t.Errorf("expected 80%% remaining, got %v", quotas[1].PercentRemaining)
			}
		})
	}
}

func TestProbeOpenCodeNoSubscriptionIsExhausted(t *testing.T) {
	configDir := t.TempDir()
	authDir := filepath.Join(configDir, "opencode")
	if err := os.MkdirAll(authDir, 0755); err != nil {
		t.Fatalf("failed to create auth directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(authDir, "auth.json"), []byte(`{"opencode":{"type":"api","key":"test"}}`), 0600); err != nil {
		t.Fatalf("failed to write auth file: %v", err)
	}

	mockRepo := &mockRepository{
		QueryLocalDBFunc: func(ctx context.Context, env map[string]string, sqlQuery string) (string, error) {
			if strings.Contains(sqlQuery, "monthly_cost") {
				return `[{"monthly_cost":0}]`, nil
			}
			return `[{"five_hour_cost":0,"weekly_cost":0,"five_hour_oldest_ms":null,"anchor_ms":1700000000000}]`, nil
		},
	}
	service := NewService(mockRepo, nil)

	quotas, err := service.probeOpenCode(context.Background(), time.Now(), configDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(quotas) != 3 {
		t.Fatalf("expected 3 quotas, got %d", len(quotas))
	}
	if quotas[0].QuotaType != QuotaTypeFiveHour {
		t.Errorf("expected 5h quota type, got %s", quotas[0].QuotaType)
	}

	for _, quota := range quotas {
		if quota.PercentRemaining != 0 {
			t.Errorf("expected 0%% remaining for %s, got %v", quota.QuotaType, quota.PercentRemaining)
		}
		if !quota.IsExhausted {
			t.Errorf("expected %s quota exhausted", quota.QuotaType)
		}
	}
}

func TestProbeOpenCodeNoHistoryIsAvailable(t *testing.T) {
	configDir := t.TempDir()
	authDir := filepath.Join(configDir, "opencode")
	if err := os.MkdirAll(authDir, 0755); err != nil {
		t.Fatalf("failed to create auth directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(authDir, "auth.json"), []byte(`{"opencode":{"type":"api","key":"test"}}`), 0600); err != nil {
		t.Fatalf("failed to write auth file: %v", err)
	}

	mockRepo := &mockRepository{
		QueryLocalDBFunc: func(ctx context.Context, env map[string]string, sqlQuery string) (string, error) {
			return `[{"five_hour_cost":0,"weekly_cost":0,"five_hour_oldest_ms":null,"anchor_ms":null}]`, nil
		},
	}
	service := NewService(mockRepo, nil)

	quotas, err := service.probeOpenCode(context.Background(), time.Now(), configDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(quotas) != 2 {
		t.Fatalf("expected 2 quotas, got %d", len(quotas))
	}

	for _, quota := range quotas {
		if quota.PercentRemaining != 100 {
			t.Errorf("expected 100%% remaining for %s, got %v", quota.QuotaType, quota.PercentRemaining)
		}
		if quota.IsExhausted {
			t.Errorf("expected %s quota not exhausted", quota.QuotaType)
		}
	}
}

func TestProbeOpenCodeLimitReachedIsExhausted(t *testing.T) {
	configDir := t.TempDir()
	authDir := filepath.Join(configDir, "opencode")
	if err := os.MkdirAll(authDir, 0755); err != nil {
		t.Fatalf("failed to create auth directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(authDir, "auth.json"), []byte(`{"opencode":{"type":"api","key":"test"}}`), 0600); err != nil {
		t.Fatalf("failed to write auth file: %v", err)
	}

	mockRepo := &mockRepository{
		QueryLocalDBFunc: func(ctx context.Context, env map[string]string, sqlQuery string) (string, error) {
			if strings.Contains(sqlQuery, "monthly_cost") {
				return `[{"monthly_cost":60}]`, nil
			}
			return `[{"five_hour_cost":12,"weekly_cost":30,"five_hour_oldest_ms":1700000000000,"anchor_ms":1700000000000}]`, nil
		},
	}
	service := NewService(mockRepo, nil)

	quotas, err := service.probeOpenCode(context.Background(), time.Now(), configDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(quotas) != 3 {
		t.Fatalf("expected 3 quotas, got %d", len(quotas))
	}

	for _, quota := range quotas {
		if quota.PercentRemaining != 0 {
			t.Errorf("expected 0%% remaining for %s, got %v", quota.QuotaType, quota.PercentRemaining)
		}
		if !quota.IsExhausted {
			t.Errorf("expected %s quota exhausted", quota.QuotaType)
		}
	}
}

// TestHelperRPCProcess is the helper process that acts as the Codex RPC server
func TestHelperRPCProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	defer os.Exit(0)

	scanner := bufio.NewScanner(os.Stdin)

	// 1. Read initialize
	if !scanner.Scan() {
		return
	}
	// Write response
	fmt.Println(`{"id":1,"result":{"userAgent":"test","codexHome":"/tmp","platformFamily":"unix","platformOs":"macos"}}`)

	// 2. Read initialized notification
	if !scanner.Scan() {
		return
	}

	// 3. Read account/rateLimits/read request
	if !scanner.Scan() {
		return
	}
	// Write rate limits response with 60% primary usage and 20% secondary usage.
	planType := os.Getenv("CODEX_TEST_PLAN_TYPE")
	if planType == "" {
		planType = "free"
	}
	response := fmt.Sprintf(`{"id":2,"result":{"rateLimits":{"limitId":"codex","primary":{"usedPercent":60,"windowDurationMins":300,"resetsAt":1784475797},"secondary":{"usedPercent":20,"windowDurationMins":10080,"resetsAt":1785080597},"planType":"%s"}}}`, planType)
	fmt.Println(response)
}

func TestParseClaudeCostOutput(t *testing.T) {
	input := `
Total cost:            $0.1234
Total duration (API):  5m 10s
Total duration (wall): 1h 30m
`
	quotas, err := parseClaudeCostOutput(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(quotas) != 1 {
		t.Fatalf("expected 1 quota, got %d", len(quotas))
	}

	if quotas[0].QuotaType != QuotaTypeSession {
		t.Errorf("expected session quota, got %s", quotas[0].QuotaType)
	}

	if quotas[0].PercentRemaining != 100.0 {
		t.Errorf("expected 100%% remaining, got %v", quotas[0].PercentRemaining)
	}

	if quotas[0].ResetText != "Total cost: $0.1234" {
		t.Errorf("expected reset text 'Total cost: $0.1234', got %q", quotas[0].ResetText)
	}
}

func TestProbeCopilotSuccess(t *testing.T) {
	t.Setenv("COPILOT_TOKEN", "mock-token-value")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer mock-token-value" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
			"copilot_plan": "Pro",
			"quota_reset_date": "2026-08-01",
			"quota_snapshots": {
				"premium_interactions": {
					"entitlement": 500,
					"percent_remaining": 80.0,
					"remaining": 400,
					"unlimited": false
				}
			}
		}`))
	}))
	defer server.Close()

	mockRepo := &mockRepository{}
	service := NewService(mockRepo, nil)
	service.githubAPIBaseURL = server.URL

	quotas, err := service.probeCopilot(context.Background(), "mock-token-value")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(quotas) != 1 {
		t.Fatalf("expected 1 quota, got %d", len(quotas))
	}

	q := quotas[0]
	if q.QuotaType != QuotaTypeMonthly {
		t.Errorf("expected monthly quota, got %s", q.QuotaType)
	}

	if q.PercentRemaining != 80.0 {
		t.Errorf("expected 80%% remaining, got %v", q.PercentRemaining)
	}

	if q.ResetText != "100/500 AI credits (Resets on 2026-08-01)" {
		t.Errorf("expected reset text '100/500 AI credits (Resets on 2026-08-01)', got %q", q.ResetText)
	}
}

func TestProbeCopilotKeychainSuccess(t *testing.T) {
	t.Setenv("COPILOT_TOKEN", "")
	t.Setenv("GITHUB_TOKEN", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer mock-keychain-token-value" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
			"copilot_plan": "Pro",
			"quota_reset_date": "2026-08-01",
			"quota_snapshots": {
				"premium_interactions": {
					"entitlement": 500,
					"percent_remaining": 80.0,
					"remaining": 400,
					"unlimited": false
				}
			}
		}`))
	}))
	defer server.Close()

	mockRepo := &mockRepository{
		RunCLICommandFunc: func(ctx context.Context, env map[string]string, name string, args ...string) (string, error) {
			if name == "gh" && len(args) >= 2 && args[0] == "auth" && args[1] == "token" {
				return "mock-keychain-token-value\n", nil
			}
			return "", fmt.Errorf("command not mocked")
		},
	}
	service := NewService(mockRepo, nil)
	service.githubAPIBaseURL = server.URL

	quotas, err := service.probeCopilot(context.Background(), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(quotas) != 1 {
		t.Fatalf("expected 1 quota, got %d", len(quotas))
	}

	q := quotas[0]
	if q.PercentRemaining != 80.0 {
		t.Errorf("expected 80%% remaining, got %v", q.PercentRemaining)
	}
}

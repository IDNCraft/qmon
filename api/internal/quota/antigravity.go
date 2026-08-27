package quota

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	antigravityClientID     = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
	antigravityClientSecret = "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"
	antigravityTokenURL     = "https://oauth2.googleapis.com/token"
)

// Request payloads for Google Cloud Code API
type cloudCodeLoadRequest struct {
	Metadata struct {
		IDEType    string `json:"ideType"`
		Platform   string `json:"platform"`
		PluginType string `json:"pluginType"`
	} `json:"metadata"`
}

type cloudCodeFetchModelsRequest struct {
	Project string `json:"project"`
}

// Response payloads
type cloudCodeLoadResponse struct {
	CloudaicompanionProject interface{}    `json:"cloudaicompanionProject"` // Can be string or {id: string}
	PaidTier                *cloudCodeTier `json:"paidTier"`
}

type cloudCodeTier struct {
	ID string `json:"id"`
}

type cloudCodeModelInfo struct {
	Label     string `json:"label"`
	QuotaInfo *struct {
		RemainingFraction *float64 `json:"remainingFraction"`
		ResetTime         string   `json:"resetTime"`
		IsExhausted       *bool    `json:"isExhausted"`
	} `json:"quotaInfo"`
}

type cloudCodeFetchModelsResponse struct {
	Models map[string]cloudCodeModelInfo `json:"models"`
}

type oauthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

func antigravitySubscriptionExpired(loadResp cloudCodeLoadResponse) bool {
	return loadResp.PaidTier != nil && strings.EqualFold(loadResp.PaidTier.ID, "free-tier")
}

func (s *Service) refreshAntigravityToken(ctx context.Context, refreshToken string, accountName string, userID int) (string, error) {
	formData := url.Values{}
	formData.Set("client_id", antigravityClientID)
	formData.Set("client_secret", antigravityClientSecret)
	formData.Set("refresh_token", refreshToken)
	formData.Set("grant_type", "refresh_token")

	req, err := http.NewRequestWithContext(ctx, "POST", antigravityTokenURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("failed to refresh token (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp oauthTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("received empty access token on refresh")
	}

	// If Google returned a new refresh token, use it; otherwise keep the old one
	newRefresh := tokenResp.RefreshToken
	if newRefresh == "" {
		newRefresh = refreshToken
	}
	tokenResp.RefreshToken = newRefresh // Keep it in the JSON

	// Update in DB (user_id = 0 for global provider)
	newTokenJSON, _ := json.Marshal(tokenResp)
	if accountName == "" {
		accountName = "Default"
	}
	if err := s.credRepo.SaveCredential(userID, "antigravity", accountName, string(newTokenJSON)); err != nil {
		return "", fmt.Errorf("failed to save refreshed token: %w", err)
	}

	return tokenResp.AccessToken, nil
}

func (s *Service) queryCloudCodeAPI(ctx context.Context, endpoint string, token string, body interface{}, responseObj interface{}) error {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return err
	}

	url := "https://cloudcode-pa.googleapis.com" + endpoint
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "antigravity")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return fmt.Errorf("unauthorized")
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	return json.NewDecoder(resp.Body).Decode(responseObj)
}

func (s *Service) probeAntigravity(ctx context.Context, tokenStr string, accountName string, userID int) ([]Quota, error) {
	if tokenStr == "" {
		return nil, fmt.Errorf("Not logged in (please run 'qmon login antigravity' in terminal)")
	}

	var creds oauthTokenResponse
	if err := json.Unmarshal([]byte(tokenStr), &creds); err != nil {
		return nil, fmt.Errorf("invalid credential format in database")
	}

	token := creds.AccessToken

	// 2. Load Code Assist (try once, if unauthorized, refresh token and retry)
	var loadReq cloudCodeLoadRequest
	loadReq.Metadata.IDEType = "ANTIGRAVITY"
	loadReq.Metadata.PluginType = "GEMINI"
	loadReq.Metadata.Platform = "PLATFORM_UNSPECIFIED"

	var loadResp cloudCodeLoadResponse
	err := s.queryCloudCodeAPI(ctx, "/v1internal:loadCodeAssist", token, loadReq, &loadResp)
	if err != nil && strings.Contains(err.Error(), "unauthorized") {
		// Refresh token
		token, err = s.refreshAntigravityToken(ctx, creds.RefreshToken, accountName, userID)
		if err != nil {
			return nil, fmt.Errorf("Session expired. Please run 'qmon login antigravity' in terminal.")
		}
		// Retry
		err = s.queryCloudCodeAPI(ctx, "/v1internal:loadCodeAssist", token, loadReq, &loadResp)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to load code assist: %w", err)
	}
	subscriptionExpired := antigravitySubscriptionExpired(loadResp)

	// 3. Extract Project ID
	var projectID string
	if loadResp.CloudaicompanionProject != nil {
		switch v := loadResp.CloudaicompanionProject.(type) {
		case string:
			projectID = v
		case map[string]interface{}:
			if id, ok := v["id"].(string); ok {
				projectID = id
			}
		}
	}

	if projectID == "" {
		return nil, fmt.Errorf("could not determine Cloud Code project ID")
	}

	// 4. Fetch Available Models
	var modelsReq cloudCodeFetchModelsRequest
	modelsReq.Project = projectID

	var modelsResp cloudCodeFetchModelsResponse
	err = s.queryCloudCodeAPI(ctx, "/v1internal:fetchAvailableModels", token, modelsReq, &modelsResp)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch models: %w", err)
	}

	// 5. Parse Quotas
	var quotas []Quota

	// Daftar model yang ingin ditampilkan sesuai UI IDE (gambar dari user)
	allowedModels := map[string]string{
		"gemini-3.5-flash-medium":    "Gemini",
		"gemini-3.5-flash":           "Gemini",
		"gemini-3.5-flash-high":      "Gemini",
		"gemini-3.5-flash-low":       "Gemini",
		"gemini-3.1-pro-low":         "Gemini",
		"gemini-3.1-pro-high":        "Gemini",
		"claude-sonnet-4-6":          "Claude",
		"claude-sonnet-4-6-thinking": "Claude",
		"claude-opus-4-6-thinking":   "Claude",
		"gpt-oss-120b-medium":        "GPT",
	}

	// Temporary map to hold the best quota per model AND type (session or weekly)
	type bestQuota struct {
		pct         float64
		resetText   string
		resetAt     *time.Time
		isExhausted bool
		dur         time.Duration
	}
	// Key will be "ModelName (Session)" or "ModelName (Weekly)"
	bestQuotas := make(map[string]bestQuota)

	for modelID, modelInfo := range modelsResp.Models {
		if modelInfo.QuotaInfo == nil {
			continue
		}

		friendlyName, isAllowed := allowedModels[modelID]
		if !isAllowed {
			continue // Skip model yang tidak ada di daftar
		}

		isExhausted := subscriptionExpired || modelInfo.QuotaInfo.RemainingFraction == nil

		pct := 100.0
		if modelInfo.QuotaInfo.RemainingFraction != nil && !subscriptionExpired {
			pct = *modelInfo.QuotaInfo.RemainingFraction * 100.0
		} else if isExhausted {
			pct = 0.0
		}

		resetText := "Quota available"
		if subscriptionExpired {
			resetText = "Exhausted"
		} else if isExhausted {
			resetText = "Exhausted"
		}
		var resetAtTime *time.Time
		var dur time.Duration
		if modelInfo.QuotaInfo.ResetTime != "" {
			resetTime, parseErr := time.Parse(time.RFC3339, modelInfo.QuotaInfo.ResetTime)
			if parseErr == nil {
				resetAtTime = &resetTime
				dur = time.Until(resetTime)
				if dur > 0 {
					if subscriptionExpired {
						resetText = fmt.Sprintf("Exhausted — %s", formatDuration(dur))
					} else if isExhausted {
						resetText = fmt.Sprintf("Exhausted — %s", formatDuration(dur))
					} else {
						resetText = fmt.Sprintf("Refreshes in %s", formatDuration(dur))
					}
				}
			}
		}

		if dur <= 0 {
			dur = 999 * 24 * time.Hour // if no valid duration, deprioritize it
		}

		// Classify as Session or Weekly
		quotaType := "session"
		if dur > 24*time.Hour {
			quotaType = "weekly"
		}

		// The key for grouping is now friendlyName + quotaType
		groupKey := friendlyName + "|" + quotaType

		// Save if it's the first one in this group, or if it has a shorter duration
		existing, exists := bestQuotas[groupKey]
		if !exists || dur < existing.dur {
			bestQuotas[groupKey] = bestQuota{
				pct:         pct,
				resetText:   resetText,
				resetAt:     resetAtTime,
				isExhausted: isExhausted,
				dur:         dur,
			}
		}
	}

	for groupKey, bq := range bestQuotas {
		parts := strings.Split(groupKey, "|")
		modelName := parts[0]
		qType := parts[1]

		quotas = append(quotas, Quota{
			QuotaType:        QuotaType(qType),
			PercentRemaining: bq.pct,
			ResetText:        bq.resetText,
			ResetsAt:         bq.resetAt,
			ModelKey:         modelName,
			IsExhausted:      bq.isExhausted,
		})
	}

	if len(quotas) == 0 {
		return nil, fmt.Errorf("no quota information found in Cloud Code API")
	}

	return quotas, nil
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	dDays := d / (24 * time.Hour)
	d -= dDays * 24 * time.Hour
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	if dDays > 0 {
		return fmt.Sprintf("%dd %dh %dm", dDays, h, m)
	}
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

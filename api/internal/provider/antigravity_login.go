package provider

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

const (
	antigravityClientID     = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
	antigravityClientSecret = "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"
	antigravityRedirectURI  = "http://127.0.0.1:58394/callback"
	antigravityTokenURL     = "https://oauth2.googleapis.com/token"
)

// InitiateAntigravityLoginRequest represents the payload for initiating the login.
type InitiateAntigravityLoginRequest struct {
	AccountName string `json:"account_name"`
}

// InitiateAntigravityLogin returns the Google OAuth URL for manual login.
func (h *Handler) InitiateAntigravityLogin(c *gin.Context) {
	var req InitiateAntigravityLoginRequest
	c.ShouldBindJSON(&req) // Ignore error, account_name is optional

	// Generate random state
	state := "qmon" + fmt.Sprintf("%d", c.GetInt("user_id"))

	authURL := fmt.Sprintf("https://accounts.google.com/o/oauth2/v2/auth?"+
		"client_id=%s&"+
		"redirect_uri=%s&"+
		"response_type=code&"+
		"scope=%s&"+
		"access_type=offline&"+
		"prompt=select_account+consent&"+
		"state=%s",
		url.QueryEscape(antigravityClientID),
		url.QueryEscape(antigravityRedirectURI),
		url.QueryEscape("https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email"),
		url.QueryEscape(state))

	// If account_name looks like a Gmail prefix, hint Google to pre-select it
	if req.AccountName != "" && req.AccountName != "Default" && !strings.Contains(req.AccountName, "@") {
		authURL += "&login_hint=" + url.QueryEscape(req.AccountName+"@gmail.com")
	} else if req.AccountName != "" && strings.Contains(req.AccountName, "@") {
		authURL += "&login_hint=" + url.QueryEscape(req.AccountName)
	}

	response.OK(c, "Antigravity OAuth URL generated", gin.H{
		"url": authURL,
		"instructions": []string{
			"1. Open the URL in your browser and login with your Google account.",
			"2. You will be redirected to a localhost URL (which may fail to load).",
			"3. Copy that ENTIRE broken localhost URL from the address bar.",
			"4. Paste it into the Complete Login endpoint.",
		},
	})
}

// CompleteAntigravityLoginRequest represents the payload for completing the login.
type CompleteAntigravityLoginRequest struct {
	RedirectURL string `json:"redirect_url" binding:"required"`
	AccountName string `json:"account_name"`
}

type oauthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

// CompleteAntigravityLogin extracts the code from the redirected URL and exchanges it for tokens.
func (h *Handler) CompleteAntigravityLogin(c *gin.Context) {
	var req CompleteAntigravityLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "redirect_url is required")
		return
	}

	// Parse the URL
	parsedURL, err := url.Parse(req.RedirectURL)
	if err != nil {
		response.BadRequest(c, "Invalid redirect_url format")
		return
	}

	code := parsedURL.Query().Get("code")
	if code == "" {
		response.BadRequest(c, "No 'code' parameter found in the redirect URL")
		return
	}

	// Exchange code for tokens
	formData := url.Values{}
	formData.Set("code", code)
	formData.Set("client_id", antigravityClientID)
	formData.Set("client_secret", antigravityClientSecret)
	formData.Set("redirect_uri", antigravityRedirectURI)
	formData.Set("grant_type", "authorization_code")

	httpReq, err := http.NewRequest("POST", antigravityTokenURL, strings.NewReader(formData.Encode()))
	if err != nil {
		response.ServerError(c, err.Error())
		return
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		response.ServerError(c, "Failed to connect to Google OAuth: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		response.ServerError(c, fmt.Sprintf("Token exchange failed (%d): %s", resp.StatusCode, string(body)))
		return
	}

	var tokenResp oauthTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		response.ServerError(c, "Failed to parse token response: "+err.Error())
		return
	}

	if tokenResp.AccessToken == "" || tokenResp.RefreshToken == "" {
		response.ServerError(c, "Received empty access or refresh token from Google")
		return
	}

	tokenJSON, _ := json.Marshal(tokenResp)
	err = h.repo.SaveCredential(0, "antigravity", req.AccountName, string(tokenJSON))
	if err != nil {
		response.ServerError(c, "Failed to save Antigravity credential: "+err.Error())
		return
	}

	response.OK(c, "Antigravity login completed successfully", gin.H{
		"provider": "antigravity",
		"status":   "success",
	})
}

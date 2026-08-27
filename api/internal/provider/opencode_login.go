package provider

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

// CompleteOpenCodeLogin handles POST /api/v1/providers/auth/opencode/complete
func (h *Handler) CompleteOpenCodeLogin(c *gin.Context) {
	var req struct {
		AccountName string `json:"account_name"`
		APIKey      string `json:"api_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}
	if req.AccountName == "" {
		req.AccountName = "Default"
	}
	if req.APIKey == "" {
		response.BadRequest(c, "API Key is required")
		return
	}

	userID := 0 // default global user

	// Generate auth.json in XDG_DATA_HOME profile if not Default
	if req.AccountName != "Default" {
		configDir := filepath.Join(os.Getenv("HOME"), ".local", "share", "qmon", "opencode_profiles", req.AccountName)
		opencodeDir := filepath.Join(configDir, "opencode")
		if err := os.MkdirAll(opencodeDir, 0755); err != nil {
			response.ServerError(c, fmt.Sprintf("Failed to create profile dir: %v", err))
			return
		}

		authPath := filepath.Join(opencodeDir, "auth.json")
		authData := map[string]interface{}{
			"opencode": map[string]string{
				"type": "api",
				"key":  req.APIKey,
			},
		}

		authBytes, _ := json.MarshalIndent(authData, "", "  ")
		if err := os.WriteFile(authPath, authBytes, 0600); err != nil {
			response.ServerError(c, fmt.Sprintf("Failed to write auth.json: %v", err))
			return
		}

		// Copy existing opencode database so usage history is preserved
		srcDbBase := filepath.Join(os.Getenv("HOME"), ".local", "share", "opencode")
		for _, dbFile := range []string{"opencode.db", "opencode.db-shm", "opencode.db-wal"} {
			srcFile := filepath.Join(srcDbBase, dbFile)
			dstFile := filepath.Join(opencodeDir, dbFile)
			if srcData, err := os.ReadFile(srcFile); err == nil {
				_ = os.WriteFile(dstFile, srcData, 0644)
			}
		}
	} else {
		// Default profile, write to the main opencode dir
		opencodeDir := filepath.Join(os.Getenv("HOME"), ".local", "share", "opencode")
		if err := os.MkdirAll(opencodeDir, 0755); err != nil {
			response.ServerError(c, fmt.Sprintf("Failed to create profile dir: %v", err))
			return
		}
		
		authPath := filepath.Join(opencodeDir, "auth.json")
		
		// Load existing if exists
		var authData map[string]interface{}
		if existing, err := os.ReadFile(authPath); err == nil {
			json.Unmarshal(existing, &authData)
		}
		if authData == nil {
			authData = make(map[string]interface{})
		}
		
		authData["opencode"] = map[string]string{
			"type": "api",
			"key":  req.APIKey,
		}

		authBytes, _ := json.MarshalIndent(authData, "", "  ")
		if err := os.WriteFile(authPath, authBytes, 0600); err != nil {
			response.ServerError(c, fmt.Sprintf("Failed to write auth.json: %v", err))
			return
		}
	}

	// Save to qmon database
	if err := h.repo.SaveCredential(userID, "opencode", req.AccountName, req.APIKey); err != nil {
		response.ServerError(c, "Failed to save credential: "+err.Error())
		return
	}

	response.OK(c, "OpenCode authenticated", gin.H{"account_name": req.AccountName})
}

// LogoutOpenCode handles POST /api/v1/providers/auth/opencode/logout
func (h *Handler) LogoutOpenCode(c *gin.Context) {
	var req struct {
		AccountName string `json:"account_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.AccountName = "Default"
	}
	if req.AccountName == "" {
		req.AccountName = "Default"
	}

	userID := 0 // default global user

	// Remove from database
	if err := h.repo.DeleteCredential(userID, "opencode", req.AccountName); err != nil {
		response.ServerError(c, "Failed to delete credential: "+err.Error())
		return
	}

	// Optionally, remove the auth.json profile
	if req.AccountName != "Default" {
		configDir := filepath.Join(os.Getenv("HOME"), ".local", "share", "qmon", "opencode_profiles", req.AccountName)
		_ = os.RemoveAll(configDir)
	} else {
		authPath := filepath.Join(os.Getenv("HOME"), ".local", "share", "opencode", "auth.json")
		if existing, err := os.ReadFile(authPath); err == nil {
			var authData map[string]interface{}
			json.Unmarshal(existing, &authData)
			delete(authData, "opencode")
			delete(authData, "opencode-go")
			authBytes, _ := json.MarshalIndent(authData, "", "  ")
			_ = os.WriteFile(authPath, authBytes, 0600)
		}
	}

	response.OK(c, "Logged out of OpenCode", nil)
}

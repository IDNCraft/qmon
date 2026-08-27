package provider

import (
	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

// Handler handles provider credential and auth endpoints.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func getUserID(c *gin.Context) (int, bool) {
	val, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}
	switch v := val.(type) {
	case int:
		return v, true
	case float64:
		return int(v), true
	}
	return 0, false
}

// SaveCredential handles POST /api/v1/providers/credentials
func (h *Handler) SaveCredential(c *gin.Context) {
	var input SaveCredentialInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	userID, ok := getUserID(c)
	if !ok {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	if err := h.repo.SaveCredential(userID, input.ProviderID, input.AccountName, input.Token); err != nil {
		response.ServerError(c, err.Error())
		return
	}

	response.OK(c, "Provider credential saved successfully", nil)
}

// DeleteCredential handles DELETE /api/v1/providers/credentials/:provider
func (h *Handler) DeleteCredential(c *gin.Context) {
	providerID := c.Param("provider")
	if providerID == "" {
		response.BadRequest(c, "Provider parameter is required")
		return
	}

	userID, ok := getUserID(c)
	if !ok {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	accountName := c.Query("account_name")

	if err := h.repo.DeleteCredential(userID, providerID, accountName); err != nil {
		response.ServerError(c, err.Error())
		return
	}

	response.OK(c, "Provider credential deleted successfully", nil)
}

// ListCredentials handles GET /api/v1/providers/credentials
func (h *Handler) ListCredentials(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	configured, err := h.repo.ListConfiguredProviders(userID)
	if err != nil {
		response.ServerError(c, err.Error())
		return
	}

	configuredSet := make(map[string]bool, len(configured))
	for _, p := range configured {
		configuredSet[p] = true
	}

	list := make([]CredentialStatus, 0, len(KnownProviders))
	for _, p := range KnownProviders {
		list = append(list, CredentialStatus{
			ProviderID:   p,
			IsConfigured: configuredSet[p],
		})
	}

	response.OK(c, "Configured providers retrieved", list)
}

// ListAccounts handles GET /api/v1/providers/credentials/:provider/accounts
func (h *Handler) ListAccounts(c *gin.Context) {
	providerID := c.Param("provider")
	if providerID == "" {
		response.BadRequest(c, "Provider parameter is required")
		return
	}

	userID, ok := getUserID(c)
	if !ok {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	creds, err := h.repo.GetCredentials(userID, providerID)
	if err == nil && len(creds) == 0 && userID > 0 {
		creds, err = h.repo.GetCredentials(0, providerID) // Fallback for global
	}
	if err != nil {
		response.ServerError(c, err.Error())
		return
	}

	var accounts []string
	for _, cred := range creds {
		accounts = append(accounts, cred.AccountName)
	}

	response.OK(c, "Accounts retrieved", gin.H{"accounts": accounts})
}

package router

import (
	"qmon-api/internal/auth"
	"qmon-api/internal/health"
	"qmon-api/internal/middleware"
	"qmon-api/internal/provider"
	"qmon-api/internal/quota"
	"qmon-api/internal/setting"

	"github.com/gin-gonic/gin"
)

// Handlers menampung semua handler yang dibutuhkan router.
type Handlers struct {
	Auth     *auth.Handler
	Setting  *setting.Handler
	Health   *health.Handler
	Quota    *quota.Handler
	Provider *provider.Handler
}

// Setup membuat gin.Engine, pasang middleware global, lalu daftarkan semua route.
func Setup(h *Handlers) *gin.Engine {
	r := gin.New()
	r.Use(middleware.CORS(), middleware.RequestID(), middleware.Logger(), middleware.Recovery())

	r.NoRoute(func(c *gin.Context) {
		c.JSON(404, gin.H{"error": "Route not found"})
	})
	r.NoMethod(func(c *gin.Context) {
		c.JSON(405, gin.H{"error": "Method not allowed"})
	})

	r.GET("/health", h.Health.Check)

	api := r.Group("api/v1")

	// ── Public (tidak perlu token) ────────────────────────────────────────────
	h.Auth.RegisterPublicRoutes(api.Group("auth"))
	api.POST("/auth/reset-default", h.Auth.ResetDefaultAdmin)
	h.Setting.RegisterPublicRoutes(api)

	// ── Protected (semua butuh JWT) ───────────────────────────────────────────
	protected := api.Group("", middleware.Auth())

	h.Auth.RegisterProtectedRoutes(protected)

	// Quota monitoring
	protected.GET("/quota/snapshot", h.Quota.GetSnapshot)
	protected.GET("/quota/snapshot/:provider", h.Quota.GetSnapshot)

	// Provider credential management
	providers := protected.Group("providers")
	providers.GET("/credentials", h.Provider.ListCredentials)
	providers.POST("/credentials", h.Provider.SaveCredential)
	providers.DELETE("/credentials/:provider", h.Provider.DeleteCredential)
	providers.GET("/credentials/:provider/accounts", h.Provider.ListAccounts)
	providers.POST("/auth/claude/initiate", h.Provider.InitiateClaudeLogin)
	providers.POST("/auth/claude/complete", h.Provider.CompleteClaudeLogin)
	providers.GET("/auth/claude/status", h.Provider.ClaudeLoginStatus)
	providers.POST("/auth/copilot/initiate", h.Provider.InitiateCopilotLogin)
	providers.GET("/auth/copilot/status", h.Provider.CopilotLoginStatus)
	providers.POST("/auth/codex/initiate", h.Provider.InitiateCodexLogin)
	providers.GET("/auth/codex/status", h.Provider.CodexLoginStatus)
	providers.POST("/auth/antigravity/initiate", h.Provider.InitiateAntigravityLogin)
	providers.POST("/auth/antigravity/complete", h.Provider.CompleteAntigravityLogin)
	providers.POST("/auth/opencode/complete", h.Provider.CompleteOpenCodeLogin)
	providers.POST("/auth/opencode/logout", h.Provider.LogoutOpenCode)

	return r
}

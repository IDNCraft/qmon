package auth

import (
	"qmon-api/internal/middleware"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterPublicRoutes(r *gin.RouterGroup) {
	rl := middleware.RateLimit(10.0/60, 5)
	r.POST("/login", rl, h.Login)
	r.POST("/refresh", rl, h.Refresh)
}

func (h *Handler) RegisterProtectedRoutes(r *gin.RouterGroup) {
	r.POST("/auth/logout", h.Logout)
}

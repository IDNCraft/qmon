package setting

import (
	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterPublicRoutes(r *gin.RouterGroup) {
	r.GET("/app-config", h.PublicConfig)
	r.GET("/app/config", h.PublicConfig)
}

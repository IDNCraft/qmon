package setting

import (
	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

// Handler memegang referensi ke Service
type Handler struct {
	Service *Service
}

// PublicConfig menangani GET /app-config dan /app/config
func (h *Handler) PublicConfig(c *gin.Context) {
	response.OK(c, "App config retrieved successfully", h.Service.PublicConfig())
}

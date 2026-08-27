package quota

import (
	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func getQuotaUserID(c *gin.Context) (int, bool) {
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

// GetSnapshot handles requests for the current AI quota usage details.
func (h *Handler) GetSnapshot(c *gin.Context) {
	userID, _ := getQuotaUserID(c)

	provider := c.Param("provider")
	if provider == "" {
		provider = c.Query("provider")
	}
	snapshot, err := h.service.GetSnapshot(c.Request.Context(), provider, userID)
	if err != nil {
		response.ServerError(c, err.Error(), response.ErrServerError)
		return
	}
	response.OK(c, "success", snapshot)
}

// Package health menyediakan endpoint GET /health untuk monitoring status aplikasi
package health

import (
	"qmon-api/internal/config"
	"qmon-api/internal/response"
	"database/sql"
	"time"

	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

// Handler memegang koneksi DB untuk cek status
type Handler struct {
	DB *sql.DB
}

// Check menangani GET /health — tidak butuh auth
func (h *Handler) Check(c *gin.Context) {
	dbStatus := "ok"
	if err := h.DB.Ping(); err != nil {
		dbStatus = "error: " + err.Error()
	}

	data := gin.H{
		"status":  statusLabel(dbStatus == "ok"),
		"version": config.AppVersion(),
		"env":     config.AppEnv(),
		"uptime":  time.Since(startTime).Round(time.Second).String(),
		"db":      dbStatus,
	}

	if dbStatus != "ok" {
		c.JSON(503, gin.H{"message": "Service unhealthy", "data": data})
		return
	}

	response.OK(c, "OK", data)
}

func statusLabel(ok bool) string {
	if ok {
		return "healthy"
	}
	return "unhealthy"
}

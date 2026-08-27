package middleware

import (
	"qmon-api/internal/logger"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// Recovery pengganti gin.Recovery() — tangkap panic dan kembalikan JSON (bukan HTML)
// Setara global exception handler di AdonisJS
func Recovery() gin.HandlerFunc {
	return gin.RecoveryWithWriter(nil, func(c *gin.Context, err any) {
		// Log panic dengan stack trace
		logger.L.Error("Panic recovered",
			zap.Any("error", err),
			zap.String("path", c.Request.URL.Path),
			zap.String("method", c.Request.Method),
		)

		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
			"error":   "Internal server error",
			"message": "Something went wrong. Please try again later.",
		})
	})
}

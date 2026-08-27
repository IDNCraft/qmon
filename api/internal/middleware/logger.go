package middleware

import (
	"qmon-api/internal/logger"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// Logger middleware untuk log setiap HTTP request — pengganti gin.Logger() bawaan
// Output development: berwarna dengan method, path, status, durasi
// Output production: JSON terstruktur
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// Lanjut proses request
		c.Next()

		duration := time.Since(start)
		status := c.Writer.Status()

		// Gabungkan path dan query kalau ada query string
		fullPath := path
		if query != "" {
			fullPath = path + "?" + query
		}

		// Pilih level log berdasarkan status code
		// 5xx = error server, 4xx = warning, lainnya = info
		fields := []zap.Field{
			zap.String("request_id", c.GetString(RequestIDKey)),
			zap.String("method", c.Request.Method),
			zap.String("path", fullPath),
			zap.Int("status", status),
			zap.Duration("latency", duration),
			zap.String("ip", c.ClientIP()),
		}

		// Sertakan error message kalau ada
		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("errors", c.Errors.ByType(gin.ErrorTypePrivate).String()))
		}

		switch {
		case status >= 500:
			logger.L.Error("Server error", fields...)
		case status >= 400:
			logger.L.Warn("Client error", fields...)
		default:
			logger.L.Info("Request", fields...)
		}
	}
}

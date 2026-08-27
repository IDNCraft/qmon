package middleware

import (
	"qmon-api/internal/config"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORS middleware mengizinkan request dari frontend (cross-origin).
// Prioritas: CORS_ORIGINS env > APP_URL (production) > allow all (development)
func CORS() gin.HandlerFunc {
	cfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept"},
		ExposeHeaders:    []string{"Content-Disposition"}, // agar header download file bisa dibaca frontend
		AllowCredentials: true,
		MaxAge:           12 * time.Hour, // browser cache preflight selama 12 jam
	}

	if origins := config.CORSOrigins(); len(origins) > 0 {
		// Explicit list dari CORS_ORIGINS — berlaku untuk development dan production
		cfg.AllowOrigins = origins
	} else if config.IsProduction() {
		// Production tanpa CORS_ORIGINS: hanya izinkan APP_URL
		cfg.AllowOrigins = []string{config.AppURL()}
	} else {
		// Development: izinkan semua origin
		cfg.AllowAllOrigins = true
	}

	return cors.New(cfg)
}

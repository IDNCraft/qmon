package middleware

import (
	"qmon-api/internal/config"
	"qmon-api/internal/response"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Auth adalah middleware JWT — dijalankan sebelum handler di route yang dilindungi
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")

		// Header harus berformat: "Bearer <token>"
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid token", "code": response.ErrAuthTokenInvalid})
			return
		}

		// Potong prefix "Bearer " untuk dapat token-nya saja
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		secret := config.JWTSecret()

		// Parse dan validasi token
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			// Pastikan algoritma yang dipakai adalah HMAC (HS256/HS384/HS512)
			// Cegah serangan algorithm confusion attack
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})

		// Token tidak valid (signature salah, expired, dll)
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token", "code": response.ErrAuthTokenExpired})
			return
		}

		// Ambil claims (payload) dari token
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims", "code": response.ErrAuthTokenInvalid})
			return
		}

		// Simpan user_id ke context Gin agar bisa diakses di handler
		// claims["user_id"] bertipe float64 karena JSON decode number jadi float64
		userID := int(claims["user_id"].(float64))
		c.Set("user_id", userID)

		// Lanjut ke handler berikutnya
		c.Next()
	}
}


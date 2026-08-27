package middleware

import (
	"qmon-api/internal/utils"

	"github.com/gin-gonic/gin"
)

const RequestIDKey = "request_id"

// RequestID membuat ID unik per request dan menyimpannya di context + response header.
// Frontend/client bisa sertakan X-Request-ID sendiri untuk tracing end-to-end.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Pakai X-Request-ID dari client kalau ada (untuk end-to-end tracing)
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = utils.RandomHex(8) // generate baru kalau tidak ada
		}

		// Simpan ke context agar bisa diakses handler atau middleware lain
		c.Set(RequestIDKey, id)

		// Kirim kembali di response header agar client bisa trace
		c.Header("X-Request-ID", id)

		c.Next()
	}
}

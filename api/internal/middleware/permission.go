package middleware

import (
	"qmon-api/internal/response"
	"net/http"

	"github.com/gin-gonic/gin"
)

// PermissionChecker interface yang harus dipenuhi oleh service permission.
// Didefinisikan di sini agar middleware tidak import package permission (cegah import cycle).
type PermissionChecker interface {
	HasPermission(userID int, slug string) (bool, error)
}

// RequirePermission middleware yang memblokir request jika user tidak punya permission.
// Harus dipasang setelah Auth() karena butuh user_id dari context.
func RequirePermission(svc PermissionChecker, slug string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized", "code": response.ErrUnauthorized})
			return
		}

		ok, err := svc.HasPermission(userID.(int), slug)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Permission check failed", "code": response.ErrServerError})
			return
		}

		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Forbidden: missing permission " + slug, "code": response.ErrPermissionDenied})
			return
		}

		c.Next()
	}
}

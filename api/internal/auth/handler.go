package auth

import (
	"fmt"
	"qmon-api/internal/logger"
	"qmon-api/internal/response"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Service *Service
}

// Login menangani POST /auth/login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err)
		return
	}

	resp, err := h.Service.Login(req.Email, req.Password)
	switch err {
	case nil:
		logger.L.Info("User logged in successfully: " + req.Email)
		response.OK(c, "Login successful", resp)
	case ErrInvalidCredentials:
		response.Unauthorized(c, "Invalid email or password", response.ErrAuthInvalidCredentials)
	case ErrNotActivated:
		response.Forbidden(c, "Account not activated. Please check your email.", response.ErrAuthAccountNotActivated)
	default:
		response.ServerError(c, "Login failed")
	}
}

// Refresh menangani POST /auth/refresh — tukar refresh token dengan access token baru
func (h *Handler) Refresh(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err)
		return
	}

	resp, err := h.Service.RefreshToken(req.RefreshToken)
	switch err {
	case nil:
		response.OK(c, "Token refreshed", resp)
	case ErrTokenNotFound, ErrTokenExpired:
		response.Unauthorized(c, "Invalid or expired refresh token", response.ErrAuthRefreshTokenInvalid)
	default:
		response.ServerError(c, "Token refresh failed")
	}
}

// Logout menangani POST /auth/logout — revoke refresh token
func (h *Handler) Logout(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err == nil && req.RefreshToken != "" {
		_ = h.Service.RevokeRefreshToken(req.RefreshToken)
	}

	if userID, exists := c.Get("user_id"); exists {
		uid := userID.(int)
		logger.L.Info(fmt.Sprintf("User logged out successfully, ID: %d", uid))
	}
	response.OK(c, "Logged out successfully", nil)
}

type ResetDefaultAdminRequest struct {
	NewEmail    string `json:"new_email" binding:"required,email"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ResetDefaultAdmin handles POST /auth/reset-default
func (h *Handler) ResetDefaultAdmin(c *gin.Context) {
	var req ResetDefaultAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err)
		return
	}

	if err := h.Service.ResetDefaultAdmin(req.NewEmail, req.NewPassword); err != nil {
		if err.Error() == "default admin account not found or already changed" || err.Error() == "default password has already been changed" {
			response.Forbidden(c, err.Error(), response.ErrAuthInvalidCredentials)
			return
		}
		response.ServerError(c, "Failed to reset credentials: " + err.Error())
		return
	}

	logger.L.Info(fmt.Sprintf("Default admin credentials reset successfully to: %s", req.NewEmail))
	response.OK(c, "Credentials updated successfully. Please login with your new email and password.", nil)
}

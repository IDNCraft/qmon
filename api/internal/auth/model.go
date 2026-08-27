package auth

import "time"

// LoginRequest adalah struktur data untuk request login
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// UserInfo adalah info user yang disisipkan di TokenResponse saat login
type UserInfo struct {
	ID       int      `json:"id"`
	UID      string   `json:"uid"`
	FullName string   `json:"full_name"`
	Email    string   `json:"email"`
	Roles    []string `json:"roles"`
}

// TokenResponse adalah data yang dikembalikan setelah login / refresh berhasil.
type TokenResponse struct {
	JToken     string    `json:"j_token"`
	RToken     string    `json:"r_token"`
	JExpiresIn int       `json:"j_expires_in"` // detik
	RExpiresIn int       `json:"r_expires_in"` // detik
	User       *UserInfo `json:"user,omitempty"`
}

// RefreshTokenRequest untuk minta access token baru
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// loginUser adalah data internal dari DB yang dibutuhkan saat proses login.
type loginUser struct {
	ID          int
	UID         string
	FullName    string
	Email       string
	HashedPwd   string
	ActivatedAt *time.Time
}

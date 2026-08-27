package config

import "strconv"

// Auth mengembalikan konfigurasi autentikasi JWT dari environment

// JWTSecret secret key untuk sign dan verify JWT token
// WAJIB diganti di production — default "secret" tidak aman
func JWTSecret() string {
	return getenv("JWT_SECRET", "secret")
}

// JWTExpireHours durasi token JWT dalam jam (default 24 jam)
func JWTExpireHours() int {
	n, err := strconv.Atoi(getenv("JWT_EXPIRE_HOURS", "24"))
	if err != nil || n < 1 {
		return 24
	}
	return n
}

// RefreshTokenExpireDays durasi refresh token dalam hari (default 30 hari)
func RefreshTokenExpireDays() int {
	n, err := strconv.Atoi(getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
	if err != nil || n < 1 {
		return 30
	}
	return n
}

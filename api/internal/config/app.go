package config

import (
	"strconv"
	"strings"
)

// App mengembalikan konfigurasi umum aplikasi dari environment

// AppName nama aplikasi — dipakai di email, judul halaman, dll
func AppName() string {
	return getenv("APP_NAME", "App")
}

// AppURL base URL publik aplikasi (backend) — dipakai untuk generate link di email
func AppURL() string {
	return getenv("APP_URL", "http://localhost:3000")
}

// FrontendURL base URL frontend — tujuan link aktivasi/reset di email.
// Default ke APP_URL bila tidak di-set. Set FRONTEND_URL kalau frontend beda host
// dari backend (mis. Next.js di :3000, API di :8080).
func FrontendURL() string {
	return getenv("FRONTEND_URL", AppURL())
}

// AppEnv environment saat ini: "development", "production", "testing"
func AppEnv() string {
	return getenv("APP_ENV", "development")
}

// Port port HTTP server
func Port() string {
	return getenv("PORT", "8080")
}

// AppVersion versi aplikasi — set via env APP_VERSION atau saat build: -ldflags "-X ..."
func AppVersion() string {
	return getenv("APP_VERSION", "1.0.0")
}

// IsProduction true kalau APP_ENV = "production"
func IsProduction() bool {
	return AppEnv() == "production"
}

// Debug true kalau APP_DEBUG = "true" (default false di production)
func Debug() bool {
	v, _ := strconv.ParseBool(getenv("APP_DEBUG", "false"))
	return v
}

// CORSOrigins mengembalikan daftar origin yang diizinkan dari env CORS_ORIGINS
// Format: comma-separated, contoh: "http://localhost:3000,https://app.example.com"
// Kalau tidak di-set, kembalikan slice kosong (middleware pakai fallback default)
func CORSOrigins() []string {
	raw := getenv("CORS_ORIGINS", "")
	if raw == "" {
		return nil
	}
	origins := strings.Split(raw, ",")
	for i, o := range origins {
		origins[i] = strings.TrimSpace(o)
	}
	return origins
}

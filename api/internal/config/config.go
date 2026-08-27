// Package config menyediakan semua konfigurasi aplikasi dari environment variable.
// Setiap domain punya file tersendiri — mirip folder config/ di AdonisJS:
//
//	app.go      → APP_NAME, APP_URL, PORT, APP_ENV
//	auth.go     → JWT_SECRET, JWT_EXPIRE_HOURS
//	database.go → DATABASE_URL
//	mail.go     → MAIL_HOST, MAIL_PORT, MAIL_USERNAME, dll
package config

import "os"

// getenv membaca env variable dengan nilai fallback kalau tidak diset
func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

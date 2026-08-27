package config

// Database mengembalikan konfigurasi koneksi database dari environment

import (
	"os"
	"path/filepath"
)

// DatabaseURL connection string MySQL/Postgres/SQLite lengkap
func DatabaseURL() string {
	home, _ := os.UserHomeDir()
	defaultPath := filepath.Join(home, ".local", "share", "qmon", "database.sqlite")
	return getenv("DATABASE_URL", defaultPath)
}

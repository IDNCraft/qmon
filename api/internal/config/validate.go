package config

import "fmt"

// requiredEnvs daftar env yang wajib diset di production
// Di development boleh pakai default, tapi di production harus eksplisit
var requiredEnvs = []struct {
	key     string
	current func() string
	danger  string // nilai default yang tidak aman untuk production
}{
	{"JWT_SECRET", JWTSecret, "secret"},
	{"DATABASE_URL", DatabaseURL, "storage/database.sqlite"},
	{"APP_URL", AppURL, "http://localhost:3000"},
}

// Validate cek env penting — kalau production pakai nilai default, langsung panic.
// Dipanggil di awal main() agar fail fast sebelum terima request apapun.
func Validate() error {
	if !IsProduction() {
		return nil // di development, semua default boleh
	}

	for _, e := range requiredEnvs {
		if e.current() == e.danger {
			return fmt.Errorf("env %s must be set in production (still using insecure default value)", e.key)
		}
	}
	return nil
}

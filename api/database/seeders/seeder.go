// Package seeders berisi seeder untuk mengisi database dengan data awal.
// Mirip database/seeders/ di AdonisJS — tiap file = satu seeder.
// Jalankan semua: go run cmd/seed/main.go
// Jalankan satu:  go run cmd/seed/main.go --only=roles
package seeders

import (
	"database/sql"
	"fmt"
	"time"

	"qmon-api/internal/logger"
)

// Seeder interface yang harus diimplementasikan setiap seeder
type Seeder interface {
	Name() string       // nama seeder, untuk log dan --only flag
	Run(db *sql.DB) error
}

// Runner menjalankan satu atau banyak seeder secara berurutan
type Runner struct {
	DB *sql.DB
}

// NewRunner membuat runner baru dengan koneksi DB
func NewRunner(db *sql.DB) *Runner {
	return &Runner{DB: db}
}

// Run menjalankan semua seeder yang diberikan secara berurutan
// Kalau satu seeder gagal, runner berhenti dan return error
func (r *Runner) Run(seeders ...Seeder) error {
	for _, s := range seeders {
		start := time.Now()
		if err := s.Run(r.DB); err != nil {
			logger.L.Error(fmt.Sprintf("❌ Failed: %s — %v", s.Name(), err))
			return fmt.Errorf("seeder %s failed: %w", s.Name(), err)
		}

		fmt.Printf("[backend] [%s] [database] 🌱 Seeded: %-16s (%s)\n", time.Now().Format("15:04:05.000"), s.Name(), time.Since(start).Round(time.Millisecond))
	}
	return nil
}

// RunOnly menjalankan seeder tertentu berdasarkan nama (case-insensitive)
func (r *Runner) RunOnly(name string, seeders ...Seeder) error {
	for _, s := range seeders {
		if s.Name() == name {
			return s.Run(r.DB)
		}
	}
	return fmt.Errorf("seeder '%s' not found", name)
}

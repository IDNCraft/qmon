// Seed CLI — jalankan seeder database
//
// Jalankan semua seeder:
//
//	go run cmd/seed/main.go
//
// Jalankan satu seeder saja:
//
//	go run cmd/seed/main.go --only=roles
//	go run cmd/seed/main.go --only=permissions
//	go run cmd/seed/main.go --only=users
package main

import (
	"qmon-api/database/seeders"
	"qmon-api/internal/config"
	"qmon-api/internal/logger"
	"database/sql"
	"flag"

	"database/sql/driver"
	"time"

	"github.com/joho/godotenv"
	"modernc.org/sqlite"
)

func init() {
	_ = sqlite.RegisterFunction("NOW", &sqlite.FunctionImpl{
		NArgs:         0,
		Deterministic: false,
		Scalar: func(ctx *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
			return time.Now().Format("2006-01-02 15:04:05"), nil
		},
	})
}

func main() {
	// Flag --only untuk jalankan satu seeder
	only := flag.String("only", "", "Nama seeder yang dijalankan (contoh: --only=roles)")
	flag.Parse()

	// Load .env
	_ = godotenv.Load()
	defer logger.Sync()

	// Buka koneksi DB
	db, err := sql.Open("sqlite", config.DatabaseURL())
	if err != nil {
		logger.L.Fatal("Failed to connect DB: " + err.Error())
	}
	defer db.Close()

	runner := seeders.NewRunner(db)
	all := seeders.All()

	if *only != "" {
		// Jalankan satu seeder berdasarkan nama
		logger.L.Info("Running seeder: " + *only)
		if err := runner.RunOnly(*only, all...); err != nil {
			logger.L.Fatal(err.Error())
		}
	} else {
		// Jalankan semua seeder (collection)
		logger.L.Info("Running all seeders...")
		if err := runner.Run(all...); err != nil {
			logger.L.Fatal(err.Error())
		}
	}

	logger.L.Info("Seeding complete.")
}

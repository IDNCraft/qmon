// Migrate CLI — jalankan database migration menggunakan goose
//
// Perintah tersedia:
//
//	go run cmd/migrate/main.go up        — jalankan semua migration baru
//	go run cmd/migrate/main.go down      — rollback satu migration terakhir
//	go run cmd/migrate/main.go status    — lihat status semua migration
//	go run cmd/migrate/main.go reset     — rollback semua migration (hati-hati!)
//	go run cmd/migrate/main.go create nama_migration — buat file migration baru
package main

import (
	"qmon-api/internal/config"
	"qmon-api/internal/logger"
	"context"
	"database/sql"
	"flag"

	"database/sql/driver"
	"time"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
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

const migrationsDir = "database/migrations"

func main() {
	flag.Parse()
	_ = godotenv.Load()
	defer logger.Sync()

	args := flag.Args()
	if len(args) == 0 {
		logger.L.Fatal("Perintah diperlukan: up | down | status | reset | create <nama>")
	}

	db, err := sql.Open("sqlite", config.DatabaseURL())
	if err != nil {
		logger.L.Fatal("Failed to connect DB: " + err.Error())
	}
	defer db.Close()

	// Set dialect goose ke sqlite
	if err := goose.SetDialect("sqlite"); err != nil {
		logger.L.Fatal(err.Error())
	}

	command := args[0]
	gooseArgs := args[1:]

	if err := goose.RunWithOptionsContext(
		context.Background(),
		command,
		db,
		migrationsDir,
		gooseArgs,
	); err != nil {
		logger.L.Fatal("Migration failed: " + err.Error())
	}
}

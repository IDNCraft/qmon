package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"embed"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"qmon-api/database/seeders"
	"qmon-api/internal/auth"
	"qmon-api/internal/config"
	"qmon-api/internal/health"
	"qmon-api/internal/logger"
	"qmon-api/internal/provider"
	"qmon-api/internal/quota"
	"qmon-api/internal/router"
	"qmon-api/internal/setting"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
	"modernc.org/sqlite"
)

//go:embed database/migrations/*.sql
var embedMigrations embed.FS

func init() {
	_ = sqlite.RegisterFunction("NOW", &sqlite.FunctionImpl{
		NArgs:         0,
		Deterministic: false,
		Scalar: func(ctx *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
			return time.Now().Format("2006-01-02 15:04:05"), nil
		},
	})
}

func dbConnection() *sql.DB {
	dbPath := config.DatabaseURL()
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		logger.L.Fatal("Failed to create database directory: " + err.Error())
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		panic(err)
	}
	return db
}

func dbLog(message string) {
	fmt.Printf("[backend] [%s] [database] %s\n", time.Now().Format("15:04:05.000"), message)
}

func main() {
	if err := godotenv.Load(); err != nil {
		logger.L.Info("No .env file found, using system environment")
	}
	defer logger.Sync()

	if err := config.Validate(); err != nil {
		logger.L.Fatal(err.Error())
	}

	dbLog("🔧 Initializing database system...")
	dbLog("🔗 Connecting to database...")
	db := dbConnection()
	defer db.Close()

	dbLog("⚙️  Configuring database pragmas...")
	_, _ = db.Exec("PRAGMA journal_mode=WAL;")
	_, _ = db.Exec("PRAGMA busy_timeout=5000;")
	dbLog("✅ Database pragmas configured")

	absPath, _ := filepath.Abs(config.DatabaseURL())
	dbLog("✅ Connected to database at: " + absPath)

	dbLog("📋 Setting up migrations...")
	dbLog("🔄 Running database migrations...")

	// 1. Run migrations automatically
	goose.SetLogger(goose.NopLogger())
	goose.SetBaseFS(embedMigrations)
	if err := goose.SetDialect("sqlite"); err != nil {
		logger.L.Fatal("Failed to set goose dialect: " + err.Error())
	}

	// Get migrations status before running goose.Up
	var oldAppliedCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM goose_db_version WHERE is_applied = 1").Scan(&oldAppliedCount)

	if err := goose.Up(db, "database/migrations"); err != nil {
		logger.L.Fatal("Failed to run migrations: " + err.Error())
	}

	// Get migration count after running goose.Up
	var newAppliedCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM goose_db_version WHERE is_applied = 1").Scan(&newAppliedCount)

	if newAppliedCount == oldAppliedCount {
		dbLog("ℹ️  No new migrations to run")
	} else {
		// Calculate applied migrations instead of reading from os.ReadDir
		appliedCount := newAppliedCount - oldAppliedCount
		dbLog(fmt.Sprintf("ℹ️  Applied %d new migrations", appliedCount))
	}

	dbLog("✅ Migrations completed")

	// 2. Run seeders if not already seeded
	dbLog("🌱 Setting up seeders...")
	dbLog("🌱 Running database seeders...")

	var seeded int
	err := db.QueryRow("SELECT COUNT(*) FROM app_settings WHERE `key` = 'seeded'").Scan(&seeded)
	if err != nil || seeded == 0 {
		runner := seeders.NewRunner(db)
		if err := runner.Run(seeders.All()...); err != nil {
			logger.L.Fatal("Failed to run seeders: " + err.Error())
		}
		_, _ = db.Exec("INSERT OR IGNORE INTO app_settings (`key`, value, created_at, updated_at) VALUES ('seeded', 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
		dbLog("✅ Seeders completed")
	} else {
		dbLog("ℹ️  No new seeders to run")
		dbLog("✅ Seeders completed")
	}

	dbLog("✅ Database system initialized successfully")
	dbLog("✅ Database initialized successfully")

	r := router.Setup(buildHandlers(db))

	port := config.Port()
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.L.Info("Server starting on :" + port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.L.Fatal("Server error: " + err.Error())
		}
	}()

	<-ctx.Done()
	logger.L.Info("Shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.L.Fatal("Forced shutdown: " + err.Error())
	}
	logger.L.Info("Server stopped gracefully")
}

func buildHandlers(db *sql.DB) *router.Handlers {
	return &router.Handlers{
		Auth: &auth.Handler{
			Service: &auth.Service{Repo: auth.NewMySQLRepository(db)},
		},
		Setting: &setting.Handler{
			Service: &setting.Service{Repo: setting.NewMySQLRepository(db)},
		},
		Health: &health.Handler{DB: db},
		Quota:  quota.NewHandler(quota.NewService(quota.NewRepository(db), provider.NewRepository(db))),
		Provider: provider.NewHandler(provider.NewRepository(db)),
	}
}

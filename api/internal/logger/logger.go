// Package logger menyediakan instance zap logger global untuk seluruh aplikasi.
// Mode development: output berwarna, human-readable (seperti Pino pretty).
// Mode production: output JSON terstruktur, cocok untuk log aggregator.
package logger

import (
	"qmon-api/internal/config"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// L adalah logger global — dipakai di seluruh aplikasi: logger.L.Info(...)
var L *zap.Logger

// S adalah sugar logger — API lebih nyaman: logger.S.Infow("msg", "key", "val")
var S *zap.SugaredLogger

func init() {
	// init() otomatis dipanggil saat package pertama kali diimport
	L = build()
	S = L.Sugar()
}

// build membuat logger sesuai environment
func build() *zap.Logger {
	if config.IsProduction() {
		// Production: JSON terstruktur, level INFO ke atas
		cfg := zap.NewProductionConfig()
		cfg.EncoderConfig.TimeKey = "time"
		cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder // "2006-01-02T15:04:05.000Z"
		log, _ := cfg.Build()
		return log
	}

	// Development: berwarna, human-readable, termasuk level DEBUG
	cfg := zap.NewDevelopmentConfig()
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder // [DEBUG] [INFO] berwarna
	log, _ := cfg.Build()
	return log
}

// Sync flush buffer log ke output — panggil di akhir main() via defer
func Sync() {
	_ = L.Sync()
}

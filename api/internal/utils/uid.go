package utils

import (
	"fmt"
	"strings"
	"time"
)

// GenerateUID membuat ID unik yang mudah dibaca manusia
// Format: {PREFIX}-{YYYYMMDD}-{6 char acak A-Z0-9}
// Contoh: USR-20250522-X7K2A9
func GenerateUID(prefix string) string {
	date := time.Now().Format("20060102")
	return fmt.Sprintf("%s-%s-%s", strings.ToUpper(prefix), date, randomAlphaNum(6))
}

// GenerateUIDShort versi pendek tanpa tanggal
// Contoh: INV-A3F2B1C0
func GenerateUIDShort(prefix string) string {
	return fmt.Sprintf("%s-%s", strings.ToUpper(prefix), randomAlphaNum(8))
}

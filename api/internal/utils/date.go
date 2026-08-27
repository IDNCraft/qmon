package utils

import (
	"fmt"
	"time"
)

// nama bulan dalam Bahasa Indonesia
var monthNames = [...]string{
	"", // index 0 kosong supaya index 1 = Januari
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

// FormatDate format tanggal panjang Indonesia
// Contoh: "22 Mei 2025"
func FormatDate(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), monthNames[t.Month()], t.Year())
}

// FormatDateShort format tanggal pendek
// Contoh: "22/05/2025"
func FormatDateShort(t time.Time) string {
	return t.Format("02/01/2006")
}

// FormatDateISO format standar internasional ISO 8601
// Contoh: "2025-05-22"
func FormatDateISO(t time.Time) string {
	return t.Format("2006-01-02")
}

// FormatTime format waktu dengan detik
// Contoh: "14:30:05"
func FormatTime(t time.Time) string {
	return t.Format("15:04:05")
}

// FormatTimeShort format waktu tanpa detik
// Contoh: "14:30"
func FormatTimeShort(t time.Time) string {
	return t.Format("15:04")
}

// FormatDateTime format tanggal dan waktu Indonesia
// Contoh: "22 Mei 2025, 14:30"
func FormatDateTime(t time.Time) string {
	return fmt.Sprintf("%s, %s", FormatDate(t), FormatTimeShort(t))
}

// FormatDateTimeISO format tanggal dan waktu ISO
// Contoh: "2025-05-22 14:30:05"
func FormatDateTimeISO(t time.Time) string {
	return t.Format("2006-01-02 15:04:05")
}

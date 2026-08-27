package utils

import (
	"strings"
	"unicode"
)

// Slugify mengubah string ke format slug URL-friendly (huruf kecil, tanda hubung)
// Contoh: "Halo Dunia! 123" → "halo-dunia-123"
func Slugify(s string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash && b.Len() > 0 {
			// karakter non-alfanumerik diganti dash, tidak boleh dobel
			b.WriteRune('-')
			prevDash = true
		}
	}
	return strings.TrimRight(b.String(), "-")
}

// Truncate memotong string ke maksimal n karakter, ditambah "..." kalau terpotong
// Aman untuk unicode/emoji karena pakai rune
// Contoh: Truncate("Halo Dunia", 7) → "Halo..."
func Truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	if n <= 3 {
		return string(runes[:n])
	}
	return string(runes[:n-3]) + "..."
}

// Title mengubah huruf pertama tiap kata menjadi kapital
// Contoh: "halo dunia" → "Halo Dunia"
func Title(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// Initials mengambil inisial dari nama lengkap (maksimal 2 huruf)
// Contoh: "Budi Santoso" → "BS", "Budi" → "BU"
func Initials(name string) string {
	words := strings.Fields(name)
	if len(words) == 0 {
		return ""
	}
	if len(words) == 1 {
		r := []rune(strings.ToUpper(words[0]))
		if len(r) >= 2 {
			return string(r[:2])
		}
		return string(r)
	}
	return strings.ToUpper(string([]rune(words[0])[0])) +
		strings.ToUpper(string([]rune(words[len(words)-1])[0]))
}

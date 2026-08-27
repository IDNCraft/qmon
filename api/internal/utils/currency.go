package utils

import (
	"fmt"
	"strings"
)

// FormatIDR format angka ke mata uang Rupiah Indonesia
// Contoh: 1500000 → "Rp 1.500.000"
// Contoh: 1500000.50 → "Rp 1.500.000,50"
func FormatIDR(amount float64) string {
	intPart := int64(amount)
	decPart := amount - float64(intPart)
	formatted := thousands(intPart, ".")
	if decPart > 0 {
		return fmt.Sprintf("Rp %s,%02d", formatted, int(decPart*100))
	}
	return fmt.Sprintf("Rp %s", formatted)
}

// FormatUSD format angka ke mata uang Dollar Amerika
// Contoh: 1500.50 → "$1,500.50"
func FormatUSD(amount float64) string {
	intPart := int64(amount)
	decPart := amount - float64(intPart)
	formatted := thousands(intPart, ",")
	return fmt.Sprintf("$%s.%02d", formatted, int(decPart*100))
}

// thousands menyisipkan pemisah ribuan setiap 3 digit dari kanan
// sep = "." untuk IDR, "," untuk USD
func thousands(n int64, sep string) string {
	s := fmt.Sprintf("%d", n)
	neg := n < 0
	if neg {
		s = s[1:]
	}
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteString(sep)
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

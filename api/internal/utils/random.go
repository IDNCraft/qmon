package utils

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
)

// RandomHex menghasilkan string hex acak
// n byte menghasilkan 2n karakter, contoh: RandomHex(8) → "a3f2b1c09d4e7f12"
func RandomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// randomAlphaNum menghasilkan string acak dari huruf kapital dan angka
// Karakter mirip (0, O, I, 1) sengaja dihilangkan agar mudah dibaca
func randomAlphaNum(n int) string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	result := make([]byte, n)
	for i := range result {
		idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		result[i] = charset[idx.Int64()]
	}
	return string(result)
}

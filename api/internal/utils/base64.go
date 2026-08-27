package utils

import "encoding/base64"

// Encode mengubah string ke Base64 standar
// Contoh: "hello world" → "aGVsbG8gd29ybGQ="
func Encode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}

// Decode mendekode Base64 standar kembali ke string asli
// Mengembalikan error kalau input bukan Base64 yang valid
func Decode(s string) (string, error) {
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// EncodeURL versi URL-safe (pakai - dan _ bukan + dan /)
// Aman dipakai langsung di URL tanpa perlu di-escape
func EncodeURL(s string) string {
	return base64.URLEncoding.EncodeToString([]byte(s))
}

// DecodeURL mendekode Base64 URL-safe
func DecodeURL(s string) (string, error) {
	b, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

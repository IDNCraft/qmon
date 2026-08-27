package utils

import (
	"errors"
	"unicode"
)

// ValidatePassword memvalidasi kekuatan password.
// Syarat: minimal 8 karakter, ada huruf besar, ada angka, ada karakter spesial.
func ValidatePassword(p string) error {
	runes := []rune(p)

	if len(runes) < 8 {
		return errors.New("password minimal 8 karakter")
	}

	var hasUpper, hasDigit, hasSpecial bool
	for _, r := range runes {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}

	if !hasUpper {
		return errors.New("password must contain at least 1 uppercase letter")
	}
	if !hasDigit {
		return errors.New("password must contain at least 1 number")
	}
	if !hasSpecial {
		return errors.New("password must contain at least 1 special character (!@#$%...)")
	}

	return nil
}

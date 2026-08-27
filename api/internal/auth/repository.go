package auth

import "time"

type Repository interface {
	// ── User ───────────────────────────────────────────────────────────────────
	FindByEmail(email string) (loginUser, error)
	InsertUser(uid, fullName, email, hashedPassword string) error
	SetPassword(email, hashedPassword string) error
	UpdateUserCredentials(oldEmail, newEmail, newHashedPassword string) error

	// ── Refresh Token ──────────────────────────────────────────────────────────
	InsertRefreshToken(userID int, token string, expiresAt time.Time) error
	FindRefreshToken(token string) (userID int, expiresAt time.Time, err error)
	DeleteRefreshToken(token string) error
}

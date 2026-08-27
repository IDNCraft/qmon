package auth

import (
	"database/sql"
	"errors"
	"time"
)

type mysqlRepository struct {
	db *sql.DB
}

// NewMySQLRepository membuat implementasi auth.Repository untuk MySQL/SQLite.
func NewMySQLRepository(db *sql.DB) Repository {
	return &mysqlRepository{db: db}
}

// ── User ───────────────────────────────────────────────────────────────────────

func (r *mysqlRepository) FindByEmail(email string) (loginUser, error) {
	var u loginUser
	var activatedAt sql.NullTime

	err := r.db.QueryRow(
		"SELECT id, uid, COALESCE(full_name, ''), email, password, activated_at FROM users WHERE email = ? AND deleted_at IS NULL",
		email,
	).Scan(&u.ID, &u.UID, &u.FullName, &u.Email, &u.HashedPwd, &activatedAt)

	if err != nil {
		return u, err
	}
	if activatedAt.Valid {
		u.ActivatedAt = &activatedAt.Time
	}
	return u, nil
}

func (r *mysqlRepository) InsertUser(uid, fullName, email, hashedPassword string) error {
	_, err := r.db.Exec(
		"INSERT INTO users (uid, full_name, email, password, activated_at, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
		uid, fullName, email, hashedPassword,
	)
	return err
}

func (r *mysqlRepository) SetPassword(email, hashedPassword string) error {
	_, err := r.db.Exec(
		"UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?", hashedPassword, email,
	)
	return err
}

func (r *mysqlRepository) UpdateUserCredentials(oldEmail, newEmail, newHashedPassword string) error {
	_, err := r.db.Exec(
		"UPDATE users SET email = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?", newEmail, newHashedPassword, oldEmail,
	)
	return err
}

// ── Refresh Token ──────────────────────────────────────────────────────────────

func (r *mysqlRepository) InsertRefreshToken(userID int, token string, expiresAt time.Time) error {
	_, err := r.db.Exec(
		"INSERT INTO refresh_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
		userID, token, expiresAt,
	)
	return err
}

func (r *mysqlRepository) FindRefreshToken(token string) (userID int, expiresAt time.Time, err error) {
	err = r.db.QueryRow(
		"SELECT user_id, expires_at FROM refresh_tokens WHERE token = ?", token,
	).Scan(&userID, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, time.Time{}, ErrTokenNotFound
	}
	return userID, expiresAt, err
}

func (r *mysqlRepository) DeleteRefreshToken(token string) error {
	_, err := r.db.Exec("DELETE FROM refresh_tokens WHERE token = ?", token)
	return err
}

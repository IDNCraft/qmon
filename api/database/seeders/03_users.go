package seeders

import (
	"database/sql"

	"qmon-api/database/seeders/collections"
	"qmon-api/internal/utils"

	"golang.org/x/crypto/bcrypt"
)

// UserSeeder seeds default users. Default password: "password" — ganti setelah login pertama.
type UserSeeder struct{}

func (s *UserSeeder) Name() string { return "users" }

func (s *UserSeeder) Run(db *sql.DB) error {
	hash, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	pwd := string(hash)

	for _, u := range collections.Users {
		uid := utils.GenerateUID("USR")
		res, err := db.Exec(
			`INSERT OR IGNORE INTO users (uid, full_name, email, password, activated_at, created_at, updated_at)
			 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			uid, u.FullName, u.Email, pwd,
		)
		if err != nil {
			return err
		}

		affected, _ := res.RowsAffected()
		if affected == 0 {
			continue
		}
	}
	return nil
}

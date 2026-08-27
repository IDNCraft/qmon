package setting

import "database/sql"

type mysqlRepository struct {
	db *sql.DB
}

// NewMySQLRepository membuat implementasi setting.Repository untuk MySQL.
func NewMySQLRepository(db *sql.DB) Repository {
	return &mysqlRepository{db: db}
}

func (r *mysqlRepository) List() ([]AppSetting, error) {
	rows, err := r.db.Query("SELECT id, `key`, value, created_at, updated_at FROM app_settings ORDER BY `key`")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var settings []AppSetting
	for rows.Next() {
		var st AppSetting
		var updatedAt sql.NullTime

		if err := rows.Scan(&st.ID, &st.Key, &st.Value, &st.CreatedAt, &updatedAt); err != nil {
			return nil, err
		}
		if updatedAt.Valid {
			st.UpdatedAt = &updatedAt.Time
		}
		settings = append(settings, st)
	}
	return settings, nil
}

func (r *mysqlRepository) Upsert(items []KeyValue) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, item := range items {
		_, err := tx.Exec(
			"INSERT INTO app_settings (`key`, value, created_at, updated_at) VALUES (?, ?, NOW(), NOW()) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = NOW()",
			item.Key, item.Value,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *mysqlRepository) GetAdminPasswordHash() (string, error) {
	var hash string
	err := r.db.QueryRow("SELECT password FROM users WHERE email = 'cli@qmon.ai'").Scan(&hash)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return hash, nil
}

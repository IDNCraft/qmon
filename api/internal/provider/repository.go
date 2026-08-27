package provider

import (
	"database/sql"
	"time"
)

// Credential is a stored provider token/credential for a user.
type Credential struct {
	ID          int        `json:"id"`
	UserID      int        `json:"user_id"`
	ProviderID  string     `json:"provider_id"`
	AccountName string     `json:"account_name"`
	Token       string     `json:"token"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt  *time.Time `json:"updated_at"`
}

// SaveCredentialInput is the request body for saving a credential.
type SaveCredentialInput struct {
	ProviderID  string `json:"provider_id" binding:"required"`
	AccountName string `json:"account_name"`
	Token       string `json:"token" binding:"required"`
}

// CredentialStatus is the response for listing configured providers.
type CredentialStatus struct {
	ProviderID   string `json:"provider_id"`
	IsConfigured bool   `json:"is_configured"`
}

// KnownProviders is the list of supported providers.
var KnownProviders = []string{"copilot", "claude", "codex"}

// Repository handles DB operations for provider credentials.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// GetCredentials returns all stored credentials for a user+provider.
func (r *Repository) GetCredentials(userID int, providerID string) ([]Credential, error) {
	rows, err := r.db.Query(
		"SELECT id, user_id, provider_id, account_name, token, created_at, updated_at FROM user_provider_credentials WHERE user_id = ? AND provider_id = ?",
		userID, providerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var creds []Credential
	for rows.Next() {
		var c Credential
		if err := rows.Scan(&c.ID, &c.UserID, &c.ProviderID, &c.AccountName, &c.Token, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		creds = append(creds, c)
	}
	return creds, nil
}

// SaveCredential upserts a provider token for a user and account name.
func (r *Repository) SaveCredential(userID int, providerID string, accountName string, token string) error {
	if accountName == "" {
		accountName = "Default"
	}
	_, err := r.db.Exec(
		`INSERT INTO user_provider_credentials (user_id, provider_id, account_name, token, created_at, updated_at)
		 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, provider_id, account_name) DO UPDATE SET token = excluded.token, updated_at = CURRENT_TIMESTAMP`,
		userID, providerID, accountName, token,
	)
	return err
}

// DeleteCredential removes a provider token for a user.
func (r *Repository) DeleteCredential(userID int, providerID string, accountName string) error {
	if accountName != "" {
		_, err := r.db.Exec(
			"DELETE FROM user_provider_credentials WHERE user_id = ? AND provider_id = ? AND account_name = ?",
			userID, providerID, accountName,
		)
		return err
	}

	_, err := r.db.Exec(
		"DELETE FROM user_provider_credentials WHERE user_id = ? AND provider_id = ?",
		userID, providerID,
	)
	return err
}

// ListConfiguredProviders returns list of configured provider IDs for a user.
func (r *Repository) ListConfiguredProviders(userID int) ([]string, error) {
	rows, err := r.db.Query(
		"SELECT provider_id FROM user_provider_credentials WHERE user_id = ?",
		userID,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return []string{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var providers []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err == nil {
			providers = append(providers, p)
		}
	}
	return providers, nil
}

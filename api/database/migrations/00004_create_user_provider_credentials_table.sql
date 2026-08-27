-- +goose Up
CREATE TABLE IF NOT EXISTS user_provider_credentials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    provider_id   VARCHAR(50) NOT NULL,
    account_name  VARCHAR(100) NOT NULL DEFAULT 'Default',
    token         TEXT NOT NULL,
    created_at    DATETIME NOT NULL,
    updated_at    DATETIME NULL,
    UNIQUE(user_id, provider_id, account_name)
);

-- +goose Down
DROP TABLE IF EXISTS user_provider_credentials;

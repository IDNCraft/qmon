-- +goose Up
CREATE TABLE IF NOT EXISTS app_settings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    `key`      VARCHAR(100) NOT NULL UNIQUE,
    value      TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NULL
);

-- +goose Down
DROP TABLE IF EXISTS app_settings;

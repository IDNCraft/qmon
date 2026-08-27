-- +goose Up
CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    uid            VARCHAR(30)  NOT NULL UNIQUE,
    full_name      VARCHAR(255) NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password       VARCHAR(255) NOT NULL,
    avatar         VARCHAR(500) NULL,
    activated_at   DATETIME NULL,
    drafted_at     DATETIME NULL,
    deactivated_at DATETIME NULL,
    deleted_at     DATETIME NULL DEFAULT NULL,
    created_at     DATETIME NOT NULL,
    updated_at     DATETIME NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_uid ON users (uid);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);

-- +goose Down
DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_uid;
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;

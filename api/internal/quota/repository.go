package quota

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

type Repository interface {
	CheckCLIAvailable(ctx context.Context, command string) bool
	RunCLICommand(ctx context.Context, env map[string]string, name string, args ...string) (string, error)
	QueryLocalDB(ctx context.Context, env map[string]string, sqlQuery string) (string, error)
}

type sqlRepository struct {
	db *sql.DB // Can be used if local DB is MySQL or SQLite.
}

func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) CheckCLIAvailable(ctx context.Context, command string) bool {
	_, err := exec.LookPath(command)
	return err == nil
}

func (r *sqlRepository) RunCLICommand(ctx context.Context, envVars map[string]string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	
	baseEnv := os.Environ()
	cmd.Env = append(baseEnv, "BROWSER=none")
	
	if envVars != nil {
		for k, v := range envVars {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
		}
	}
	// Strip token for Claude CLI if needed
	if name == "claude" {
		cmd.Env = append(os.Environ(), "BROWSER=none")
		for i, env := range cmd.Env {
			if filepath.Base(env) == "CLAUDE_CODE_OAUTH_TOKEN" {
				cmd.Env = append(cmd.Env[:i], cmd.Env[i+1:]...)
				break
			}
		}
	} else if name == "gh" {
		cmd.Env = []string{"BROWSER=none"}
		for _, env := range os.Environ() {
			if !strings.HasPrefix(env, "GITHUB_TOKEN=") &&
				!strings.HasPrefix(env, "COPILOT_TOKEN=") &&
				!strings.HasPrefix(env, "COPILOT_GITHUB_TOKEN=") &&
				!strings.HasPrefix(env, "GH_TOKEN=") {
				cmd.Env = append(cmd.Env, env)
			}
		}
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return string(output), fmt.Errorf("CLI exec failed: %w (output: %s)", err, string(output))
	}
	return string(output), nil
}

// QueryLocalDB queries local sqlite DB by executing the opencode CLI tool.
func (r *sqlRepository) QueryLocalDB(ctx context.Context, env map[string]string, sqlQuery string) (string, error) {
	// opencode db "<query>" --format json
	args := []string{"db", sqlQuery, "--format", "json"}
	return r.RunCLICommand(ctx, env, "opencode", args...)
}

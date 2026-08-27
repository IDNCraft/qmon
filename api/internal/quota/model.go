package quota

import "time"

// QuotaType defines the category of the quota limit.
type QuotaType string

const (
	QuotaTypeSession       QuotaType = "session"
	QuotaTypeFiveHour      QuotaType = "5h"
	QuotaTypeWeekly        QuotaType = "weekly"
	QuotaTypeMonthly       QuotaType = "monthly"
	QuotaTypeModelSpecific QuotaType = "model_specific"
)

// Quota represents an individual usage metric.
type Quota struct {
	QuotaType        QuotaType  `json:"quota_type"`
	PercentRemaining float64    `json:"percent_remaining"`
	ResetsAt         *time.Time `json:"resets_at,omitempty"`
	ResetText        string     `json:"reset_text,omitempty"`
	ModelKey         string     `json:"model_key,omitempty"`
	IsExhausted      bool       `json:"is_exhausted"`
}

// ProviderSnapshot holds aggregated quotas for a specific AI provider.
type ProviderSnapshot struct {
	ProviderID  string    `json:"provider_id"`
	Name        string    `json:"name"`
	IsEnabled   bool      `json:"is_enabled"`
	IsAvailable bool      `json:"is_available"`
	Quotas      []Quota   `json:"quotas"`
	LastError   string    `json:"last_error,omitempty"`
	CapturedAt  time.Time `json:"captured_at"`
}

// QuotaSnapshotResponse is the final payload returned to the Android client.
type QuotaSnapshotResponse struct {
	CapturedAt time.Time          `json:"captured_at"`
	Providers  []ProviderSnapshot `json:"providers"`
}

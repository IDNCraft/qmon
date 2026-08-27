package setting

import "time"

// AppSetting merepresentasikan satu pengaturan aplikasi (key-value store)
// Contoh: "app_name" → "My App", "registration_enabled" → "true"
type AppSetting struct {
	ID        int        `json:"id"`
	Key       string     `json:"key"`        // nama pengaturan
	Value     string     `json:"value"`      // nilai pengaturan (selalu string)
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"` // pointer karena bisa NULL
}

// UpdateSettingsRequest untuk update banyak setting sekaligus
type UpdateSettingsRequest struct {
	Settings []KeyValue `json:"settings" binding:"required"` // minimal harus ada 1
}

// KeyValue adalah pasangan key-value untuk satu setting
type KeyValue struct {
	Key   string `json:"key" binding:"required"` // wajib
	Value string `json:"value"`                  // boleh kosong
}

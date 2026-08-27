package setting

import (
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Service berisi logika bisnis untuk pengaturan aplikasi.
type Service struct {
	Repo Repository
}

// List mengambil semua pengaturan aplikasi.
func (s *Service) List() ([]AppSetting, error) {
	return s.Repo.List()
}

// Update menyimpan banyak setting sekaligus (upsert).
func (s *Service) Update(items []KeyValue) error {
	return s.Repo.Upsert(items)
}

// PublicConfig mengambil subset setting yang aman untuk diekspos ke publik.
func (s *Service) PublicConfig() map[string]string {
	settings, err := s.List()
	if err != nil {
		return map[string]string{}
	}

	result := map[string]string{}
	for _, item := range settings {
		switch item.Key {
		case "app_name", "app_contact_email":
			result[item.Key] = strings.TrimSpace(item.Value)
		}
	}

	// Check if default credentials are still active
	hash, err := s.Repo.GetAdminPasswordHash()
	if err == nil && hash != "" {
		err = bcrypt.CompareHashAndPassword([]byte(hash), []byte("password"))
		if err == nil {
			result["is_default_admin"] = "true"
		} else {
			result["is_default_admin"] = "false"
		}
	} else {
		result["is_default_admin"] = "false"
	}

	return result
}

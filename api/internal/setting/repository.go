package setting

// Repository mendefinisikan kontrak operasi data app_settings.
type Repository interface {
	List() ([]AppSetting, error)
	Upsert(items []KeyValue) error
	GetAdminPasswordHash() (string, error)
}

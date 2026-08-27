package seeders

// All mengembalikan semua seeder dalam urutan yang benar.
// Urutan penting: roles → permissions → users (relasi bergantung satu sama lain)
// Setara dengan MainSeeder / collection seeder di AdonisJS.
func All() []Seeder {
	return []Seeder{
		&UserSeeder{},
	}
}

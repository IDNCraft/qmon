package collections

type UserSeed struct {
	FullName string
	Email    string
	RoleSlug string
}

var Users = []UserSeed{
	{"Super Admin", "cli@qmon.ai", "super-admin"},
	{"Testing Admin", "testing.admin@example.com", "admin"},
	{"Testing Member", "testing.member@example.com", "member"},
}

package repository

// CRUD adalah base interface untuk operasi data yang umum di domain CRUD.
//
//   T = tipe entity (User, Role, Permission, dll)
//   Q = tipe query/filter untuk List
//   C = tipe params untuk Insert (Create)
//   U = tipe params untuk Update
//
// Domain yang punya operasi tambahan (BulkDestroy, SyncPermissions, dll)
// embed interface ini dan tambah method spesifik di atasnya.
type CRUD[T, Q, C, U any] interface {
	FindByID(id int) (T, error)
	List(q Q) ([]T, int, error)
	Insert(req C) (T, error)
	Update(id int, req U) (T, error)
	Delete(id int) error
}

.PHONY: dev dev-plain build seed seed-roles seed-permissions seed-users migrate-up migrate-down migrate-status migrate-reset migrate-create tidy

## Jalankan server development dengan live reload (air)
dev:
	air

## Jalankan server development tanpa live reload
dev-plain:
	go run main.go

## Build binary ke bin/app
build:
	go build -o bin/app main.go

## Jalankan semua seeder
seed:
	go run cmd/seed/main.go

## Jalankan seeder per nama
seed-roles:
	go run cmd/seed/main.go --only=roles

seed-permissions:
	go run cmd/seed/main.go --only=permissions

seed-users:
	go run cmd/seed/main.go --only=users

## Migration: jalankan semua migration baru
migrate-up:
	go run cmd/migrate/main.go up

## Migration: rollback satu migration terakhir
migrate-down:
	go run cmd/migrate/main.go down

## Migration: lihat status semua migration
migrate-status:
	go run cmd/migrate/main.go status

## Migration: rollback semua (hati-hati!)
migrate-reset:
	go run cmd/migrate/main.go reset

## Migration: buat file migration baru — pakai: make migrate-create name=nama_migration
migrate-create:
	go run cmd/migrate/main.go create $(name) sql

## Bersihkan dependency go.mod
tidy:
	go mod tidy

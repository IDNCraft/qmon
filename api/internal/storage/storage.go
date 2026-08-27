// Package storage menyediakan helper untuk upload dan hapus file lokal.
// File disimpan di direktori storage/uploads/ relatif terhadap working directory.
package storage

import (
	"qmon-api/internal/config"
	"fmt"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"qmon-api/internal/utils"
)

const uploadDir = "storage/uploads"

// SaveFile menyimpan file multipart ke disk, kembalikan URL publik file.
// allowedExts contoh: []string{".jpg", ".jpeg", ".png", ".webp"}
func SaveFile(file *multipart.FileHeader, subDir string, allowedExts []string) (string, error) {
	ext := strings.ToLower(filepath.Ext(file.Filename))

	// Validasi ekstensi file
	if len(allowedExts) > 0 && !isAllowed(ext, allowedExts) {
		return "", fmt.Errorf("file type not allowed: %s", ext)
	}

	// Buat nama file unik agar tidak tertimpa
	// Format: subdir/YYYYMMDD_<uid>.<ext>
	datePart := time.Now().Format("20060102")
	filename := fmt.Sprintf("%s_%s%s", datePart, utils.RandomHex(8), ext)

	// Pastikan direktori tujuan ada
	dir := filepath.Join(uploadDir, subDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create upload directory: %w", err)
	}

	dst := filepath.Join(dir, filename)

	// Buka file yang diupload
	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer src.Close()

	// Buat file tujuan
	out, err := os.Create(dst)
	if err != nil {
		return "", fmt.Errorf("failed to save file: %w", err)
	}
	defer out.Close()

	// Salin konten file
	buf := make([]byte, 32*1024) // buffer 32KB
	for {
		n, err := src.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				return "", fmt.Errorf("failed to write file: %w", werr)
			}
		}
		if err != nil {
			break // EOF atau error
		}
	}

	// Kembalikan URL publik: APP_URL/uploads/subdir/filename
	publicPath := fmt.Sprintf("%s/uploads/%s/%s", config.AppURL(), subDir, filename)
	return publicPath, nil
}

// DeleteFile menghapus file dari disk berdasarkan URL publik.
// Tidak error kalau file tidak ditemukan — dianggap sudah terhapus.
func DeleteFile(publicURL string) error {
	// Ubah URL publik kembali ke path lokal
	// contoh: "http://localhost:8080/uploads/avatars/file.jpg" → "storage/uploads/avatars/file.jpg"
	base := config.AppURL() + "/uploads/"
	if !strings.HasPrefix(publicURL, base) {
		return nil // bukan file lokal, lewati
	}

	relativePath := strings.TrimPrefix(publicURL, base)
	localPath := filepath.Join(uploadDir, relativePath)

	if err := os.Remove(localPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete file: %w", err)
	}
	return nil
}

// isAllowed cek apakah ekstensi ada di daftar yang diizinkan
func isAllowed(ext string, allowed []string) bool {
	for _, a := range allowed {
		if a == ext {
			return true
		}
	}
	return false
}

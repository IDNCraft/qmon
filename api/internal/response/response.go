// Package response menyediakan helper untuk mengirim JSON response secara konsisten.
// Pakai package ini di semua handler agar format response seragam di seluruh API.
package response

import (
	"math"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Meta adalah struktur pagination standar yang dikembalikan di endpoint list
type Meta struct {
	Total    int `json:"total"`
	Page     int `json:"page"`
	PerPage  int `json:"per_page"`
	LastPage int `json:"last_page"`
}

// NewMeta membuat Meta dari total data, halaman saat ini, dan jumlah per halaman
func NewMeta(total, page, perPage int) Meta {
	lastPage := int(math.Ceil(float64(total) / float64(perPage)))
	if lastPage < 1 {
		lastPage = 1
	}
	return Meta{Total: total, Page: page, PerPage: perPage, LastPage: lastPage}
}

// OK 200 — request berhasil, kembalikan data
func OK(c *gin.Context, message string, data any) {
	c.JSON(http.StatusOK, gin.H{"success": true, "message": message, "data": data})
}

// OKWithMeta 200 — request berhasil + pagination meta
func OKWithMeta(c *gin.Context, message string, data any, meta Meta) {
	c.JSON(http.StatusOK, gin.H{"success": true, "message": message, "data": data, "meta": meta})
}

// Created 201 — resource berhasil dibuat
func Created(c *gin.Context, message string, data any) {
	c.JSON(http.StatusCreated, gin.H{"success": true, "message": message, "data": data})
}

// NoContent 204 — berhasil, tidak ada data untuk dikembalikan (misal delete)
func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

func errorBody(message string, code []string) gin.H {
	body := gin.H{"error": message}
	if len(code) > 0 && code[0] != "" {
		body["code"] = code[0]
	}
	return body
}

// BadRequest 400 — input client tidak valid
func BadRequest(c *gin.Context, message string, code ...string) {
	c.JSON(http.StatusBadRequest, errorBody(message, code))
}

// Unauthorized 401 — belum login / token tidak valid
func Unauthorized(c *gin.Context, message string, code ...string) {
	if message == "" {
		message = "Unauthorized"
	}
	c.JSON(http.StatusUnauthorized, errorBody(message, code))
}

// Forbidden 403 — sudah login tapi tidak punya izin
func Forbidden(c *gin.Context, message string, code ...string) {
	if message == "" {
		message = "Forbidden"
	}
	c.JSON(http.StatusForbidden, errorBody(message, code))
}

// NotFound 404 — resource tidak ditemukan
func NotFound(c *gin.Context, message string, code ...string) {
	if message == "" {
		message = "Not found"
	}
	c.JSON(http.StatusNotFound, errorBody(message, code))
}

// UnprocessableEntity 422 — validasi bisnis gagal (bukan validasi input)
func UnprocessableEntity(c *gin.Context, message string, code ...string) {
	c.JSON(http.StatusUnprocessableEntity, errorBody(message, code))
}

// ServerError 500 — error internal server
func ServerError(c *gin.Context, message string, code ...string) {
	if message == "" {
		message = "Internal server error"
	}
	c.JSON(http.StatusInternalServerError, errorBody(message, code))
}

// ServiceUnavailable 503 — server tidak bisa melayani (misal DB down)
func ServiceUnavailable(c *gin.Context, message string, code ...string) {
	c.JSON(http.StatusServiceUnavailable, errorBody(message, code))
}

// ValidationError 422 — error validasi binding Gin
func ValidationError(c *gin.Context, err error) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error(), "code": ErrValidation})
}

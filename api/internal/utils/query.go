package utils

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
)

// ListQueryParams hasil parse dari query string untuk endpoint list/pagination
type ListQueryParams struct {
	Page       int      // nomor halaman, minimal 1
	PerPage    int      // jumlah data per halaman
	Search     string   // kata kunci pencarian
	SortBy     string   // kolom untuk sorting (sudah disanitasi)
	SortOrder  string   // "ASC" atau "DESC"
	SearchCols []string // kolom yang dicari (untuk buildWhere)
}

// ListQueryOptions konfigurasi default dan whitelist untuk ParseListQuery
type ListQueryOptions struct {
	DefaultSortBy     string   // default kolom sort jika tidak diisi (default: "created_at")
	DefaultSortOrder  string   // default arah sort: "asc" atau "desc" (default: "desc")
	DefaultSearchCols []string // kolom pencarian default jika ?search_columns tidak dikirim
	AllowedSortCols   []string // whitelist kolom yang boleh di-sort (cegah SQL injection)
}

// ParseListQuery membaca dan menormalisasi parameter list dari Gin query string.
// Aman dari SQL injection: kolom sort divalidasi terhadap AllowedSortCols.
//
// Contoh pakai di handler:
//
//	q := utils.ParseListQuery(c, utils.ListQueryOptions{
//	    DefaultSortBy:     "created_at",
//	    DefaultSearchCols: []string{"full_name", "email"},
//	    AllowedSortCols:   []string{"id", "email", "full_name", "created_at"},
//	})
//	// q.Page, q.PerPage, q.Search, q.SortBy, q.SortOrder, q.SearchCols
func ParseListQuery(c *gin.Context, opts ListQueryOptions) ListQueryParams {
	// Terapkan default kalau tidak diisi
	if opts.DefaultSortBy == "" {
		opts.DefaultSortBy = "created_at"
	}
	if opts.DefaultSortOrder == "" {
		opts.DefaultSortOrder = "desc"
	}
	if len(opts.DefaultSearchCols) == 0 {
		opts.DefaultSearchCols = []string{"name", "email"}
	}

	// Baca page — minimal 1
	page := queryInt(c, "page", 1)
	if page < 1 {
		page = 1
	}

	// Baca per_page — minimal 1, maksimal 200 agar tidak overload
	perPage := queryInt(c, "per_page", 10)
	if perPage < 1 {
		perPage = 1
	}
	if perPage > 200 {
		perPage = 200
	}

	search := strings.TrimSpace(c.Query("search"))

	// Sanitasi sort_by terhadap whitelist — cegah SQL injection
	sortBy := c.Query("sort_by")
	if !isAllowedCol(sortBy, opts.AllowedSortCols) {
		sortBy = opts.DefaultSortBy
	}

	// Normalkan sort_order ke uppercase ASC/DESC
	sortOrder := strings.ToUpper(c.Query("sort_order"))
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = strings.ToUpper(opts.DefaultSortOrder)
	}
	if sortOrder != "ASC" {
		sortOrder = "DESC" // default DESC kalau tidak valid
	}

	// Parse search_columns: bisa comma-separated string atau array query
	// Contoh: ?search_columns=full_name,email  ATAU  ?search_columns[]=full_name&search_columns[]=email
	searchCols := parseStringSlice(c, "search_columns")
	if len(searchCols) == 0 {
		searchCols = opts.DefaultSearchCols
	}

	return ListQueryParams{
		Page:       page,
		PerPage:    perPage,
		Search:     search,
		SortBy:     sortBy,
		SortOrder:  sortOrder,
		SearchCols: searchCols,
	}
}

// ParseFilterParam membaca parameter filter yang bisa berupa comma-separated string
// atau multi-value query, kembalikan sebagai []string.
// Berguna untuk filter seperti ?status=active,pending atau ?status[]=active&status[]=pending
//
// Contoh pakai:
//
//	statuses := utils.ParseFilterParam(c, "status")
//	// ?status=active,pending  →  ["active", "pending"]
//	// ?status[]=active&status[]=pending  →  ["active", "pending"]
//	// ?status=  →  []
func ParseFilterParam(c *gin.Context, key string) []string {
	return parseStringSlice(c, key)
}

// ── Helper internal ───────────────────────────────────────────────────────────

// queryInt membaca query string sebagai int dengan nilai default
func queryInt(c *gin.Context, key string, defaultVal int) int {
	raw := c.Query(key)
	if raw == "" {
		return defaultVal
	}
	var n int
	// Konversi manual tanpa import strconv — pakai fmt
	if _, err := fmt.Sscanf(raw, "%d", &n); err != nil {
		return defaultVal
	}
	return n
}

// isAllowedCol cek apakah kolom ada di whitelist (case-insensitive)
// Kalau whitelist kosong, semua diizinkan — HATI-HATI SQL injection
func isAllowedCol(col string, allowed []string) bool {
	if len(allowed) == 0 {
		return col != "" // kalau whitelist kosong, izinkan asalkan tidak kosong
	}
	col = strings.ToLower(col)
	for _, a := range allowed {
		if strings.ToLower(a) == col {
			return true
		}
	}
	return false
}

// parseStringSlice membaca parameter yang bisa berupa comma-separated string
// atau multi-value query (?key=a,b,c atau ?key[]=a&key[]=b)
func parseStringSlice(c *gin.Context, key string) []string {
	// Coba ambil sebagai array query (?key[]=a&key[]=b)
	values := c.QueryArray(key)
	if len(values) > 0 {
		return trimAll(values)
	}

	// Coba comma-separated (?key=a,b,c)
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return nil
	}
	return trimAll(strings.Split(raw, ","))
}

// trimAll memotong spasi di tiap elemen slice dan hapus string kosong
func trimAll(ss []string) []string {
	result := make([]string, 0, len(ss))
	for _, s := range ss {
		s = strings.TrimSpace(s)
		if s != "" {
			result = append(result, s)
		}
	}
	return result
}

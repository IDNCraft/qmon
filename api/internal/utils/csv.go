package utils

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"reflect"
	"strings"
)

// CSVColumn mendefinisikan satu kolom pada file CSV
type CSVColumn struct {
	Header string // judul kolom di baris pertama
	Field  string // nama field struct (case-sensitive), atau key map
}

// ExportCSV menghasilkan file CSV dari slice of struct atau slice of map
// Kembalikan []byte yang bisa langsung ditulis ke http.ResponseWriter
//
// Contoh pakai:
//
//	cols := []utils.CSVColumn{
//	    {Header: "Nama", Field: "FullName"},
//	    {Header: "Email", Field: "Email"},
//	}
//	data, err := utils.ExportCSV(cols, users)
//	c.Header("Content-Disposition", "attachment; filename=users.csv")
//	c.Data(200, "text/csv", data)
func ExportCSV(cols []CSVColumn, rows any) ([]byte, error) {
	var buf bytes.Buffer

	// BOM UTF-8 agar Excel bisa baca karakter non-ASCII (misal huruf Indonesia)
	buf.WriteString("\xEF\xBB\xBF")

	w := csv.NewWriter(&buf)

	// Tulis baris header
	headers := make([]string, len(cols))
	for i, col := range cols {
		headers[i] = col.Header
	}
	if err := w.Write(headers); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Tulis baris data
	rv := reflect.ValueOf(rows)
	if rv.Kind() == reflect.Slice {
		for i := 0; i < rv.Len(); i++ {
			item := rv.Index(i)

			// Dereference pointer kalau perlu
			if item.Kind() == reflect.Ptr {
				item = item.Elem()
			}

			record := make([]string, len(cols))
			for j, col := range cols {
				val := extractField(item, col.Field)
				record[j] = fmt.Sprintf("%v", val)
			}

			if err := w.Write(record); err != nil {
				return nil, fmt.Errorf("failed to write CSV row %d: %w", i+1, err)
			}
		}
	}

	// Flush buffer ke underlying writer
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("failed to flush CSV: %w", err)
	}

	return buf.Bytes(), nil
}

// ImportCSV membaca file CSV dan kembalikan sebagai slice of map[string]string
// Baris pertama dianggap header, baris selanjutnya adalah data
//
// Contoh pakai:
//
//	rows, err := utils.ImportCSV("uploads/users.csv")
//	for _, row := range rows {
//	    fmt.Println(row["Email"], row["Nama"])
//	}
func ImportCSV(filePath string) ([]map[string]string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	return parseCSV(f)
}

// ImportCSVFromBytes membaca CSV dari []byte (berguna untuk upload file via HTTP)
func ImportCSVFromBytes(data []byte) ([]map[string]string, error) {
	// Lewati BOM UTF-8 kalau ada (3 byte pertama: EF BB BF)
	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		data = data[3:]
	}
	return parseCSV(bytes.NewReader(data))
}

// ── Helper internal ───────────────────────────────────────────────────────────

// parseCSV membaca CSV dari io.Reader dan kembalikan slice of map
func parseCSV(r io.Reader) ([]map[string]string, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true // hapus spasi di awal field

	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to parse CSV: %w", err)
	}

	// Butuh minimal 2 baris (header + 1 data)
	if len(rows) < 2 {
		return nil, nil
	}

	// Baris pertama = header
	headers := rows[0]

	var result []map[string]string
	for _, row := range rows[1:] {
		record := make(map[string]string)
		for i, header := range headers {
			key := strings.TrimSpace(header)
			if key == "" {
				continue
			}
			val := ""
			if i < len(row) {
				val = strings.TrimSpace(row[i])
			}
			record[key] = val
		}
		// Lewati baris yang semua nilainya kosong
		if !isEmptyRow(record) {
			result = append(result, record)
		}
	}
	return result, nil
}

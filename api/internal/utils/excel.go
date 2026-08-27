package utils

import (
	"bytes"
	"fmt"
	"reflect"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ExcelColumn mendefinisikan satu kolom pada file Excel
type ExcelColumn struct {
	Header string // judul kolom di baris pertama
	Field  string // nama field struct (case-sensitive), atau key map
	Width  float64 // lebar kolom, 0 = auto (default 15)
}

// ExportExcel menghasilkan file Excel dari slice of struct atau slice of map
// Kembalikan *excelize.File yang bisa langsung di-write ke http.ResponseWriter
//
// Contoh pakai:
//
//	cols := []utils.ExcelColumn{
//	    {Header: "Nama", Field: "FullName", Width: 25},
//	    {Header: "Email", Field: "Email", Width: 30},
//	}
//	f, err := utils.ExportExcel("Users", cols, users)
//	f.Write(c.Writer)
func ExportExcel(sheetName string, cols []ExcelColumn, rows any) (*excelize.File, error) {
	f := excelize.NewFile()
	sheet := sheetName
	if sheet == "" {
		sheet = "Sheet1"
	}

	// Rename sheet default ke nama yang diinginkan
	f.SetSheetName("Sheet1", sheet)

	// Buat style untuk header: bold, background abu-abu, border
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"4F46E5"}, Pattern: 1},
		Border: []excelize.Border{
			{Type: "left", Color: "CCCCCC", Style: 1},
			{Type: "right", Color: "CCCCCC", Style: 1},
			{Type: "top", Color: "CCCCCC", Style: 1},
			{Type: "bottom", Color: "CCCCCC", Style: 1},
		},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	// Buat style untuk baris data: border tipis
	dataStyle, _ := f.NewStyle(&excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "DDDDDD", Style: 1},
			{Type: "right", Color: "DDDDDD", Style: 1},
			{Type: "top", Color: "DDDDDD", Style: 1},
			{Type: "bottom", Color: "DDDDDD", Style: 1},
		},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})

	// Tulis header di baris pertama
	for i, col := range cols {
		cell := colLetter(i) + "1"
		f.SetCellValue(sheet, cell, col.Header)
		f.SetCellStyle(sheet, cell, cell, headerStyle)

		// Set lebar kolom
		w := col.Width
		if w == 0 {
			w = 15
		}
		f.SetColWidth(sheet, colLetter(i), colLetter(i), w)
	}
	f.SetRowHeight(sheet, 1, 22) // tinggi baris header

	// Tulis data mulai baris ke-2
	rv := reflect.ValueOf(rows)
	if rv.Kind() == reflect.Slice {
		for rowIdx := 0; rowIdx < rv.Len(); rowIdx++ {
			excelRow := rowIdx + 2 // baris Excel dimulai dari 2 (1 = header)
			item := rv.Index(rowIdx)

			// Dereference pointer kalau perlu
			if item.Kind() == reflect.Ptr {
				item = item.Elem()
			}

			for colIdx, col := range cols {
				cell := colLetter(colIdx) + fmt.Sprintf("%d", excelRow)
				val := extractField(item, col.Field)
				f.SetCellValue(sheet, cell, val)
				f.SetCellStyle(sheet, cell, cell, dataStyle)
			}
			f.SetRowHeight(sheet, excelRow, 18)
		}
	}

	// Freeze pane: baris header tetap terlihat saat scroll
	f.SetPanes(sheet, &excelize.Panes{
		Freeze:      true,
		YSplit:      1,
		TopLeftCell: "A2",
		ActivePane:  "bottomLeft",
	})

	return f, nil
}

// ImportExcel membaca file Excel dan kembalikan sebagai slice of map[string]string
// Baris pertama dianggap header, baris selanjutnya adalah data
//
// Contoh pakai:
//
//	rows, err := utils.ImportExcel(file, "Sheet1")
//	for _, row := range rows {
//	    fmt.Println(row["Email"], row["Nama"])
//	}
func ImportExcel(filePath string, sheetName string) ([]map[string]string, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	// Pakai sheet pertama kalau sheetName kosong
	if sheetName == "" {
		sheetName = f.GetSheetName(0)
	}

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, fmt.Errorf("failed to read sheet '%s': %w", sheetName, err)
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

// ImportExcelFromBytes membaca Excel dari []byte (berguna untuk upload file via HTTP)
func ImportExcelFromBytes(data []byte, sheetName string) ([]map[string]string, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to read data: %w", err)
	}
	defer f.Close()

	if sheetName == "" {
		sheetName = f.GetSheetName(0)
	}

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, fmt.Errorf("failed to read sheet '%s': %w", sheetName, err)
	}

	if len(rows) < 2 {
		return nil, nil
	}

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
		if !isEmptyRow(record) {
			result = append(result, record)
		}
	}
	return result, nil
}

// ── Helper internal ───────────────────────────────────────────────────────────

// colLetter mengubah index kolom (0-based) ke huruf Excel: 0→A, 1→B, 25→Z, 26→AA
func colLetter(idx int) string {
	result := ""
	idx++ // jadi 1-based
	for idx > 0 {
		idx--
		result = string(rune('A'+idx%26)) + result
		idx /= 26
	}
	return result
}

// extractField mengambil nilai field dari struct atau map via reflection
func extractField(v reflect.Value, field string) any {
	switch v.Kind() {
	case reflect.Struct:
		// Coba ambil by nama field langsung
		f := v.FieldByName(field)
		if f.IsValid() {
			// Unwrap pointer (misal *string, *time.Time)
			if f.Kind() == reflect.Ptr {
				if f.IsNil() {
					return ""
				}
				return fmt.Sprintf("%v", f.Elem().Interface())
			}
			return fmt.Sprintf("%v", f.Interface())
		}
	case reflect.Map:
		// Untuk map[string]any atau map[string]string
		val := v.MapIndex(reflect.ValueOf(field))
		if val.IsValid() {
			return fmt.Sprintf("%v", val.Interface())
		}
	}
	return ""
}

// isEmptyRow cek apakah semua nilai di map kosong
func isEmptyRow(row map[string]string) bool {
	for _, v := range row {
		if v != "" {
			return false
		}
	}
	return true
}

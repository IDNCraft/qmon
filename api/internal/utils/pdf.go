package utils

import (
	"bytes"
	"fmt"
	"reflect"

	"github.com/jung-kurt/gofpdf"
)

// PDFColumn mendefinisikan satu kolom pada file PDF
type PDFColumn struct {
	Header string  // judul kolom di baris header
	Field  string  // nama field struct (case-sensitive), atau key map
	Width  float64 // lebar kolom dalam mm, 0 = auto (default 40)
}

// PDFOptions mengatur tampilan PDF yang dihasilkan
type PDFOptions struct {
	Title       string  // judul dokumen (tampil di atas tabel)
	Orientation string  // "P" untuk Portrait (default), "L" untuk Landscape
	FontSize    float64 // ukuran font data (default 9)
}

// ExportPDF menghasilkan file PDF dari slice of struct atau slice of map
// Kembalikan []byte yang bisa langsung ditulis ke http.ResponseWriter
//
// Contoh pakai:
//
//	cols := []utils.PDFColumn{
//	    {Header: "Nama", Field: "FullName", Width: 60},
//	    {Header: "Email", Field: "Email", Width: 80},
//	}
//	opts := utils.PDFOptions{Title: "Daftar User"}
//	data, err := utils.ExportPDF(cols, users, opts)
//	c.Header("Content-Disposition", "attachment; filename=users.pdf")
//	c.Data(200, "application/pdf", data)
func ExportPDF(cols []PDFColumn, rows any, opts PDFOptions) ([]byte, error) {
	// Default nilai opsional
	orientation := opts.Orientation
	if orientation == "" {
		orientation = "P" // Portrait
	}
	fontSize := opts.FontSize
	if fontSize == 0 {
		fontSize = 9
	}

	// Buat dokumen PDF baru — A4, satuan mm
	pdf := gofpdf.New(orientation, "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	// ── Judul dokumen ──────────────────────────────────────────────────────────
	if opts.Title != "" {
		pdf.SetFont("Arial", "B", 14)
		pdf.SetTextColor(30, 30, 30)
		pdf.CellFormat(0, 10, opts.Title, "", 1, "C", false, 0, "")
		pdf.Ln(4) // jarak antara judul dan tabel
	}

	// Hitung lebar efektif halaman (lebar A4 - margin kiri - margin kanan)
	pageW, _, _ := pdf.PageSize(0)
	marginL, _, marginR, _ := pdf.GetMargins()
	effectiveW := pageW - marginL - marginR

	// Normalkan lebar kolom: kalau 0, pakai default 40; lalu scale agar pas lebar halaman
	colWidths := make([]float64, len(cols))
	totalW := 0.0
	for i, col := range cols {
		w := col.Width
		if w == 0 {
			w = 40
		}
		colWidths[i] = w
		totalW += w
	}

	// Scale kolom proporsional agar pas lebar halaman
	if totalW > 0 {
		scale := effectiveW / totalW
		for i := range colWidths {
			colWidths[i] = colWidths[i] * scale
		}
	}

	// ── Baris header tabel ─────────────────────────────────────────────────────
	// Warna header: ungu (4F46E5 = rgb 79,70,229)
	pdf.SetFillColor(79, 70, 229)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Arial", "B", fontSize)
	pdf.SetLineWidth(0.3)

	for i, col := range cols {
		pdf.CellFormat(colWidths[i], 8, col.Header, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1) // pindah ke baris berikutnya

	// ── Baris data ─────────────────────────────────────────────────────────────
	pdf.SetFont("Arial", "", fontSize)
	pdf.SetLineWidth(0.2)

	rv := reflect.ValueOf(rows)
	if rv.Kind() == reflect.Slice {
		for rowIdx := 0; rowIdx < rv.Len(); rowIdx++ {
			item := rv.Index(rowIdx)

			// Dereference pointer kalau perlu
			if item.Kind() == reflect.Ptr {
				item = item.Elem()
			}

			// Warna baris selang-seling: putih dan abu-abu muda
			if rowIdx%2 == 0 {
				pdf.SetFillColor(255, 255, 255)
			} else {
				pdf.SetFillColor(245, 245, 250)
			}
			pdf.SetTextColor(40, 40, 40)

			for colIdx, col := range cols {
				val := extractField(item, col.Field)
				text := fmt.Sprintf("%v", val)
				pdf.CellFormat(colWidths[colIdx], 7, text, "1", 0, "L", true, 0, "")
			}
			pdf.Ln(-1)
		}
	}

	// ── Nomor halaman di footer ─────────────────────────────────────────────────
	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		pdf.SetFont("Arial", "I", 7)
		pdf.SetTextColor(150, 150, 150)
		pdf.CellFormat(0, 5, fmt.Sprintf("Halaman %d / {nb}", pdf.PageNo()), "", 0, "C", false, 0, "")
	})
	pdf.AliasNbPages("{nb}") // placeholder jumlah total halaman

	// Render ke buffer bytes
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to render PDF: %w", err)
	}

	return buf.Bytes(), nil
}

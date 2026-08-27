package mail

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"net/smtp"
	"os"
	"strconv"
	"strings"
)

// go:embed embed semua file .html di folder templates ke dalam binary
// Jadi file HTML tidak perlu ikut di-deploy terpisah
//
//go:embed templates/*.html
var templateFS embed.FS

// templates adalah cache semua template yang sudah di-parse
// Di-parse sekali saat init, tidak perlu parse ulang tiap kirim email
var templates = template.Must(template.ParseFS(templateFS, "templates/*.html"))

// ── Data struct untuk tiap template ──────────────────────────────────────────

// ActivationData adalah data yang diisi ke template activation.html
type ActivationData struct {
	AppName       string // nama aplikasi, dari env APP_NAME
	FullName      string // nama user, opsional
	ActivationURL string // link aktivasi lengkap
}

// PasswordResetData adalah data yang diisi ke template password_reset.html
type PasswordResetData struct {
	AppName  string // nama aplikasi
	Email    string // email penerima
	ResetURL string // link reset password lengkap
}

// ── Mailer ────────────────────────────────────────────────────────────────────

// Mailer berisi konfigurasi SMTP untuk kirim email
type Mailer struct {
	Host     string // contoh: smtp.gmail.com
	Port     int    // contoh: 587
	Username string // email pengirim
	Password string // password / app password
	From     string // alamat pengirim, contoh: "App Name <no-reply@example.com>"
}

// Mail adalah data satu email yang akan dikirim
type Mail struct {
	To      string // alamat penerima
	Subject string // subjek email
	Body    string // isi email (HTML, sudah di-render dari template)
}

// NewMailerFromEnv membuat Mailer dari environment variable
func NewMailerFromEnv() *Mailer {
	port, _ := strconv.Atoi(os.Getenv("MAIL_PORT"))
	if port == 0 {
		port = 587
	}
	from := os.Getenv("MAIL_FROM")
	if from == "" {
		from = os.Getenv("MAIL_USERNAME")
	}
	return &Mailer{
		Host:     getenv("MAIL_HOST", "localhost"),
		Port:     port,
		Username: os.Getenv("MAIL_USERNAME"),
		Password: os.Getenv("MAIL_PASSWORD"),
		From:     from,
	}
}

// Send mengirim email menggunakan net/smtp bawaan Go
func (m *Mailer) Send(mail Mail) error {
	msg := buildMessage(m.From, mail.To, mail.Subject, mail.Body)
	auth := smtp.PlainAuth("", m.Username, m.Password, m.Host)
	addr := fmt.Sprintf("%s:%d", m.Host, m.Port)
	return smtp.SendMail(addr, auth, m.Username, []string{mail.To}, []byte(msg))
}

// Render me-render template HTML dengan data yang diberikan
// Hasilnya string HTML siap kirim
func Render(templateName string, data any) (string, error) {
	var buf bytes.Buffer

	// Execute mengisi variabel {{.Field}} di template dengan data
	if err := templates.ExecuteTemplate(&buf, templateName, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildMessage menyusun raw email dengan header MIME
func buildMessage(from, to, subject, body string) string {
	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	sb.WriteString("To: " + to + "\r\n")
	sb.WriteString("Subject: " + subject + "\r\n")
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return sb.String()
}

// getenv mengambil env dengan fallback value
func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

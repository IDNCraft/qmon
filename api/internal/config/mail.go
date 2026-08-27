package config

import "strconv"

// Mail mengembalikan konfigurasi SMTP untuk pengiriman email dari environment

// MailHost hostname SMTP server, contoh: "smtp.gmail.com"
func MailHost() string {
	return getenv("MAIL_HOST", "localhost")
}

// MailPort port SMTP server (default 587 untuk TLS/STARTTLS)
func MailPort() int {
	n, err := strconv.Atoi(getenv("MAIL_PORT", "587"))
	if err != nil {
		return 587
	}
	return n
}

// MailUsername username untuk autentikasi SMTP
func MailUsername() string {
	return getenv("MAIL_USERNAME", "")
}

// MailPassword password untuk autentikasi SMTP
func MailPassword() string {
	return getenv("MAIL_PASSWORD", "")
}

// MailFrom alamat email pengirim, contoh: "no-reply@example.com"
func MailFrom() string {
	return getenv("MAIL_FROM", "no-reply@example.com")
}

// MailFromName nama pengirim yang tampil di inbox penerima
func MailFromName() string {
	return getenv("MAIL_FROM_NAME", AppName())
}

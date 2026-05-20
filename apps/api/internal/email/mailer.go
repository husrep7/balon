package email

import (
	"fmt"
	"net/smtp"
	"strings"
	"time"
)

// Mailer sends transactional emails via SMTP.
// If host is empty, emails are printed to stdout (dev mode).
type Mailer struct {
	host     string
	port     string
	user     string
	password string
	from     string
}

func New(host, port, user, password, from string) *Mailer {
	return &Mailer{host: host, port: port, user: user, password: password, from: from}
}

type BookingEmailData struct {
	CustomerName      string
	CustomerEmail     string
	ResourceName      string
	TenantName        string
	Timezone          string
	StartAt           time.Time
	EndAt             time.Time
	PriceCents        int64
	PaymentPreference string // "cash" | "card"
}

func (m *Mailer) SendBookingConfirmation(d BookingEmailData) error {
	subject, body := buildEmail(d)
	return m.send(d.CustomerEmail, subject, body)
}

func (m *Mailer) send(to, subject, body string) error {
	msg := buildMessage(m.from, to, subject, body)

	if m.host == "" {
		fmt.Printf("\n[EMAIL — dev mode]\nTo: %s\nSubject: %s\n%s\n\n", to, subject, stripHTML(body))
		return nil
	}

	// SMTP MAIL FROM mora biti čista email adresa (bez display name)
	fromAddr := extractEmail(m.from)
	auth := smtp.PlainAuth("", m.user, m.password, m.host)
	return smtp.SendMail(m.host+":"+m.port, auth, fromAddr, []string{to}, []byte(msg))
}

// extractEmail izvlači email adresu iz formata "Ime <email@domena.com>" ili vraća original
func extractEmail(from string) string {
	start := strings.Index(from, "<")
	end := strings.Index(from, ">")
	if start != -1 && end != -1 && end > start {
		return from[start+1 : end]
	}
	return from
}

func buildMessage(from, to, subject, htmlBody string) string {
	return "From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=utf-8\r\n" +
		"\r\n" +
		htmlBody
}

func buildEmail(d BookingEmailData) (subject, body string) {
	tz := time.UTC
	if d.Timezone != "" {
		if loc, err := time.LoadLocation(d.Timezone); err == nil {
			tz = loc
		}
	}
	start := d.StartAt.In(tz)
	end := d.EndAt.In(tz)
	fmtDate := start.Format("02.01.2006.")
	fmtStart := start.Format("15:04")
	fmtEnd := end.Format("15:04")
	price := fmt.Sprintf("%.2f KM", float64(d.PriceCents)/100)

	isCash := d.PaymentPreference != "card"

	if isCash {
		subject = "Potvrda rezervacije — " + d.TenantName
	} else {
		subject = "Račun za rezervaciju — " + d.TenantName
	}

	var paymentRow string
	if isCash {
		paymentRow = row("Plaćanje", "Gotovina pri dolasku")
	} else {
		paymentRow = row("Plaćanje", "Kartica — POS terminal pri dolasku")
	}

	var intro, footer string
	if isCash {
		intro = "Vaša rezervacija je uspješno kreirana. Molimo vas da platite gotovinom pri dolasku."
		footer = "Vidimo se! 👋"
	} else {
		intro = "Vaša rezervacija je uspješno kreirana. Plaćanje karticom bit će izvršeno putem POS terminala pri dolasku."
		footer = "Hvala na rezervaciji! 👋"
	}

	body = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
  <div style="margin-bottom:24px">
    <span style="font-family:Georgia,serif;font-size:28px;font-style:italic;color:#1f2937">balon</span>
    <span style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;margin-left:6px">` + d.TenantName + `</span>
  </div>
  <h2 style="font-size:18px;font-weight:600;color:#111827;margin-bottom:4px">` + subject + `</h2>
  <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Zdravo ` + d.CustomerName + `, ` + intro + `</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
    ` + row("Teren", d.ResourceName) +
		row("Datum", fmtDate) +
		row("Termin", fmtStart+" – "+fmtEnd) +
		row("Trajanje", "1h 15min") +
		row("Iznos", price) +
		paymentRow + `
  </table>
  <p style="color:#6b7280;font-size:13px">` + footer + `<br>— Tim ` + d.TenantName + `</p>
</body></html>`

	return subject, body
}

func row(label, value string) string {
	return `<tr>
    <td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;width:40%">` + label + `</td>
    <td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-weight:500;color:#111827">` + value + `</td>
  </tr>`
}

func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
		} else if r == '>' {
			inTag = false
		} else if !inTag {
			b.WriteRune(r)
		}
	}
	return b.String()
}

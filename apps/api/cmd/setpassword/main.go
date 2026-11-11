// Command setpassword sets (or creates) an admin panel login in the users table.
//
//	DATABASE_URL=... go run ./cmd/setpassword -email you@example.com
//
// The password is read from the terminal without echo. If no user with that
// email exists, one is created as role "admin" in the tenant given by -tenant.
package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/lupon/balon/apps/api/internal/store"
)

func main() {
	email := flag.String("email", "", "login email (required)")
	tenant := flag.String("tenant", "demo", "tenant slug, used only when the user must be created")
	name := flag.String("name", "", "display name, used only when the user must be created")
	flag.Parse()

	if *email == "" {
		fail("-email is required")
	}
	dsn := os.Getenv("DATABASE_URL_UNPOOLED")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		fail("set DATABASE_URL_UNPOOLED or DATABASE_URL")
	}

	pw := readPassword("Nova lozinka: ")
	if len(pw) < 8 {
		fail("lozinka mora imati najmanje 8 znakova")
	}
	if readPassword("Ponovi lozinku: ") != pw {
		fail("lozinke se ne poklapaju")
	}
	hash, err := store.HashPassword(pw)
	if err != nil {
		fail(err.Error())
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fail("ne mogu se spojiti na bazu: " + err.Error())
	}
	defer conn.Close(ctx)

	tag, err := conn.Exec(ctx, `
		UPDATE users SET password_hash = $2, status = 'active'
		WHERE lower(email) = lower($1)`, *email, hash)
	if err != nil {
		fail(err.Error())
	}
	if n := tag.RowsAffected(); n > 0 {
		fmt.Printf("Lozinka promijenjena za %s (%d nalog).\n", *email, n)
		return
	}

	displayName := *name
	if displayName == "" {
		displayName = strings.Split(*email, "@")[0]
	}
	tag, err = conn.Exec(ctx, `
		INSERT INTO users (tenant_id, email, name, role, password_hash)
		SELECT id, $2, $3, 'admin', $4 FROM tenants WHERE slug = $1`,
		*tenant, *email, displayName, hash)
	if err != nil {
		fail(err.Error())
	}
	if tag.RowsAffected() == 0 {
		fail(fmt.Sprintf("nema korisnika %s, a tenant %q ne postoji pa ga ne mogu napraviti", *email, *tenant))
	}
	fmt.Printf("Napravljen admin nalog %s u tenantu %q.\n", *email, *tenant)
}

func readPassword(prompt string) string {
	fmt.Fprint(os.Stderr, prompt)
	stty := func(arg string) {
		cmd := exec.Command("stty", arg)
		cmd.Stdin = os.Stdin
		_ = cmd.Run()
	}
	stty("-echo")
	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	stty("echo")
	fmt.Fprintln(os.Stderr)
	return strings.TrimRight(line, "\r\n")
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "Greška:", msg)
	os.Exit(1)
}

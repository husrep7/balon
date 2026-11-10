// Package migrations embeds the SQL migration files so binaries and
// serverless functions can apply them without a files-on-disk layout.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS

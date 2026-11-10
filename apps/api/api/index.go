// Package handler is the Vercel serverless entrypoint for the Balon API.
// Vercel compiles this file outside the module tree, so it may only import
// non-internal packages; all wiring lives in pkg/serverless.
package handler

import (
	"net/http"

	"github.com/lupon/balon/apps/api/pkg/serverless"
)

// Handler serves every API request.
func Handler(w http.ResponseWriter, r *http.Request) {
	serverless.Handler(w, r)
}

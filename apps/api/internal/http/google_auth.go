package http

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/lupon/balon/apps/api/internal/auth"
	"github.com/lupon/balon/apps/api/internal/store"
)

func googleOAuthConfig(clientID, clientSecret, baseURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  baseURL + "/api/auth/google/callback",
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func randomState() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

type googleUser struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func registerGoogleAuth(r gin.IRouter, clientID, clientSecret, apiBaseURL, appURL string, stores *store.Stores, signer *auth.LocalSigner) {
	if clientID == "" {
		return
	}

	cfg := googleOAuthConfig(clientID, clientSecret, apiBaseURL)

	r.GET("/api/auth/google", func(c *gin.Context) {
		state := randomState()
		c.SetCookie("oauth_state", state, 600, "/", "", false, true)
		url := cfg.AuthCodeURL(state, oauth2.AccessTypeOnline)
		c.Redirect(http.StatusTemporaryRedirect, url)
	})

	r.GET("/api/auth/google/callback", func(c *gin.Context) {
		cookie, err := c.Cookie("oauth_state")
		if err != nil || cookie != c.Query("state") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid state"})
			return
		}

		token, err := cfg.Exchange(context.Background(), c.Query("code"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code exchange failed"})
			return
		}

		client := cfg.Client(context.Background(), token)
		resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user info"})
			return
		}
		defer resp.Body.Close()

		var gu googleUser
		if err := json.NewDecoder(resp.Body).Decode(&gu); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse user info"})
			return
		}

		// Pronađi ili kreiraj customer account
		acc, err := stores.CustomerAccounts.FindOrCreateGoogle(c.Request.Context(), gu.Email, gu.Name)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create account"})
			return
		}

		jwt, err := signer.SignCustomer(&auth.CustomerClaims{
			AccountID: acc.ID,
			Email:     acc.Email,
			Name:      acc.Name,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sign token"})
			return
		}

		// Redirect na frontend sa tokenom
		c.Redirect(http.StatusTemporaryRedirect,
			fmt.Sprintf("%s?token=%s&name=%s&email=%s", appURL, jwt, gu.Name, gu.Email))
	})
}

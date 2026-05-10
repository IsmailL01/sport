// OTP handlers — request-code / login-with-code. Phase 8 / M4.
package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/runningecosystem/backend/identity/internal/domain"
)

// === DTOs ===

type requestCodeRequest struct {
	Email string `json:"email"`
}

type requestCodeResponse struct {
	// DevCode is set only in dev mode (visible in API response). Use this
	// for smoke-tests; production stays empty (code arrives via email).
	DevCode string `json:"devCode,omitempty"`
}

type loginWithCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// === handlers ===

func (h *AuthHandler) requestCode(w http.ResponseWriter, r *http.Request) {
	var req requestCodeRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	devCode, err := h.otp.RequestCode(ctx, req.Email, h.DevMode)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	resp := requestCodeResponse{}
	if h.DevMode {
		resp.DevCode = devCode
	}
	writeJSON(w, http.StatusAccepted, resp)
}

func (h *AuthHandler) loginWithCode(w http.ResponseWriter, r *http.Request) {
	var req loginWithCodeRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	user, pair, err := h.otp.LoginWithCode(ctx, req.Email, req.Code, r.UserAgent())
	if err != nil {
		// Single bucket для всех auth-related ошибок (avoid enumeration).
		if errors.Is(err, domain.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "")
			return
		}
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, &tokenPairResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User:         toUserResp(user),
	})
}

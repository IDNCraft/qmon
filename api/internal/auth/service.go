package auth

import (
	"qmon-api/internal/config"
	"qmon-api/internal/utils"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrNotActivated       = errors.New("account not activated")
	ErrTokenExpired       = errors.New("token expired")
	ErrTokenNotFound      = errors.New("token not found")
)

type Service struct {
	Repo Repository
}

func (s *Service) Login(email, password string) (TokenResponse, error) {
	u, err := s.Repo.FindByEmail(email)
	if err != nil {
		return TokenResponse{}, ErrInvalidCredentials
	}

	if bcrypt.CompareHashAndPassword([]byte(u.HashedPwd), []byte(password)) != nil {
		return TokenResponse{}, ErrInvalidCredentials
	}
	if u.ActivatedAt == nil {
		return TokenResponse{}, ErrNotActivated
	}

	accessToken, err := s.issueToken(u.ID)
	if err != nil {
		return TokenResponse{}, err
	}
	refreshToken, err := s.createRefreshToken(u.ID)
	if err != nil {
		return TokenResponse{}, err
	}

	jExpireSecs := config.JWTExpireHours() * 3600
	rExpireSecs := config.RefreshTokenExpireDays() * 86400

	return TokenResponse{
		JToken:     accessToken,
		RToken:     refreshToken,
		JExpiresIn: jExpireSecs,
		RExpiresIn: rExpireSecs,
		User: &UserInfo{
			ID:       u.ID,
			UID:      u.UID,
			FullName: u.FullName,
			Email:    u.Email,
			Roles:    []string{},
		},
	}, nil
}

// ResetDefaultAdmin updates the admin credentials ONLY if the current credentials are the default ones.
func (s *Service) ResetDefaultAdmin(newEmail, newPassword string) error {
	// 1. Verify if the default admin still exists
	u, err := s.Repo.FindByEmail("cli@qmon.ai")
	if err != nil {
		return errors.New("default admin account not found or already changed")
	}

	// 2. Verify the hash is indeed for "password"
	if bcrypt.CompareHashAndPassword([]byte(u.HashedPwd), []byte("password")) != nil {
		return errors.New("default password has already been changed")
	}

	// 3. Hash the new password
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// 4. Update the email and password
	if err := s.Repo.UpdateUserCredentials("cli@qmon.ai", newEmail, string(hash)); err != nil {
		return err
	}

	return nil
}

func (s *Service) RefreshToken(refreshToken string) (TokenResponse, error) {
	userID, expiresAt, err := s.Repo.FindRefreshToken(refreshToken)
	if err != nil {
		return TokenResponse{}, err
	}

	if time.Now().After(expiresAt) {
		_ = s.Repo.DeleteRefreshToken(refreshToken)
		return TokenResponse{}, ErrTokenExpired
	}

	accessToken, err := s.issueToken(userID)
	if err != nil {
		return TokenResponse{}, err
	}

	newRefresh, err := s.createRefreshToken(userID)
	if err != nil {
		return TokenResponse{}, err
	}
	_ = s.Repo.DeleteRefreshToken(refreshToken)

	jExpireSecs := config.JWTExpireHours() * 3600
	rExpireSecs := config.RefreshTokenExpireDays() * 86400

	return TokenResponse{
		JToken:     accessToken,
		RToken:     newRefresh,
		JExpiresIn: jExpireSecs,
		RExpiresIn: rExpireSecs,
	}, nil
}

func (s *Service) RevokeRefreshToken(refreshToken string) error {
	return s.Repo.DeleteRefreshToken(refreshToken)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (s *Service) issueToken(userID int) (string, error) {
	expiry := time.Duration(config.JWTExpireHours()) * time.Hour
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(expiry).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.JWTSecret()))
}

func (s *Service) createRefreshToken(userID int) (string, error) {
	token := utils.RandomHex(40)
	expiresAt := time.Now().Add(time.Duration(config.RefreshTokenExpireDays()) * 24 * time.Hour)
	if err := s.Repo.InsertRefreshToken(userID, token, expiresAt); err != nil {
		return "", err
	}
	return token, nil
}

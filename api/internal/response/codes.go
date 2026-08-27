package response

const (
	// Auth
	ErrAuthInvalidCredentials  = "AUTH_INVALID_CREDENTIALS"
	ErrAuthAccountNotActivated = "AUTH_ACCOUNT_NOT_ACTIVATED"
	ErrAuthTokenExpired        = "AUTH_TOKEN_EXPIRED"
	ErrAuthTokenInvalid        = "AUTH_TOKEN_INVALID"
	ErrAuthRefreshTokenInvalid = "AUTH_REFRESH_TOKEN_INVALID"
	ErrAuthAlreadyActivated    = "AUTH_ALREADY_ACTIVATED"

	// User
	ErrUserEmailDuplicate = "USER_EMAIL_DUPLICATE"
	ErrUserNotFound       = "USER_NOT_FOUND"

	// Role & Permission
	ErrRoleNotFound       = "ROLE_NOT_FOUND"
	ErrPermissionNotFound = "PERMISSION_NOT_FOUND"
	ErrPermissionDenied   = "PERMISSION_DENIED"

	// Password
	ErrPasswordWrong          = "PASSWORD_WRONG"
	ErrPasswordResetExpired   = "PASSWORD_RESET_EXPIRED"
	ErrPasswordResetNotFound  = "PASSWORD_RESET_NOT_FOUND"

	// Generic
	ErrValidation   = "VALIDATION_ERROR"
	ErrBadRequest   = "BAD_REQUEST"
	ErrNotFound     = "NOT_FOUND"
	ErrServerError  = "SERVER_ERROR"
	ErrUnauthorized = "UNAUTHORIZED"
	ErrForbidden    = "FORBIDDEN"
)

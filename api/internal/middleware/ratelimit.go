package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// ipLimiter menyimpan rate limiter per IP beserta waktu terakhir diakses
type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// limiterStore menyimpan semua rate limiter per IP di memory
type limiterStore struct {
	mu       sync.Mutex
	limiters map[string]*ipLimiter
	rps      rate.Limit // request per second
	burst    int        // maksimal burst request
}

func newStore(rps float64, burst int) *limiterStore {
	s := &limiterStore{
		limiters: make(map[string]*ipLimiter),
		rps:      rate.Limit(rps),
		burst:    burst,
	}
	// Goroutine cleanup: hapus IP yang tidak aktif selama 10 menit
	go s.cleanup()
	return s
}

func (s *limiterStore) get(ip string) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, exists := s.limiters[ip]
	if !exists {
		l := rate.NewLimiter(s.rps, s.burst)
		s.limiters[ip] = &ipLimiter{limiter: l, lastSeen: time.Now()}
		return l
	}
	entry.lastSeen = time.Now()
	return entry.limiter
}

func (s *limiterStore) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		s.mu.Lock()
		for ip, entry := range s.limiters {
			// Hapus IP yang tidak aktif lebih dari 10 menit
			if time.Since(entry.lastSeen) > 10*time.Minute {
				delete(s.limiters, ip)
			}
		}
		s.mu.Unlock()
	}
}

// RateLimit membatasi request per IP berdasarkan token bucket.
// rps = request per second yang diizinkan, burst = lonjakan maksimal.
//
// Contoh untuk auth endpoints (10 req/menit = ~0.17 rps, burst 5):
//
//	authGroup.Use(middleware.RateLimit(0.17, 5))
func RateLimit(rps float64, burst int) gin.HandlerFunc {
	store := newStore(rps, burst)

	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := store.get(ip)

		// Allow() tidak memblokir — langsung return false kalau bucket kosong
		if !limiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Please try again later.",
			})
			return
		}
		c.Next()
	}
}

---
title: Middleware
description: Add middleware for authentication, logging, CORS, rate limiting, and custom request processing in Velocity.
weight: 40
---

Velocity provides a flexible middleware system for HTTP request/response processing, allowing you to add cross-cutting concerns like authentication, logging, CORS, and rate limiting to your application.

## Quick Start

Middleware in Velocity wraps HTTP handlers to add functionality:

```go
func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()

        // Before request
        log.Info("Request started",
            "method", r.Method,
            "path", r.URL.Path,
        )

        // Process request
        next.ServeHTTP(w, r)

        // After request
        log.Info("Request completed",
            "duration", time.Since(start),
        )
    })
}
```

## Handler Functions with Context

Velocity handlers use a Context-based pattern that provides error handling and convenient access to request/response objects:

```go
// Handler signature
func(ctx *router.Context) error

// Example handler
func (h *HomeController) Index(ctx *router.Context) error {
    // Access request and response
    userID := ctx.Request.URL.Query().Get("user_id")

    // Return JSON response
    return ctx.JSON(map[string]string{
        "message": "Welcome",
        "user": userID,
    })
}

// Handler with error
func (h *UserController) Profile(ctx *router.Context) error {
    user, err := getUserFromContext(ctx.Request.Context())
    if err != nil {
        return err  // Error is handled automatically
    }

    return ctx.JSON(user)
}
```

## Using Middleware

### Global Middleware

Apply middleware to all routes:

```go
// main.go
func main() {
    r := router.Get()

    // Apply global middleware
    r.Use(
        middleware.RecoveryMiddleware,  // Catch panics first
        middleware.LoggingMiddleware,   // Log all requests
        middleware.CORSMiddleware,      // Handle CORS
    )

    router.LoadRoutes()
    http.ListenAndServe(":4000", r)
}
```

### Route Group Middleware

Apply middleware to specific route groups:

```go
func init() {
    router.Register(func(r router.Router) {
        // Create controller instance
        adminController := controllers.AdminController{}
        
        // Admin routes with authentication
        admin := r.Group("/admin")
        admin.Use(
            middleware.AuthMiddleware,
            middleware.NewRateLimitMiddleware(50),
        )
        {
            admin.Get("/", adminController.Dashboard)
            admin.Get("/users", adminController.Users)
        }
    })
}
```

### Route-Specific Middleware

Apply middleware to individual routes:

```go
func init() {
    router.Register(func(r router.Router) {
        // Create controller instances
        homeController := controllers.HomeController{}
        userController := controllers.UserController{}
        contactController := controllers.ContactController{}
        
        // Public routes - no middleware
        r.Get("/", homeController.Index)
        
        // Protected route with middleware
        r.Get("/profile", userController.Profile).Use(
            middleware.AuthMiddleware,
            middleware.ProfileMiddleware,
        )
        
        // Chain multiple middleware
        r.Post("/contact", contactController.Submit).
            Use(middleware.RateLimitMiddleware).
            Use(middleware.CSRFMiddleware).
            Use(middleware.ValidationMiddleware)
    })
}
```

## Middleware Patterns

### Standard Middleware Signature

```go
func MyMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Before request processing

        next.ServeHTTP(w, r)

        // After request processing
    })
}
```

### Parameterized Middleware

```go
func RateLimitMiddleware(limit int) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Use limit parameter
            next.ServeHTTP(w, r)
        })
    }
}

// Usage
r.Use(RateLimitMiddleware(100))
```

### Middleware Chaining

```go
// Method 1: Variadic arguments
r.Get("/dashboard", handler).Use(Auth, CSRF, RateLimit)

// Method 2: Chain calls
r.Get("/api/data", handler).
    Use(APIAuth).
    Use(RateLimit).
    Use(Cache)

// Method 3: Group with inherited middleware
api := r.Group("/api").Use(APIAuth, RateLimit)
v1 := api.Group("/v1").Use(JSONOnly)  // Inherits api middleware
```

## Common Middleware Examples

### Authentication Middleware

```go
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")

        if token == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        // Validate token and get user
        user, err := validateToken(token)
        if err != nil {
            http.Error(w, "Invalid token", http.StatusUnauthorized)
            return
        }

        // Add user to context
        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### CORS Middleware

```go
func CORSMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if r.Method == "OPTIONS" {
            w.WriteHeader(http.StatusOK)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

### Rate Limiting Middleware

```go
func NewRateLimitMiddleware(requestsPerMin int) func(http.Handler) http.Handler {
    limiter := rate.NewLimiter(rate.Limit(requestsPerMin/60), requestsPerMin)

    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if !limiter.Allow() {
                http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

### Recovery Middleware

```go
func RecoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                log.Error("Panic recovered",
                    "error", fmt.Sprintf("%v", err),
                    "stack", debug.Stack(),
                )
                http.Error(w, "Internal Server Error", http.StatusInternalServerError)
            }
        }()

        next.ServeHTTP(w, r)
    })
}
```

## Middleware Order

Middleware execution order matters:

```go
// Execution order: Recovery -> Logging -> Auth -> Handler
r.Use(
    RecoveryMiddleware,  // 1. Catch panics (outermost)
    LoggingMiddleware,   // 2. Log request/response
    AuthMiddleware,      // 3. Check authentication
)
```

The first middleware in the list wraps all others, so it executes first on the way in and last on the way out.

## Context Values

Pass data through middleware using context:

```go
// Set value in middleware
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Authenticate and add user to context
        userID := authenticateUser(r)
        ctx := context.WithValue(r.Context(), "userID", userID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Get value in handler
func (h *UserController) Dashboard(ctx *router.Context) error {
    userID := ctx.Request.Context().Value("userID").(string)

    user, err := getUserByID(userID)
    if err != nil {
        return err
    }

    return ctx.JSON(user)
}
```

## Response Writer Wrapper

Capture response details:

```go
type ResponseWriter struct {
    http.ResponseWriter
    status int
    size   int
}

func (rw *ResponseWriter) WriteHeader(status int) {
    rw.status = status
    rw.ResponseWriter.WriteHeader(status)
}

func (rw *ResponseWriter) Write(b []byte) (int, error) {
    size, err := rw.ResponseWriter.Write(b)
    rw.size += size
    return size, err
}
```

## Testing Middleware

```go
func TestAuthMiddleware(t *testing.T) {
    handler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    // Test without token
    req := httptest.NewRequest("GET", "/", nil)
    w := httptest.NewRecorder()
    handler.ServeHTTP(w, req)

    if w.Code != http.StatusUnauthorized {
        t.Errorf("Expected 401, got %d", w.Code)
    }

    // Test with valid token
    req.Header.Set("Authorization", "valid-token")
    w = httptest.NewRecorder()
    handler.ServeHTTP(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("Expected 200, got %d", w.Code)
    }
}
```

## Best Practices

1. **Order Matters**: Apply middleware in the correct order (recovery first, then logging, then auth)
2. **Keep It Simple**: Each middleware should have a single responsibility
3. **Use Context**: Pass data between middleware using context, not global variables
4. **Handle Errors**: Always handle errors gracefully
5. **Test Thoroughly**: Write tests for each middleware component
6. **Avoid State**: Middleware should be stateless when possible
7. **Document Dependencies**: Clearly document what each middleware expects and provides

## Performance Considerations

- Middleware adds overhead to each request
- Keep middleware lightweight and fast
- Avoid blocking operations in middleware
- Consider caching for expensive operations
- Profile your middleware stack under load


---
title: "HTTP Router"
description: Type-safe HTTP routing with request tracing, panic recovery, and Context-based API in Velocity.
weight: 51
---

The Velocity HTTP router provides a modern, type-safe routing system with built-in request tracing, automatic panic recovery, and an ergonomic Context-based API inspired by Fiber and Echo.

## Quick Start

```go
package main

import (
    "net/http"

    "github.com/velocitykode/velocity/pkg/router"
)

func main() {
    r := router.Get()

    r.Get("/users/{id}", func(ctx *router.Context) error {
        id := ctx.Param("id")

        return ctx.JSON(200, map[string]interface{}{
            "id":   id,
            "name": "John Doe",
        })
    })

    http.ListenAndServe(":3000", r)
}
```

## Core Features

### Context-Based Handlers

All route handlers receive a `*router.Context` object that provides access to the request, response, and helper methods:

```go
r.Get("/api/user", func(ctx *router.Context) error {
    // Access request data
    userAgent := ctx.Request.Header.Get("User-Agent")

    // Set response headers
    ctx.Response.Header().Set("X-Custom-Header", "value")

    // Return JSON response
    return ctx.JSON(200, map[string]string{
        "message": "Hello, World!",
    })
})
```

### HTTP Methods

The router supports all standard HTTP methods:

```go
r.Get("/users", listUsers)
r.Post("/users", createUser)
r.Put("/users/{id}", updateUser)
r.Patch("/users/{id}", patchUser)
r.Delete("/users/{id}", deleteUser)
```

### Route Parameters

Extract URL parameters using `ctx.Param()`:

```go
r.Get("/users/{id}", func(ctx *router.Context) error {
    // Get string parameter
    id := ctx.Param("id")

    return ctx.JSON(200, map[string]interface{}{
        "id": id,
    })
})
```

### Query Parameters

Extract query parameters using `ctx.Query()`:

```go
r.Get("/search", func(ctx *router.Context) error {
    // String query parameter
    query := ctx.Query("q")

    // Get all query parameters via Request
    page := ctx.Request.URL.Query().Get("page")

    return ctx.JSON(200, map[string]interface{}{
        "query": query,
        "page":  page,
    })
})
```

## Request Handling

### JSON Binding

Parse JSON request bodies into structs using `ctx.Bind()`:

```go
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
    Age   int    `json:"age"`
}

r.Post("/users", func(ctx *router.Context) error {
    var req CreateUserRequest
    if err := ctx.Bind(&req); err != nil {
        return ctx.JSON(400, map[string]string{"error": "Invalid request body"})
    }

    // Use req.Name, req.Email, req.Age
    return ctx.JSON(201, req)
})
```

### Form Data

Access form data via the underlying Request:

```go
r.Post("/contact", func(ctx *router.Context) error {
    // Parse form
    if err := ctx.Request.ParseForm(); err != nil {
        return ctx.JSON(400, map[string]string{"error": "Invalid form"})
    }

    name := ctx.Request.FormValue("name")
    email := ctx.Request.FormValue("email")

    return ctx.JSON(200, map[string]string{
        "name":  name,
        "email": email,
    })
})
```

## Response Handling

### JSON Responses

```go
r.Get("/api/data", func(ctx *router.Context) error {
    data := map[string]interface{}{
        "status": "success",
        "data":   []string{"item1", "item2"},
    }
    return ctx.JSON(200, data)
})
```

### Redirects

Use `ctx.Redirect()` for HTTP redirects:

```go
r.Get("/old-path", func(ctx *router.Context) error {
    return ctx.Redirect(301, "/new-path")
})

r.Post("/login", func(ctx *router.Context) error {
    // After successful login
    return ctx.Redirect(303, "/dashboard")
})
```

### Raw Responses

Access the underlying `http.ResponseWriter` for full control:

```go
r.Get("/download", func(ctx *router.Context) error {
    ctx.Response.Header().Set("Content-Type", "application/octet-stream")
    ctx.Response.Header().Set("Content-Disposition", "attachment; filename=file.txt")
    ctx.Response.Write([]byte("file contents"))
    return nil
})
```

## Request Tracing

The router automatically extracts trace and request IDs from headers:

```go
router.GET("/api/log", func(ctx *velocity.Ctx) error {
    log.Info("Processing request",
        "trace_id", ctx.TraceID,      // From X-Trace-ID header
        "request_id", ctx.RequestID,  // From X-Request-ID header
    )

    return ctx.JSON(200, map[string]string{
        "trace_id": ctx.TraceID,
        "request_id": ctx.RequestID,
    })
})
```

Clients should send these headers:

```bash
curl -H "X-Trace-ID: trace-123" \
     -H "X-Request-ID: req-456" \
     http://localhost:3000/api/log
```

## Request-Scoped Storage

Store and retrieve data within a request's lifecycle using Locals:

```go
// Middleware sets user data
func AuthMiddleware(next velocity.HandlerFunc) velocity.HandlerFunc {
    return func(ctx *velocity.Ctx) error {
        // Authenticate user...
        ctx.SetLocal("user_id", 123)
        ctx.SetLocal("username", "john")
        return next(ctx)
    }
}

// Handler retrieves it
router.GET("/profile", func(ctx *velocity.Ctx) error {
    userID := ctx.Locals("user_id").(int)
    username := ctx.Locals("username").(string)

    return ctx.JSON(200, map[string]interface{}{
        "user_id": userID,
        "username": username,
    })
})
```

## Error Handling

### Predefined Errors

Use built-in error types for common HTTP errors:

```go
router.GET("/users/{id}", func(ctx *velocity.Ctx) error {
    id, err := ctx.ParamInt("id")
    if err != nil {
        return velocity.ErrBadRequest  // 400
    }

    user := findUser(id)
    if user == nil {
        return velocity.ErrNotFound  // 404
    }

    if !hasPermission(ctx) {
        return velocity.ErrForbidden  // 403
    }

    return ctx.JSON(200, user)
})
```

Available predefined errors:
- `ErrBadRequest` (400)
- `ErrUnauthorized` (401)
- `ErrForbidden` (403)
- `ErrNotFound` (404)
- `ErrMethodNotAllowed` (405)
- `ErrInternalServerError` (500)
- `ErrBadGateway` (502)
- `ErrServiceUnavailable` (503)

### Custom Errors

Create custom error responses:

```go
router.POST("/users", func(ctx *velocity.Ctx) error {
    var user User
    if err := ctx.BindJSON(&user); err != nil {
        return &velocity.Error{
            Code:    422,
            Message: "Validation failed: " + err.Error(),
        }
    }

    return ctx.JSON(201, user)
})
```

### Error Helper Methods

```go
router.GET("/api/data", func(ctx *velocity.Ctx) error {
    if !authorized {
        return ctx.Unauthorized("Please log in")
    }

    if !hasAccess {
        return ctx.Forbidden("Access denied")
    }

    if invalidInput {
        return ctx.BadRequest("Invalid input")
    }

    if serverError {
        return ctx.InternalServerError("Server error")
    }

    return ctx.JSON(200, data)
})
```

### Custom Error Handler

Override the default error handler:

```go
func CustomErrorHandler(ctx *velocity.Ctx, err error) {
    code := 500
    message := "Internal Server Error"

    if e, ok := err.(*velocity.Error); ok {
        code = e.Code
        message = e.Message
    }

    // Log error
    log.Error("Request error",
        "error", err,
        "trace_id", ctx.TraceID,
        "error_id", ctx.ErrorID,
    )

    // Custom response format
    ctx.JSON(code, map[string]interface{}{
        "success": false,
        "error": message,
        "error_id": ctx.ErrorID,
        "timestamp": time.Now().Unix(),
    })
}

router := velocity.NewRouter(velocity.Config{
    ErrorHandler: CustomErrorHandler,
})
```

### Automatic Panic Recovery

The router automatically recovers from panics and converts them to errors:

```go
router.GET("/panic", func(ctx *velocity.Ctx) error {
    panic("something went wrong")
    // Automatically caught and returned as 500 error
})
```

## Middleware

### Route-Specific Middleware

Apply middleware to specific routes:

```go
func LoggingMiddleware(next velocity.HandlerFunc) velocity.HandlerFunc {
    return func(ctx *velocity.Ctx) error {
        start := time.Now()
        err := next(ctx)
        log.Info("Request completed",
            "path", ctx.Request.URL.Path,
            "duration", time.Since(start),
        )
        return err
    }
}

router.GET("/api/users", getUsers).
    Middleware(LoggingMiddleware)
```

### Global Middleware

Apply middleware to all routes:

```go
router.Middleware(LoggingMiddleware, AuthMiddleware)

router.GET("/api/users", getUsers)
router.GET("/api/posts", getPosts)
// Both routes use LoggingMiddleware and AuthMiddleware
```

### Middleware Order

Middleware executes in this order:
1. Global middleware (outer → inner)
2. Group middleware (outer → inner)
3. Route middleware (outer → inner)
4. Handler

```go
// Request flow:
// GlobalMiddleware1 → GlobalMiddleware2 →
// GroupMiddleware → RouteMiddleware → Handler
```

### Authentication Middleware Example

```go
func AuthMiddleware(next velocity.HandlerFunc) velocity.HandlerFunc {
    return func(ctx *velocity.Ctx) error {
        token := ctx.Get("Authorization")

        if token == "" {
            return ctx.Unauthorized("Missing token")
        }

        user, err := validateToken(token)
        if err != nil {
            return ctx.Unauthorized("Invalid token")
        }

        ctx.SetLocal("user", user)
        return next(ctx)
    }
}

router.GET("/api/profile", getProfile).
    Middleware(AuthMiddleware)
```

## Route Groups

Group related routes with shared prefixes and middleware:

```go
// API v1 routes
api := router.Prefix("/api/v1")
api.GET("/users", listUsers)
api.POST("/users", createUser)
api.GET("/users/{id}", getUser)

// Admin routes with auth middleware
admin := router.Prefix("/admin")
admin.Middleware(AdminAuthMiddleware)
admin.GET("/dashboard", adminDashboard)
admin.GET("/users", adminUsers)
admin.POST("/settings", updateSettings)

// Nested groups
v2 := router.Prefix("/api/v2")
usersGroup := v2.Prefix("/users")
usersGroup.GET("/", listUsers)
usersGroup.POST("/", createUser)
usersGroup.GET("/{id}", getUser)
```

## Named Routes

Name routes for URL generation:

```go
router.GET("/users/{id}", getUser).Name("user.show")
router.POST("/users", createUser).Name("user.create")
router.PUT("/users/{id}", updateUser).Name("user.update")

// Generate URLs
url, err := router.URL("user.show", map[string]string{
    "id": "123",
})
// url = "/users/123"
```

## Header Manipulation

### Reading Headers

```go
router.GET("/api/check", func(ctx *velocity.Ctx) error {
    userAgent := ctx.Get("User-Agent")
    accept := ctx.Get("Accept")
    contentType := ctx.Get("Content-Type")

    return ctx.JSON(200, map[string]string{
        "user_agent": userAgent,
        "accept": accept,
        "content_type": contentType,
    })
})
```

### Setting Headers

```go
router.GET("/api/data", func(ctx *velocity.Ctx) error {
    ctx.Set("X-API-Version", "1.0")
    ctx.Set("X-Rate-Limit", "100")
    ctx.Set("Cache-Control", "no-cache")

    return ctx.JSON(200, data)
})
```

## Integration with Standard Middleware

Wrap standard `http.Handler` middleware for use with the router:

```go
import "github.com/rs/cors"

// Standard CORS middleware
corsMiddleware := cors.New(cors.Options{
    AllowedOrigins: []string{"*"},
}).Handler

// Wrap it for use with Velocity router
router.UseStandardMiddleware(corsMiddleware)
```

## Complete Example

```go
package main

import (
    "net/http"
    "time"

    github.com/velocitykode/velocity
    "github.com/velocitykode/velocity/pkg/log"
)

type User struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

func LoggingMiddleware(next velocity.HandlerFunc) velocity.HandlerFunc {
    return func(ctx *velocity.Ctx) error {
        start := time.Now()
        log.Info("Request started",
            "method", ctx.Request.Method,
            "path", ctx.Request.URL.Path,
            "trace_id", ctx.TraceID,
        )

        err := next(ctx)

        log.Info("Request completed",
            "duration", time.Since(start),
            "trace_id", ctx.TraceID,
        )
        return err
    }
}

func AuthMiddleware(next velocity.HandlerFunc) velocity.HandlerFunc {
    return func(ctx *velocity.Ctx) error {
        token := ctx.Get("Authorization")
        if token == "" {
            return ctx.Unauthorized("Missing authorization token")
        }

        // Validate token and set user
        ctx.SetLocal("user_id", 1)
        return next(ctx)
    }
}

func main() {
    router := velocity.NewRouter()

    // Global middleware
    router.Middleware(LoggingMiddleware)

    // Public routes
    router.GET("/", func(ctx *velocity.Ctx) error {
        return ctx.JSON(200, map[string]string{
            "message": "Welcome to the API",
        })
    })

    // API routes
    api := router.Prefix("/api")

    // Public API endpoints
    api.GET("/status", func(ctx *velocity.Ctx) error {
        return ctx.JSON(200, map[string]string{
            "status": "ok",
            "version": "1.0.0",
        })
    })

    // Protected API endpoints
    users := api.Prefix("/users")
    users.Middleware(AuthMiddleware)

    users.GET("/", func(ctx *velocity.Ctx) error {
        page := ctx.QueryInt("page", 1)
        limit := ctx.QueryInt("limit", 10)

        // Fetch users...
        users := []User{
            {ID: 1, Name: "Alice", Email: "alice@example.com"},
            {ID: 2, Name: "Bob", Email: "bob@example.com"},
        }

        return ctx.JSON(200, map[string]interface{}{
            "users": users,
            "page": page,
            "limit": limit,
        })
    })

    users.GET("/{id}", func(ctx *velocity.Ctx) error {
        id, err := ctx.ParamInt("id")
        if err != nil {
            return ctx.BadRequest("Invalid user ID")
        }

        // Fetch user...
        user := User{
            ID:    id,
            Name:  "Alice",
            Email: "alice@example.com",
        }

        return ctx.JSON(200, user)
    })

    users.POST("/", func(ctx *velocity.Ctx) error {
        var user User
        if err := ctx.BindJSON(&user); err != nil {
            return ctx.BadRequest("Invalid request body")
        }

        // Create user...
        user.ID = 3

        return ctx.Status(201).JSON(user)
    })

    log.Info("Server starting on :3000")
    http.ListenAndServe(":3000", router)
}
```

## Testing Routes

```go
package main

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"

    github.com/velocitykode/velocity
)

func TestGetUser(t *testing.T) {
    router := velocity.NewRouter()

    router.GET("/users/{id}", func(ctx *velocity.Ctx) error {
        id, _ := ctx.ParamInt("id")
        return ctx.JSON(200, map[string]int{"id": id})
    })

    req := httptest.NewRequest("GET", "/users/123", nil)
    rec := httptest.NewRecorder()

    router.ServeHTTP(rec, req)

    if rec.Code != 200 {
        t.Errorf("Expected status 200, got %d", rec.Code)
    }

    expected := `{"id":123}`
    if strings.TrimSpace(rec.Body.String()) != expected {
        t.Errorf("Expected %s, got %s", expected, rec.Body.String())
    }
}

func TestJSONBinding(t *testing.T) {
    router := velocity.NewRouter()

    router.POST("/users", func(ctx *velocity.Ctx) error {
        var user struct {
            Name string `json:"name"`
        }
        if err := ctx.BindJSON(&user); err != nil {
            return velocity.ErrBadRequest
        }
        return ctx.JSON(201, user)
    })

    body := strings.NewReader(`{"name":"Alice"}`)
    req := httptest.NewRequest("POST", "/users", body)
    req.Header.Set("Content-Type", "application/json")
    rec := httptest.NewRecorder()

    router.ServeHTTP(rec, req)

    if rec.Code != 201 {
        t.Errorf("Expected status 201, got %d", rec.Code)
    }
}
```

## Best Practices

1. **Use Type-Safe Helpers**: Prefer `ParamInt()`, `QueryInt()`, `QueryBool()` over manual parsing
2. **Return Errors**: Always return errors from handlers instead of writing responses directly
3. **Use Predefined Errors**: Use `ErrBadRequest`, `ErrNotFound`, etc. for consistency
4. **Leverage Request Tracing**: Include `TraceID` and `RequestID` in logs for debugging
5. **Store Request Data in Locals**: Use `SetLocal()` to pass data between middleware and handlers
6. **Name Important Routes**: Use `.Name()` for routes you need to generate URLs for
7. **Group Related Routes**: Use `Prefix()` to organize routes logically
8. **Apply Middleware Appropriately**: Use global middleware for cross-cutting concerns, route middleware for specific needs
9. **Handle Panics Gracefully**: The router handles panics automatically, but avoid them when possible
10. **Test Thoroughly**: Write tests for all routes, especially error cases

## Performance Tips

1. **Reuse Router Instance**: Create the router once and reuse it
2. **Use Locals Efficiently**: The locals storage uses a slice internally for fast access
3. **Minimize Middleware**: Only apply middleware where needed
4. **Bind JSON Once**: Don't parse the request body multiple times
5. **Return Early**: Return errors as soon as validation fails
6. **Use Appropriate Status Codes**: Helps with caching and client behavior

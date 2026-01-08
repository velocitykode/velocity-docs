---
title: Handlers
description: Organize HTTP request handling with Velocity handlers and Context-based handlers.
weight: 20
---

Handlers in Velocity handle HTTP requests and responses, providing a clean way to organize your application logic following the MVC pattern. Handlers use Context-based functions that receive a `*router.Context` and return an `error`.

## Quick Start

Creating and using handlers in Velocity:

```go
// internal/handlers/user_handler.go
package handlers

import (
    "myapp/internal/models"

    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
    return &UserHandler{}
}

func (c *UserHandler) Index(ctx *router.Context) error {
    users, err := models.User{}.All()
    if err != nil {
        return ctx.JSON(500, map[string]string{"error": "Failed to load users"})
    }

    view.Render(ctx.Response, ctx.Request, "users/index", view.Props{
        "users": users,
    })
    return nil
}

func (c *UserHandler) Show(ctx *router.Context) error {
    id := ctx.Param("id")
    user, err := models.User{}.Find(id)

    if err != nil {
        return ctx.JSON(404, map[string]string{"error": "User not found"})
    }

    view.Render(ctx.Response, ctx.Request, "users/show", view.Props{
        "user": user,
    })
    return nil
}
```

## Handler Structure

### Basic Handler

```go
package handlers

import (
    "myapp/internal/models"

    "github.com/velocitykode/velocity/pkg/auth"
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

type PostHandler struct{}

func NewPostHandler() *PostHandler {
    return &PostHandler{}
}

// Show all posts
func (c *PostHandler) Index(ctx *router.Context) error {
    posts, err := models.Post{}.With("User").OrderBy("created_at", "DESC").Get()
    if err != nil {
        return ctx.JSON(500, map[string]string{"error": "Failed to load posts"})
    }

    view.Render(ctx.Response, ctx.Request, "posts/index", view.Props{
        "posts": posts,
    })
    return nil
}

// Show single post
func (c *PostHandler) Show(ctx *router.Context) error {
    id := ctx.Param("id")
    post, err := models.Post{}.With("User", "Comments.User").Find(id)

    if err != nil {
        return ctx.JSON(404, map[string]string{"error": "Post not found"})
    }

    view.Render(ctx.Response, ctx.Request, "posts/show", view.Props{
        "post": post,
    })
    return nil
}

// Show create form
func (c *PostHandler) Create(ctx *router.Context) error {
    view.Render(ctx.Response, ctx.Request, "posts/create", view.Props{})
    return nil
}

// Store new post
func (c *PostHandler) Store(ctx *router.Context) error {
    // Bind and validate request
    var input struct {
        Title string `json:"title"`
        Body  string `json:"body"`
    }

    if err := ctx.Bind(&input); err != nil {
        return ctx.JSON(400, map[string]string{"error": "Invalid input"})
    }

    // Get authenticated user
    user := auth.User(ctx.Request).(*models.User)

    // Create post
    post, err := models.Post{}.Create(map[string]any{
        "title":   input.Title,
        "body":    input.Body,
        "user_id": user.ID,
    })
    if err != nil {
        return ctx.JSON(500, map[string]string{"error": "Failed to create post"})
    }

    view.Location(ctx.Response, ctx.Request, fmt.Sprintf("/posts/%d", post.ID))
    return nil
}

// Show edit form
func (c *PostHandler) Edit(ctx *router.Context) error {
    id := ctx.Param("id")
    post, err := models.Post{}.Find(id)

    if err != nil {
        return ctx.JSON(404, map[string]string{"error": "Post not found"})
    }

    view.Render(ctx.Response, ctx.Request, "posts/edit", view.Props{
        "post": post,
    })
    return nil
}

// Update post
func (c *PostHandler) Update(ctx *router.Context) error {
    id := ctx.Param("id")
    post, err := models.Post{}.Find(id)

    if err != nil {
        return ctx.JSON(404, map[string]string{"error": "Post not found"})
    }

    var input struct {
        Title string `json:"title"`
        Body  string `json:"body"`
    }

    if err := ctx.Bind(&input); err != nil {
        return ctx.JSON(400, map[string]string{"error": "Invalid input"})
    }

    post.Update(map[string]any{
        "title": input.Title,
        "body":  input.Body,
    })

    view.Location(ctx.Response, ctx.Request, fmt.Sprintf("/posts/%d", post.ID))
    return nil
}

// Delete post
func (c *PostHandler) Destroy(ctx *router.Context) error {
    id := ctx.Param("id")
    post, err := models.Post{}.Find(id)

    if err != nil {
        return ctx.JSON(404, map[string]string{"error": "Post not found"})
    }

    if err := post.Delete(); err != nil {
        return ctx.JSON(500, map[string]string{"error": "Failed to delete post"})
    }

    view.Location(ctx.Response, ctx.Request, "/posts")
    return nil
}
```

## Base Handler

Create a base handler with common functionality:

```go
// internal/handlers/base_handler.go
package handlers

import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
    "github.com/velocitykode/velocity/pkg/auth"
    "myapp/internal/models"
)

type BaseHandler struct{}

// JSON response helper
func (c *BaseHandler) JSON(ctx *router.Context, data interface{}, status ...int) error {
    statusCode := 200
    if len(status) > 0 {
        statusCode = status[0]
    }
    return ctx.JSON(statusCode, data)
}

// Error response helper
func (c *BaseHandler) Error(ctx *router.Context, message string, status ...int) error {
    statusCode := 500
    if len(status) > 0 {
        statusCode = status[0]
    }
    return ctx.JSON(statusCode, map[string]string{
        "error": message,
    })
}

// Not found response
func (c *BaseHandler) NotFound(ctx *router.Context) error {
    return c.Error(ctx, "Resource not found", 404)
}

// Forbidden response
func (c *BaseHandler) Forbidden(ctx *router.Context) error {
    return c.Error(ctx, "Access forbidden", 403)
}

// Unauthorized response
func (c *BaseHandler) Unauthorized(ctx *router.Context) error {
    return c.Error(ctx, "Authentication required", 401)
}

// Redirect helper
func (c *BaseHandler) Redirect(ctx *router.Context, url string, status ...int) error {
    statusCode := 302
    if len(status) > 0 {
        statusCode = status[0]
    }
    return ctx.Redirect(url, statusCode)
}

// Render with validation errors
func (c *BaseHandler) WithErrors(ctx *router.Context, errors map[string][]string) {
    view.WithErrors(ctx.Response, errors)
}

// Authorization helper
func (c *BaseHandler) authorize(ctx *router.Context, action string, resource interface{}) bool {
    user := auth.User(ctx.Request)
    if user == nil {
        return false
    }

    // Implement your authorization logic here
    // For example, check if user can perform action on resource
    return true
}

// Get authenticated user
func (c *BaseHandler) user(ctx *router.Context) *models.User {
    return auth.User(ctx.Request).(*models.User)
}
```

## Resource Handlers

Velocity supports RESTful resource handlers:

```go
// internal/handlers/api/user_handler.go
package api

import (
    "strconv"
    "myapp/internal/models"

    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/auth"
    "github.com/velocitykode/velocity/pkg/validation"
)

type UserHandler struct {
    BaseHandler
}

// GET /api/users
func (c *UserHandler) Index(ctx *router.Context) error {
    page := ctx.Query("page")
    if page == "" {
        page = "1"
    }

    users, err := models.User{}.
        With("Profile").
        Paginate(page, 15)

    if err != nil {
        return c.Error(ctx, "Failed to load users")
    }

    return c.JSON(ctx, users)
}

// GET /api/users/{id}
func (c *UserHandler) Show(ctx *router.Context) error {
    id := ctx.Param("id")
    user, err := models.User{}.With("Profile", "Posts").Find(id)

    if err != nil {
        return c.NotFound(ctx)
    }

    return c.JSON(ctx, user)
}

// POST /api/users
func (c *UserHandler) Store(ctx *router.Context) error {
    data, err := validation.Validate(ctx.Request, validation.Rules{
        "name":     "required|string|max:255",
        "email":    "required|email|unique:users,email",
        "password": "required|string|min:8",
    })

    if err != nil {
        return ctx.JSON(422, map[string]interface{}{
            "errors": err.Errors(),
        })
    }

    hashedPassword, _ := auth.Hash(data["password"].(string))

    user := models.User{
        Name:     data["name"].(string),
        Email:    data["email"].(string),
        Password: hashedPassword,
    }

    if err := user.Save(); err != nil {
        return c.Error(ctx, "Failed to create user")
    }

    return ctx.JSON(201, user)
}

// PUT /api/users/{id}
func (c *UserHandler) Update(ctx *router.Context) error {
    id := ctx.Param("id")
    user, err := models.User{}.Find(id)

    if err != nil {
        return c.NotFound(ctx)
    }

    data, err := validation.Validate(ctx.Request, validation.Rules{
        "name":  "sometimes|string|max:255",
        "email": "sometimes|email|unique:users,email," + strconv.Itoa(int(user.ID)),
    })

    if err != nil {
        return ctx.JSON(422, map[string]interface{}{
            "errors": err.Errors(),
        })
    }

    if err := user.Update(data); err != nil {
        return c.Error(ctx, "Failed to update user")
    }

    return c.JSON(ctx, user)
}

// DELETE /api/users/{id}
func (c *UserHandler) Destroy(ctx *router.Context) error {
    id := ctx.Param("id")
    user, err := models.User{}.Find(id)

    if err != nil {
        return c.NotFound(ctx)
    }

    if err := user.Delete(); err != nil {
        return c.Error(ctx, "Failed to delete user")
    }

    ctx.Response.WriteHeader(204)
    return nil
}
```

## Handler Middleware

Apply middleware to handlers:

```go
// routes/web.go
package routes

import (
    "myapp/internal/handlers"
    "myapp/internal/middleware"

    "github.com/velocitykode/velocity/pkg/router"
)

func WebRoutes(r *router.Router) {
    // Public routes
    homeHandler := &handlers.HomeHandler{}
    postHandler := &handlers.PostHandler{}

    r.Get("/", homeHandler.Index)
    r.Get("/posts", postHandler.Index)
    r.Get("/posts/{id}", postHandler.Show)

    // Protected routes
    r.Group(func(r *router.Router) {
        r.Use(middleware.Auth)

        r.Get("/posts/create", postHandler.Create)
        r.Post("/posts", postHandler.Store)
        r.Get("/posts/{id}/edit", postHandler.Edit)
        r.Put("/posts/{id}", postHandler.Update)
        r.Delete("/posts/{id}", postHandler.Destroy)
    })
}
```

## Form Handling

Handle form submissions:

```go
func (c *PostHandler) Store(ctx *router.Context) error {
    // Parse form data
    if err := ctx.Request.ParseForm(); err != nil {
        return c.Error(ctx, "Invalid form data")
    }

    // Manual validation
    title := strings.TrimSpace(ctx.Request.FormValue("title"))
    body := strings.TrimSpace(ctx.Request.FormValue("body"))

    if title == "" {
        c.WithErrors(ctx, map[string][]string{
            "title": {"Title is required"},
        })
        return nil
    }

    if len(body) < 10 {
        c.WithErrors(ctx, map[string][]string{
            "body": {"Body must be at least 10 characters"},
        })
        return nil
    }

    // Create post
    post := models.Post{
        Title:  title,
        Body:   body,
        UserID: c.user(ctx).ID,
    }

    if err := post.Save(); err != nil {
        return c.Error(ctx, "Failed to create post")
    }

    // Flash success message
    view.Flash(ctx.Response, "success", "Post created successfully")
    return c.Redirect(ctx, fmt.Sprintf("/posts/%d", post.ID))
}
```

## File Uploads

Handle file uploads in handlers:

```go
func (c *UserHandler) UpdateAvatar(ctx *router.Context) error {
    // Parse multipart form
    if err := ctx.Request.ParseMultipartForm(10 << 20); err != nil { // 10MB max
        return c.Error(ctx, "File too large")
    }

    file, header, err := ctx.Request.FormFile("avatar")
    if err != nil {
        return c.Error(ctx, "No file uploaded")
    }
    defer file.Close()

    // Validate file type
    if !strings.HasPrefix(header.Header.Get("Content-Type"), "image/") {
        return c.Error(ctx, "File must be an image")
    }

    // Save file
    fileName := fmt.Sprintf("avatars/%d_%s", c.user(ctx).ID, header.Filename)
    filePath := filepath.Join("storage", fileName)

    dst, err := os.Create(filePath)
    if err != nil {
        return c.Error(ctx, "Failed to save file")
    }
    defer dst.Close()

    if _, err := io.Copy(dst, file); err != nil {
        return c.Error(ctx, "Failed to save file")
    }

    // Update user avatar
    user := c.user(ctx)
    user.Update(map[string]any{
        "avatar": fileName,
    })

    return c.JSON(ctx, map[string]string{
        "message": "Avatar updated successfully",
        "avatar":  fileName,
    })
}
```

## Request/Response Helpers

Useful helpers for handlers:

```go
// Get query parameters
func (c *BaseHandler) getQuery(ctx *router.Context, key string, defaultValue ...string) string {
    value := ctx.Query(key)
    if value == "" && len(defaultValue) > 0 {
        return defaultValue[0]
    }
    return value
}

// Get form value
func (c *BaseHandler) getForm(ctx *router.Context, key string, defaultValue ...string) string {
    value := ctx.Request.FormValue(key)
    if value == "" && len(defaultValue) > 0 {
        return defaultValue[0]
    }
    return value
}

// Parse JSON body
func (c *BaseHandler) parseJSON(ctx *router.Context, v interface{}) error {
    return ctx.Bind(v)
}

// Get client IP
func (c *BaseHandler) getClientIP(ctx *router.Context) string {
    forwarded := ctx.Request.Header.Get("X-Forwarded-For")
    if forwarded != "" {
        return strings.Split(forwarded, ",")[0]
    }
    return ctx.Request.RemoteAddr
}
```

## Error Handling

Centralized error handling:

```go
// internal/handlers/error_handler.go
package handlers

import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
    "github.com/velocitykode/velocity/pkg/log"
)

type ErrorHandler struct{}

func (c *ErrorHandler) NotFound(ctx *router.Context) error {
    ctx.Response.WriteHeader(404)
    view.Render(ctx.Response, ctx.Request, "errors/404", view.Props{
        "url": ctx.Request.URL.Path,
    })
    return nil
}

func (c *ErrorHandler) InternalError(ctx *router.Context, err error) error {
    log.Error("Internal server error", "error", err, "url", ctx.Request.URL.Path)

    ctx.Response.WriteHeader(500)
    view.Render(ctx.Response, ctx.Request, "errors/500", view.Props{
        "error": err.Error(),
    })
    return nil
}

func (c *ErrorHandler) Forbidden(ctx *router.Context) error {
    ctx.Response.WriteHeader(403)
    view.Render(ctx.Response, ctx.Request, "errors/403", view.Props{})
    return nil
}
```

## Testing Handlers

Test your handlers:

```go
// internal/handlers/user_handler_test.go
package handlers

import (
    "net/http"
    "net/http/httptest"
    "testing"
    "net/url"
    "strings"

    "github.com/stretchr/testify/assert"
    "myapp/internal/models"

    "github.com/velocitykode/velocity/pkg/router"
)

func TestUserHandler_Index(t *testing.T) {
    // Setup test database
    setupTestDB()
    defer teardownTestDB()

    // Create test user
    user := models.User{
        Name:  "Test User",
        Email: "test@example.com",
    }
    user.Save()

    // Create request and response recorder
    req := httptest.NewRequest("GET", "/users", nil)
    w := httptest.NewRecorder()

    // Create context
    ctx := &router.Context{
        Request:  req,
        Response: w,
    }

    // Call handler
    handler := &UserHandler{}
    err := handler.Index(ctx)

    // Assert response
    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, w.Code)
    assert.Contains(t, w.Body.String(), "Test User")
}

func TestUserHandler_Store(t *testing.T) {
    setupTestDB()
    defer teardownTestDB()

    // Create form data
    form := url.Values{}
    form.Add("name", "New User")
    form.Add("email", "new@example.com")

    req := httptest.NewRequest("POST", "/users", strings.NewReader(form.Encode()))
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    w := httptest.NewRecorder()

    // Create context
    ctx := &router.Context{
        Request:  req,
        Response: w,
    }

    // Call handler
    handler := &UserHandler{}
    err := handler.Store(ctx)

    // Assert response
    assert.NoError(t, err)
    assert.Equal(t, http.StatusFound, w.Code)

    // Verify user was created
    user, err := models.User{}.FindBy("email", "new@example.com")
    assert.NoError(t, err)
    assert.Equal(t, "New User", user.Name)
}
```

## Best Practices

1. **Keep handlers thin** - Move business logic to models or services
2. **Use base handler** - Share common functionality across handlers
3. **Validate input** - Always validate user input before processing
4. **Handle errors gracefully** - Provide meaningful error messages
5. **Use middleware** - Apply cross-cutting concerns like authentication
6. **Return appropriate status codes** - Use correct HTTP status codes
7. **Test handlers** - Write unit tests for handler methods
8. **Separate concerns** - Keep API and web handlers separate


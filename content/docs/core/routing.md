---
title: Routing
description: Define routes in Velocity with automatic discovery, RESTful resources, route groups, and gorilla/mux-based routing.
weight: 50
---

Velocity provides a powerful and expressive routing system built on top of the battle-tested gorilla/mux router. It offers automatic route discovery, RESTful resources, Context-based handlers, and a clean API inspired by frameworks like Fiber and Echo.

## Quick Start

Define routes in your application's `routes/` directory. Each file uses `init()` functions to automatically register routes:

```go
// routes/web.go
package routes

import (
    "myapp/internal/handlers"
    "github.com/velocitykode/velocity/pkg/router"
)

func init() {
    router.Register(func(r router.Router) {
        // Create handler instances
        homeHandler := handlers.NewHomeHandler()
        aboutHandler := handlers.NewAboutHandler()

        r.Get("/", homeHandler.Index)
        r.Get("/about", aboutHandler.Index)
    })
}
```

## Automatic Route Discovery

Velocity automatically discovers and loads all route files in your `routes/` directory. Simply import the routes package in your `main.go`:

```go
package main

import (
    _ "myapp/routes" // Auto-register all routes
    "github.com/velocitykode/velocity/pkg/router"
)

func main() {
    // Load all registered routes
    router.LoadRoutes()

    // Start server
    http.ListenAndServe(":4000", router.Get())
}
```

## Context-Based Handlers

All route handlers use `router.HandlerFunc` which receives a `*router.Context` and returns an `error`:

```go
func (c *UserHandler) Index(ctx *router.Context) error {
    users, err := models.User{}.All()
    if err != nil {
        return err
    }

    view.Render(ctx.Response, ctx.Request, "users/index", view.Props{
        "users": users,
    })
    return nil
}
```

The Context provides convenient methods for accessing request data:

```go
func (c *UserHandler) Show(ctx *router.Context) error {
    // Get URL parameter
    id := ctx.Param("id")

    // Get query parameter
    filter := ctx.Query("filter")

    // Bind JSON body
    var input CreateUserInput
    if err := ctx.Bind(&input); err != nil {
        return err
    }

    // Return JSON response
    return ctx.JSON(200, user)
}
```

## HTTP Methods

The router supports all standard HTTP methods:

```go
r.Get("/users", handler)
r.Post("/users", handler)
r.Put("/users/{id}", handler)
r.Delete("/users/{id}", handler)
r.Patch("/users/{id}", handler)
r.Options("/users", handler)
r.Head("/users", handler)
```

## Route Parameters

### Basic Parameters

Capture URL segments using curly braces:

```go
r.Get("/users/{id}", func(ctx *router.Context) error {
    id := ctx.Param("id")
    // Use the id parameter
    return nil
})
```

### Multiple Parameters

```go
r.Get("/posts/{post}/comments/{comment}", func(ctx *router.Context) error {
    postID := ctx.Param("post")
    commentID := ctx.Param("comment")
    return nil
})
```

### Parameter Constraints

Use regex to constrain parameter values:

```go
// Only match numeric IDs
r.Get("/users/{id:[0-9]+}", handler)

// Match slugs
r.Get("/posts/{slug:[a-z0-9-]+}", handler)

// UUID format
r.Get("/api/{uuid:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}}", handler)
```

## RESTful Resources

Following RESTful conventions with standard handler methods:

```go
// routes/user.go
func init() {
    router.Register(func(r router.Router) {
        // Create handler instance
        userHandler := handlers.UserHandler{}
        
        // RESTful routes
        r.Get("/users", userHandler.Index)       // List all
        r.Get("/users/create", userHandler.Create)  // Show form
        r.Post("/users", userHandler.Store)      // Save new
        r.Get("/users/{id}", userHandler.Show)   // Display one
        r.Get("/users/{id}/edit", userHandler.Edit) // Edit form
        r.Put("/users/{id}", userHandler.Update) // Update
        r.Delete("/users/{id}", userHandler.Destroy) // Delete
    })
}
```

### RESTful Conventions

Common RESTful route patterns:

- `GET /users` - List all resources
- `GET /users/create` - Show create form
- `POST /users` - Store new resource
- `GET /users/{id}` - Show specific resource
- `GET /users/{id}/edit` - Show edit form
- `PUT /users/{id}` - Update resource
- `DELETE /users/{id}` - Delete resource

## Route Groups

Group related routes to share common paths:

```go
func init() {
    router.Register(func(r router.Router) {
        // Create handler instances
        dashboardHandler := handlers.Admin.DashboardHandler{}
        adminUserHandler := handlers.Admin.UserHandler{}
        settingsHandler := handlers.Admin.SettingsHandler{}
        apiUserHandler := handlers.API.UserHandler{}
        apiPostHandler := handlers.API.PostHandler{}
        
        // Admin routes group
        admin := r.Group("/admin")
        {
            admin.Get("/", dashboardHandler.Index)
            admin.Get("/users", adminUserHandler.Index)
            admin.Get("/settings", settingsHandler.Index)
        }
        
        // API routes with versioning
        api := r.Group("/api")
        {
            v1 := api.Group("/v1")
            {
                v1.Get("/users", apiUserHandler.Index)
                v1.Get("/posts", apiPostHandler.Index)
            }
        }
    })
}
```

## Route Prefixes

Apply a prefix to all routes in a file:

```go
// routes/api.go
func init() {
    router.Register(func(r router.Router) {
        r.Prefix("/api/v1")
        
        r.Get("/users", handler)    // GET /api/v1/users
        r.Get("/posts", handler)    // GET /api/v1/posts
    })
}
```

## Named Routes

Name routes for easy URL generation:

```go
// Define named route
r.Get("/users/{id}", handler).Name("users.show")

// Generate URL
url, _ := router.Route("users.show", map[string]string{"id": "123"})
// Returns: /users/123
```

## Route Organization

### Best Practices

1. **One file per resource**: Create separate files for each resource
   ```
   routes/
   ├── web.go      # General web routes
   ├── user.go     # User routes
   ├── post.go     # Post routes
   └── auth.go     # Authentication routes
   ```

2. **Use init() for registration**: Each file registers its own routes
   ```go
   func init() {
       router.Register(func(r router.Router) {
           // Route definitions
       })
   }
   ```

3. **Group related routes**: Use groups for admin, API, etc.

4. **Follow RESTful conventions**: Use standard method names

## Testing Routes

Test your routes and handlers:

```go
func TestUserRoutes(t *testing.T) {
    // Load routes
    router.LoadRoutes()
    
    // Create test request
    req := httptest.NewRequest("GET", "/users", nil)
    w := httptest.NewRecorder()
    
    // Execute request
    router.Get().ServeHTTP(w, req)
    
    // Assert response
    if w.Code != http.StatusOK {
        t.Errorf("Expected status 200, got %d", w.Code)
    }
}
```

## Handler Example

Here's a complete handler example using the Context-based handlers:

```go
package handlers

import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
    return &UserHandler{}
}

func (c *UserHandler) Index(ctx *router.Context) error {
    users, _ := models.User{}.All()
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

func (c *UserHandler) Store(ctx *router.Context) error {
    var input struct {
        Name  string `json:"name"`
        Email string `json:"email"`
    }

    if err := ctx.Bind(&input); err != nil {
        return ctx.JSON(400, map[string]string{"error": "Invalid input"})
    }

    user, err := models.User{}.Create(map[string]any{
        "name":  input.Name,
        "email": input.Email,
    })
    if err != nil {
        return err
    }

    return ctx.JSON(201, user)
}
```

### Using Handlers in Routes

Store handler instances in variables for cleaner code:

```go
func init() {
    router.Register(func(r router.Router) {
        // Create handler instances
        userHandler := handlers.NewUserHandler()
        postHandler := handlers.NewPostHandler()

        // User routes
        r.Get("/users", userHandler.Index)
        r.Get("/users/{id}", userHandler.Show)
        r.Post("/users", userHandler.Store)

        // Post routes
        r.Get("/posts", postHandler.Index)
        r.Get("/posts/{id}", postHandler.Show)
    })
}
```

## Configuration

Configure routing behavior in your `.env` file:

```env
# Server port
PORT=4000

# Enable route debugging
ROUTE_DEBUG=false

# Enable route caching (production)
ROUTE_CACHE=true
```


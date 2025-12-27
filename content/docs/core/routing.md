---
title: Routing
weight: 50
---

Velocity provides a powerful and expressive routing system built on top of the battle-tested gorilla/mux router. It offers automatic route discovery, RESTful resources, Context-based handlers, and a clean API inspired by frameworks like Fiber and Echo.

## Quick Start

Define routes in your application's `routes/` directory. Each file uses `init()` functions to automatically register routes:

```go
// routes/web.go
package routes

import (
    "myapp/app/controllers"
    "github.com/velocitykode/velocity/pkg/router"
)

func init() {
    router.Register(func(r router.Router) {
        // Create controller instances
        homeController := controllers.NewHomeController()
        aboutController := controllers.NewAboutController()

        r.Get("/", homeController.Index)
        r.Get("/about", aboutController.Index)
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
    http.ListenAndServe(":3000", router.Get())
}
```

## Context-Based Handlers

All route handlers use `router.HandlerFunc` which receives a `*router.Context` and returns an `error`:

```go
func (c *UserController) Index(ctx *router.Context) error {
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
func (c *UserController) Show(ctx *router.Context) error {
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

Following RESTful conventions with standard controller methods:

```go
// routes/user.go
func init() {
    router.Register(func(r router.Router) {
        // Create controller instance
        userController := controllers.UserController{}
        
        // RESTful routes
        r.Get("/users", userController.Index)       // List all
        r.Get("/users/create", userController.Create)  // Show form
        r.Post("/users", userController.Store)      // Save new
        r.Get("/users/{id}", userController.Show)   // Display one
        r.Get("/users/{id}/edit", userController.Edit) // Edit form
        r.Put("/users/{id}", userController.Update) // Update
        r.Delete("/users/{id}", userController.Destroy) // Delete
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
        // Create controller instances
        dashboardController := controllers.Admin.DashboardController{}
        adminUserController := controllers.Admin.UserController{}
        settingsController := controllers.Admin.SettingsController{}
        apiUserController := controllers.API.UserController{}
        apiPostController := controllers.API.PostController{}
        
        // Admin routes group
        admin := r.Group("/admin")
        {
            admin.Get("/", dashboardController.Index)
            admin.Get("/users", adminUserController.Index)
            admin.Get("/settings", settingsController.Index)
        }
        
        // API routes with versioning
        api := r.Group("/api")
        {
            v1 := api.Group("/v1")
            {
                v1.Get("/users", apiUserController.Index)
                v1.Get("/posts", apiPostController.Index)
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

Test your routes and controllers:

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

## Controller Example

Here's a complete controller example using the Context-based handlers:

```go
package controllers

import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

type UserController struct{}

func NewUserController() *UserController {
    return &UserController{}
}

func (c *UserController) Index(ctx *router.Context) error {
    users, _ := models.User{}.All()
    view.Render(ctx.Response, ctx.Request, "users/index", view.Props{
        "users": users,
    })
    return nil
}

func (c *UserController) Show(ctx *router.Context) error {
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

func (c *UserController) Store(ctx *router.Context) error {
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

### Using Controllers in Routes

Store controller instances in variables for cleaner code:

```go
func init() {
    router.Register(func(r router.Router) {
        // Create controller instances
        userController := controllers.NewUserController()
        postController := controllers.NewPostController()

        // User routes
        r.Get("/users", userController.Index)
        r.Get("/users/{id}", userController.Show)
        r.Post("/users", userController.Store)

        // Post routes
        r.Get("/posts", postController.Index)
        r.Get("/posts/{id}", postController.Show)
    })
}
```

## Configuration

Configure routing behavior in your `.env` file:

```env
# Server port
PORT=3000

# Enable route debugging
ROUTE_DEBUG=false

# Enable route caching (production)
ROUTE_CACHE=true
```


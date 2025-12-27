---
title: Inertia.js
weight: 20
---

Inertia.js bridges Go controllers and React components, enabling SPA-like navigation without building an API.

## Quick Start

```go
// Controller
import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

func (c *UserController) Index(ctx *router.Context) error {
    users, _ := models.User{}.All()

    view.Render(ctx.Response, ctx.Request, "Users/Index", view.Props{
        "users": users,
        "title": "All Users",
    })

    return nil
}
```

```typescript
// resources/js/pages/Users/Index.tsx
import { Link } from '@inertiajs/react'

interface Props {
  users: User[]
  title: string
}

export default function UsersIndex({ users, title }: Props) {
  return (
    <div>
      <h1>{title}</h1>
      {users.map(user => (
        <Link key={user.id} href={`/users/${user.id}`}>
          {user.name}
        </Link>
      ))}
    </div>
  )
}
```

## Configuration

### Initialize View System

```go
import "github.com/velocitykode/velocity/pkg/view"

func main() {
    // Initialize with default template
    view.Initialize(view.Config{
        RootTemplate: view.DefaultTemplate,
        Version:      "1",
    })

    // Or load custom template
    template, _ := view.LoadTemplateFromFile("resources/views/app.html")
    view.Initialize(view.Config{
        RootTemplate: template,
        Version:      "1",
    })
}
```

## Rendering Pages

### Basic Rendering

```go
import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

func (c *PostController) Index(ctx *router.Context) error {
    posts, _ := models.Post{}.With("User").Get()

    view.Render(ctx.Response, ctx.Request, "Posts/Index", view.Props{
        "posts": posts,
        "meta": map[string]interface{}{
            "title": "All Posts",
            "description": "Browse all posts",
        },
    })

    return nil
}

func (c *PostController) Show(ctx *router.Context) error {
    id := ctx.Param("id")
    post, err := models.Post{}.With("User", "Comments").Find(id)

    if err != nil {
        view.Render(ctx.Response, ctx.Request, "Errors/NotFound", view.Props{
            "message": "Post not found",
        })
        return nil
    }

    view.Render(ctx.Response, ctx.Request, "Posts/Show", view.Props{
        "post": post,
    })

    return nil
}
```

## Shared Data

Share data across all views using middleware:

```go
func ShareDataMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Share global data
        view.Share("app", map[string]interface{}{
            "name": "My Velocity App",
            "version": "1.0.0",
        })

        // Share authenticated user
        if auth.Check(r) {
            view.Share("auth", map[string]interface{}{
                "user": auth.User(r),
            })
        }

        next.ServeHTTP(w, r)
    })
}
```

Share request-specific data:

```go
func (c *UserController) Index(ctx *router.Context) error {
    view.SetSharePropsFunc(func(r *http.Request) (view.Props, error) {
        return view.Props{
            "csrf_token": getCSRFToken(r),
            "flash": getFlashMessages(r),
        }, nil
    })

    users, _ := models.User{}.All()
    view.Render(ctx.Response, ctx.Request, "Users/Index", view.Props{
        "users": users,
    })

    return nil
}
```

## Navigation and Redirects

```go
func (c *PostController) Store(ctx *router.Context) error {
    post := createPost(ctx.Request)

    // Redirect to show page
    view.Location(ctx.Response, ctx.Request, fmt.Sprintf("/posts/%d", post.ID))

    return nil
}

func (c *PostController) Update(ctx *router.Context) error {
    if hasErrors {
        // Go back with errors
        view.Back(ctx.Response, ctx.Request)
        return nil
    }

    // Redirect on success
    view.Location(ctx.Response, ctx.Request, "/posts")

    return nil
}
```

## Middleware Integration

```go
import (
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

func SetupRoutes() *router.Router {
    r := router.New()

    // Apply Inertia middleware
    r.Use(view.Middleware())
    r.Use(ShareDataMiddleware)

    // Routes
    r.Get("/", homeController.Index)
    r.Get("/posts", postController.Index)
    r.Get("/posts/{id}", postController.Show)

    return r
}
```

## Testing Views

```go
func TestPostController_Index(t *testing.T) {
    req := httptest.NewRequest("GET", "/posts", nil)
    w := httptest.NewRecorder()
    ctx := router.NewContext(w, req)

    controller := &PostController{}
    err := controller.Index(ctx)

    // Assert HTML response
    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, w.Code)
    assert.Contains(t, w.Header().Get("Content-Type"), "text/html")

    // For Inertia requests, assert JSON
    req.Header.Set("X-Inertia", "true")
    w = httptest.NewRecorder()
    ctx = router.NewContext(w, req)
    err = controller.Index(ctx)

    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, w.Code)
    assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
}
```

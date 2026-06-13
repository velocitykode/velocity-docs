---
title: Inertia.js
description: Connect Go handlers to React components with Inertia.js for SPA navigation without building an API.
weight: 20
---

Inertia.js bridges Go handlers and React components, enabling SPA-like navigation without building an API.

## Quick Start

```go
// Handler
import (
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/view"
)

func (c *UserHandler) Index(ctx *router.Context) error {
    users, _ := models.User{}.All()

    return view.Render(ctx, "Users/Index", view.Props{
        "users": users,
        "title": "All Users",
    })
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

The application bootstrap creates a `*view.Engine` for you and stores it on the
service container as `Services.View` whenever `Config.View.RootTemplate` is set.
You do not construct the engine yourself in normal apps: the package-level
helpers (`view.Render`, `view.Redirect`, `view.For`) resolve the engine from the
request context.

### View Config

`view.Config` controls the root HTML template, asset version, and server-side
rendering:

```go
type Config struct {
    RootTemplate string           // HTML shell containing {{ .inertia }} and {{ .inertiaHead }}
    Version      string           // Asset version for cache busting (defaults to "1")

    SSREnabled   bool             // Pre-render via a Node SSR server, falling back to CSR
    SSRURL       string           // Defaults to http://127.0.0.1:13714
    SSRTimeout   time.Duration    // Defaults to 3s; must be > 0 when SSREnabled
    SSRExcept    []string         // URL prefixes to exclude from SSR

    Funcs        template.FuncMap // Template helpers callable from RootTemplate (e.g. vite)
}
```

The SSR fields are populated from environment variables by the default config
loader: `VIEW_SSR_ENABLED`, `VIEW_SSR_URL`, `VIEW_SSR_TIMEOUT`, and a
comma-separated `VIEW_SSR_EXCEPT`.

### Constructing an engine manually

When you need an engine outside the standard bootstrap (for example in tests),
use `view.NewEngine`:

```go
import "github.com/velocitykode/velocity/view"

engine, err := view.NewEngine(view.Config{
    RootTemplate: `<!DOCTYPE html><html><head>{{ .inertiaHead }}</head><body>{{ .inertia }}</body></html>`,
    Version:      "1",
})
if err != nil {
    // handle error
}
```

`NewEngine` fills in defaults: an empty `RootTemplate` uses a built-in shell and
an empty `Version` becomes `"1"`.

### Wiring Vite assets

Register the [Vite](https://vitejs.dev) helper as a template function so your
root template can emit the right script and stylesheet tags in both dev and
production:

```go
import (
    "html/template"

    "github.com/velocitykode/velocity/bond/vite"
    "github.com/velocitykode/velocity/view"
)

helper := vite.New()
cfg := view.Config{
    RootTemplate: rootTemplate,
    Version:      "1",
    Funcs:        template.FuncMap{"vite": helper.Tags},
}
```

Then the root template calls `{{ vite "resources/js/app.tsx" }}`.

## Rendering Pages

### Basic Rendering

```go
import (
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/view"
)

func (c *PostHandler) Index(ctx *router.Context) error {
    posts, _ := models.Post{}.With("User").Get()

    return view.Render(ctx, "Posts/Index", view.Props{
        "posts": posts,
        "meta": map[string]interface{}{
            "title": "All Posts",
            "description": "Browse all posts",
        },
    })
}

func (c *PostHandler) Show(ctx *router.Context) error {
    id := ctx.Param("id")
    post, err := models.Post{}.With("User", "Comments").Find(id)

    if err != nil {
        return view.Render(ctx, "Errors/NotFound", view.Props{
            "message": "Post not found",
        })
    }

    return view.Render(ctx, "Posts/Show", view.Props{
        "post": post,
    })
}
```

`view.Render` returns an error when no view engine is configured on the
context, so return it directly from the handler.

### Lazy and Deferred Props

Wrap prop values to control when they are evaluated and sent to the client:

```go
return view.Render(ctx, "Dashboard", view.Props{
    // Always included, even on partial reloads.
    "user": view.Always(currentUser),

    // Evaluated only when a partial reload explicitly requests the key.
    "stats": view.Optional(func() (any, error) {
        return computeExpensiveStats()
    }),

    // Loaded after the initial paint; the client fetches it in a
    // follow-up request. An optional group name batches deferred props.
    "activity": view.Defer(func() (any, error) {
        return loadRecentActivity()
    }, "secondary"),
})
```

`view.Lazy` is deprecated in favor of `view.Optional`.

## Shared Data

Shared props are registered once on the engine at boot, not per request. Resolve
the engine from the context with `view.FromContext` (or hold a reference from
`view.NewEngine`) and register static or dynamic shared props:

```go
func RegisterSharedProps(engine *view.Engine) {
    // Static value shared on every render.
    engine.Share("app", map[string]interface{}{
        "name":    "My Velocity App",
        "version": "1.0.0",
    })

    // Several static values at once.
    engine.ShareMultiple(view.Props{
        "locale": "en",
        "theme":  "light",
    })

    // Dynamic value evaluated per request.
    engine.ShareFunc("path", func(r *http.Request) (interface{}, error) {
        return r.URL.Path, nil
    })
}
```

To compute several request-scoped props in one place, register a
`SharePropsFunc`:

```go
engine.SetSharePropsFunc(func(r *http.Request) (view.Props, error) {
    return view.Props{
        "csrf_token": getCSRFToken(r),
        "flash":      getFlashMessages(r),
    }, nil
})
```

## Navigation and Redirects

Three package-level helpers take the `*router.Context`:

- `view.Redirect(ctx, url)` performs an SPA redirect (303) for internal navigation.
- `view.Location(ctx, url)` forces a full-page reload (409 + `X-Inertia-Location` for Inertia requests, 302 otherwise).
- `view.Back(ctx)` redirects to the `Referer` (or `/` when absent).

```go
func (c *PostHandler) Store(ctx *router.Context) error {
    post := createPost(ctx.Request)

    // SPA redirect to the show page
    view.Redirect(ctx, fmt.Sprintf("/posts/%d", post.ID))

    return nil
}

func (c *PostHandler) Update(ctx *router.Context) error {
    if hasErrors {
        // Go back to the previous page
        view.Back(ctx)
        return nil
    }

    // Redirect on success
    view.Redirect(ctx, "/posts")

    return nil
}
```

### Flash and chained redirects

`view.For(ctx)` returns a request-bound handle that chains flash messages with a
terminal redirect or render. Flash entries are persisted on the session cookie
before the redirect fires, so the destination page can read them:

```go
func (c *PostHandler) Update(ctx *router.Context) error {
    if hasErrors {
        return ctx.JSON(422, errors)
    }

    view.For(ctx).
        Flash("success", "Post updated").
        Redirect("/posts")

    return nil
}
```

`For` is nil-safe: when no view engine is wired it returns `nil` and every chain
method (`Flash`, `FlashMany`, `Redirect`, `Location`, `Back`, `Render`) is a
no-op. Flashing also no-ops when the active guard does not back sessions (for
example JWT-only deployments).

## Middleware Integration

The engine exposes its protocol middleware as a `router.MiddlewareFunc` via
`engine.Middleware()`. It handles the Inertia handshake (version checks,
partial-reload negotiation). Register it on the router before your view routes:

```go
import (
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/view"
)

func SetupRoutes(engine *view.Engine) router.Router {
    r := router.New()

    // Apply Inertia middleware
    r.Use(engine.Middleware())

    // Routes
    r.Get("/", homeHandler.Index)
    r.Get("/posts", postHandler.Index)
    r.Get("/posts/{id}", postHandler.Show)

    return r
}
```

## Testing Views

Because `view.Render` resolves the engine from the context, wire an engine onto
a test context with `ctx.SetServices`. Use `router.NewTestContext` to build the
context and recorder:

```go
import (
    "github.com/velocitykode/velocity/app"
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/view"
)

func TestPostHandler_Index(t *testing.T) {
    engine, err := view.NewEngine(view.Config{
        RootTemplate: `<html><body>{{ .inertia }}</body></html>`,
        Version:      "1",
    })
    assert.NoError(t, err)

    handler := &PostHandler{}

    // A plain GET returns the full HTML document.
    ctx, w := router.NewTestContext("GET", "/posts")
    ctx.SetServices(&app.Services{View: engine})

    assert.NoError(t, handler.Index(ctx))
    assert.Equal(t, http.StatusOK, w.Code)
    assert.Contains(t, w.Header().Get("Content-Type"), "text/html")

    // An X-Inertia request returns the JSON page payload.
    ctx, w = router.NewTestContext("GET", "/posts")
    ctx.Request.Header.Set("X-Inertia", "true")
    ctx.SetServices(&app.Services{View: engine})

    assert.NoError(t, handler.Index(ctx))
    assert.Equal(t, http.StatusOK, w.Code)
    assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
}
```

---
title: View Engine
description: Server-side view engine for Inertia-style rendering with shared props, lazy/deferred props, and optional SSR.
weight: 20
---

The `view` package is Velocity's server-side rendering layer. It wraps
the `bond` Inertia primitive with an ergonomic API: render components,
share per-request props, mix lazy and deferred loading, and (optionally)
pre-render through a Node SSR process.

Import path: `github.com/velocitykode/velocity/view`

For the frontend side — setting up the client, writing pages, handling
forms — see [Inertia](/docs/frontend/inertia).

## Engine

```go
engine, err := view.NewEngine(view.Config{
    RootTemplate: rootHTML,   // string: the HTML shell with <div id="app">
    Version:      "1.0.3",    // asset version for Inertia cache busting
    SSREnabled:   false,      // flip to true to enable SSR
    SSRURL:       "http://127.0.0.1:13714",
    SSRTimeout:   3 * time.Second,
    SSRExcept:    []string{"/admin"},  // paths to skip SSR on
})
```

Load the root template from disk:

```go
root, _ := view.LoadTemplateFromFile("resources/views/app.html")
engine, _ := view.NewEngine(view.Config{RootTemplate: root})
```

Assign it so other services (handlers, CSRF middleware) can reach it:

```go
v.View = engine
```

## Rendering

From a handler:

```go
func (h *DashboardHandler) Show(ctx *router.Context) error {
    return view.Render(ctx, "Dashboard/Index", view.Props{
        "metrics": loadMetrics(),
        "user":    currentUser(ctx),
    })
}
```

`view.Render` pulls the engine from the router context (set by the view
middleware) and forwards to `engine.Render`.

Directly:

```go
engine.Render(w, r, "Dashboard/Index", view.Props{"metrics": m})
```

## Shared props

Shared props are attached to every response. Use them for things every
page needs: the authenticated user, feature flags, the CSRF token.

Static value:

```go
engine.Share("appName", "Acme")
```

Evaluated per request:

```go
engine.ShareFunc("user", func(r *http.Request) (any, error) {
    return currentUserFromRequest(r), nil
})
```

Bulk replace:

```go
engine.SetSharePropsFunc(func(r *http.Request) (view.Props, error) {
    return view.Props{
        "user":     currentUserFromRequest(r),
        "features": featureFlagsFor(r),
    }, nil
})
```

`SetSharePropsFunc` replaces the default — use `ShareFunc` for individual
additions.

## Conditional prop types

The `view` package re-exports four prop wrappers from `bond`. Each
changes when/if a prop is evaluated or sent.

### Always — evaluated, always included

```go
view.Props{"theme": view.Always("dark")}
```

### Lazy — evaluated only when the component needs it

```go
view.Props{"heavyReport": view.Lazy(func() (any, error) {
    return computeHeavyReport(), nil
})}
```

Skipped on partial reloads unless explicitly requested.

### Optional — evaluated, but only sent on explicit partial request

```go
view.Props{"audit": view.Optional(func() (any, error) {
    return loadAuditTrail(), nil
})}
```

Useful for secondary tabs — don't hit the DB unless the user opens
that section.

### Deferred — sent after initial render

```go
view.Props{"recommendations": view.Defer(func() (any, error) {
    return ml.Recommend(user), nil
}, "widgets")}
```

Second argument is the group name. The client receives initial HTML
first, then requests deferred groups in parallel. Good for slow
computations you don't want to block first paint.

## Redirect helpers

```go
engine.Redirect(w, r, "/dashboard")   // Inertia-aware redirect
engine.Location(w, r, "https://acme.com/docs")  // external redirect
engine.Back(w, r)                    // redirect to previous URL
```

## Middleware

`engine.Middleware()` returns a `router.MiddlewareFunc` that installs
the engine on the request context so `view.Render(ctx, ...)` works from
any handler.

## SSR

When `SSREnabled` is true:

1. On every full-page response, the engine POSTs the Inertia payload
   to the SSR URL.
2. The Node process renders the page and returns the HTML fragment.
3. The fragment replaces `<div id="app">` content in the root template.
4. If anything fails — timeout, non-200, parse error — the engine
   falls back to client-side rendering. The request always succeeds.

Emit an SSR failure event to monitor fallbacks:

```go
engine.SetEventDispatcher(func(event any) error {
    return v.Events.Dispatch(event)
})
```

Listen for `*bond.SSRRenderFailed` to count, alert, or log.

## Flash and validation helpers

Two simple providers ship with the package for server-flashed data:

```go
flash := view.NewSimpleFlashProvider()
flash.Success(w, r, "Saved!", "/dashboard")
flash.Error(w, r, "Something went wrong", "/dashboard")

val := view.NewSimpleValidationProvider()
// populated by validation/form-requests
```

Use these if you're not plugging in the session-backed flashers from
`validation` / `validate`.

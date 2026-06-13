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

For the frontend side - setting up the client, writing pages, handling
forms - see [Inertia](/docs/frontend/inertia).

## Engine

```go
engine, err := view.NewEngine(view.Config{
    RootTemplate: rootHTML,   // string: the HTML shell with <div id="app">
    Version:      "1.0.3",    // asset version for Inertia cache busting
    SSREnabled:   false,      // flip to true to enable SSR
    SSRURL:       "http://127.0.0.1:13714",  // defaults to this when blank
    SSRTimeout:   3 * time.Second,           // defaults to 3s; must be > 0 when SSR is on
    SSRExcept:    []string{"/admin"},        // URL prefixes to skip SSR on
})
```

`RootTemplate` and `Version` are optional: when blank, `NewEngine` fills
in a built-in default shell and a `Version` of `"1"`. The root template
content is a plain string - load it however you like (an embedded
`//go:embed` file, `os.ReadFile`, etc.) and pass the result.

`Config.Funcs` registers `template.FuncMap` helpers callable from the
root template. The canonical use is the Vite tag helper:

```go
helper := vite.New()
engine, _ := view.NewEngine(view.Config{
    RootTemplate: root,
    Funcs:        template.FuncMap{"vite": helper.Tags},
})
// app.go.html can then call {{ vite "resources/js/app.tsx" }}
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

Several static props at once:

```go
engine.ShareMultiple(view.Props{
    "appName": "Acme",
    "locale":  "en",
})
```

Bulk replace via a single per-request function:

```go
engine.SetSharePropsFunc(func(r *http.Request) (view.Props, error) {
    return view.Props{
        "user":     currentUserFromRequest(r),
        "features": featureFlagsFor(r),
    }, nil
})
```

`SetSharePropsFunc` replaces the default - use `ShareFunc` for individual
additions.

## Conditional prop types

The `view` package re-exports four prop wrappers from `bond`. Each
changes when/if a prop is evaluated or sent.

### Always - evaluated, always included

```go
view.Props{"theme": view.Always("dark")}
```

### Lazy - evaluated only when the component needs it

```go
view.Props{"heavyReport": view.Lazy(func() (any, error) {
    return computeHeavyReport(), nil
})}
```

Skipped on partial reloads unless explicitly requested.

{{% callout type="warning" %}}
`view.Lazy` (and the `view.LazyProp` type) is deprecated - use
`view.Optional` instead. The two behave the same way; the name change
follows the broader Inertia ecosystem's own sunset of `lazy`.
{{% /callout %}}

### Optional - evaluated, but only sent on explicit partial request

```go
view.Props{"audit": view.Optional(func() (any, error) {
    return loadAuditTrail(), nil
})}
```

Useful for secondary tabs - don't hit the DB unless the user opens
that section.

### Deferred - sent after initial render

```go
view.Props{"recommendations": view.Defer(func() (any, error) {
    return ml.Recommend(user), nil
}, "widgets")}
```

Second argument is the group name. The client receives initial HTML
first, then requests deferred groups in parallel. Good for slow
computations you don't want to block first paint.

## Redirect helpers

On the engine directly:

```go
engine.Redirect(w, r, "/dashboard")             // Inertia-aware redirect
engine.Location(w, r, "https://acme.com/docs")  // external redirect
engine.Back(w, r)                               // redirect to the Referer (or "/")
```

From a handler, the package-level helpers pull the engine off the router
context for you and are nil-safe (no-op when no engine is wired):

```go
view.Redirect(ctx, "/dashboard")
view.Location(ctx, "https://acme.com/docs")
view.Back(ctx)
```

### Flash and chained terminals

`view.For(ctx)` returns a request-bound handle for chaining flash data
into a redirect or render. The flash bag is persisted onto the encrypted
session cookie when a terminal method (`Redirect` / `Location` / `Back` /
`Render`) runs, so the next page can drain it onto its props:

```go
view.For(ctx).Flash("error", "Save failed").Redirect("/posts")

view.For(ctx).
    FlashMany(map[string]any{"status": "saved", "id": id}).
    Render("Posts/Index", view.Props{"posts": posts})
```

`For` returns `nil` when no view engine is wired, and every chain method
is a no-op on a nil receiver, so the calls are always safe. Flash silently
no-ops when there is no auth manager on the context or the active guard is
not session-backed (for example a JWT-only deployment).

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
4. If anything fails - timeout, non-200, parse error - the engine
   falls back to client-side rendering. The request always succeeds.

Emit an SSR failure event to monitor fallbacks:

```go
engine.SetEventDispatcher(func(ctx context.Context, event any) error {
    return v.Events.Dispatch(ctx, event)
})
```

Listen for `bond.SSRRenderFailed` to count, alert, or log. The event
carries the failing `Component`, `URL`, `Error` message, and a typed
`Type` (`bond.SSRErrorConnection`, `SSRErrorRender`,
`SSRErrorComponentResolution`, `SSRErrorBrowserAPI`, or
`SSRErrorUnknown`), plus optional `Hint`, `BrowserAPI`, `Stack`, and
`SourceLocation` fields.

## Escape hatch

`engine.Bond()` returns the underlying `*bond.Bond` instance for the rare
case you need a protocol primitive the view API does not re-export. Reach
for it sparingly - application code should stay on the `view` surface so
the rendering adapter can evolve without breaking you.

`engine.Shutdown(ctx)` is a no-op: the engine holds no long-lived
resources, but it satisfies the framework's shutdown contract so the
engine can be registered as a managed service.

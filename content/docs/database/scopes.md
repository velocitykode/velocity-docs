---
title: Global Query Scopes
description: Register named scopes that apply to every query for a model, with per-query opt-out for admin and cross-tenant work.
weight: 35
---

Global query scopes are predicates registered once against a model type that automatically run on every read, count, update, and delete. They are how Velocity implements soft-delete (`WHERE deleted_at IS NULL`) under the hood, and the same primitive is exposed for application-level concerns like multi-tenancy, draft visibility, and feature-gated rows.

## Why global scopes

Without a scope, every query in the codebase has to remember the same `Where("team_id = ?", currentTeam)` clause. Forget once and you leak data across tenants. A global scope moves that predicate to a single registration so the leak path is "explicitly opted out" rather than "forgot to add."

Common shapes:

- Multi-tenant `team_id` / `tenant_id` filtering
- Hide drafts from non-admin reads (`WHERE published = true`)
- Hide archived rows from default listings
- Force a "current schema version" predicate during a migration window

## Registering a scope

Scopes are registered against a concrete model type with `orm.AddGlobalScope[T]`. The function receives the per-call `ctx` and the in-flight `*orm.Query[T]` and mutates the query in place; it does not return a value.

```go
import (
    "context"

    "github.com/velocitykode/velocity/orm"
)

func init() {
    orm.AddGlobalScope[Post]("published_only", func(ctx context.Context, q *orm.Query[Post]) {
        q.Where("published = ?", true)
    })
}
```

The `ctx` passed to the scope is the same `context.Context` the caller handed to the terminal (`Get(ctx)`, `Count(ctx)`, ...), so scopes can read tenant / actor / locale values plumbed through it. Registration is typically done in a service provider, an `init()` in the model file, or a startup hook. Re-registering the same name replaces the prior function. Passing a `nil` fn removes the scope. Order is preserved across runs so generated SQL is deterministic.

{{< callout type="info" title="Soft-delete is a scope" >}}
Velocity's built-in soft-delete predicate is auto-registered under the reserved name `orm.SoftDeleteScopeName` (`"soft_delete"`) the first time you query a model that embeds the `orm.SoftDeletes[T]` trait (directly or via `orm.SoftDeleteModel[T]` / `orm.SoftDeleteUUIDModel[T]`). You can opt out of it with `WithoutGlobalScope(orm.SoftDeleteScopeName)`, the same mechanism your own scopes use.
{{< /callout >}}

## Opting out per query

Two escape hatches let a single query bypass scopes without disturbing the registry. `WithoutGlobalScope` and `WithoutGlobalScopes` are methods on `*Query[T]`, not on `Model[T]`. Start a query with any `*Query[T]`-returning builder method (`Where`, `WhereIn`, `WhereNull`, `WhereNotNull`, `OrderBy`, `With`), then chain the opt-out and a terminal that carries `ctx`:

```go
// Skip one named scope (e.g. show drafts to admins)
posts, err := orm.Model[Post]{}.
    Where("author_id = ?", authorID).
    WithoutGlobalScope("published_only").
    Get(ctx)

// Skip every scope (e.g. an admin export tool)
posts, err := orm.Model[Post]{}.
    OrderBy("created_at", "desc").
    WithoutGlobalScopes().
    Get(ctx)
```

Both methods return the same `*Query[T]`, so they compose with the rest of the builder.

{{< callout type="warning" title="Cross-tenant leak warning" >}}
`WithoutGlobalScopes()` disables every registered scope, including the multi-tenant predicate. Reach for `WithoutGlobalScope(name)` when you only need to bypass one. Audit every call site, scopes are how the framework keeps you safe by default.
{{< /callout >}}

## Where scopes apply

Scopes run on every terminal that builds SQL from the query: `Get(ctx)`, `First(ctx, &dest)`, `Find(ctx, id, &dest)`, `Count(ctx)`, `Exists(ctx)`, `Pluck(ctx, col)`, `Update(ctx, ...)`, and the soft-delete-driven `Delete(ctx)` path. Idempotency is guaranteed per query, even when one terminal delegates to another (for example `Exists` calling `Count`), the scope predicate is added at most once. Each terminal forwards its `ctx` argument to every scope, so a scope reading a tenant or actor value off the request ctx sees the same value the driver does.

Raw SQL queries built with `orm.NewRawQuery` do not run scopes. If you need the soft-delete predicate woven into a raw statement, use `orm.NewRawQuerySoftDeleteOnly`, see [Query Builder](/docs/database/queries/) for the rationale.

## Recipe: Multi-tenant `team_id` scope

The canonical use case. Auth middleware stashes the active team id on the request `ctx`; the scope reads it back when each terminal fires. There is no goroutine-local state, no singleton resolver, and the same predicate works inside a transaction because `Manager.Transaction(ctx, ...)` threads the same ctx into the closure.

Define the ctx key in your app:

```go
package tenancy

import "context"

type ctxKey struct{}

// WithTeamID returns a child ctx carrying the active team id. Auth
// middleware should call this once per request after resolving the
// caller's team.
func WithTeamID(parent context.Context, id uint) context.Context {
    return context.WithValue(parent, ctxKey{}, id)
}

// TeamID returns the active team id from ctx, or (0, false) if none was set.
func TeamID(ctx context.Context) (uint, bool) {
    id, ok := ctx.Value(ctxKey{}).(uint)
    return id, ok
}
```

Register the scope once at startup. The scope receives the per-call ctx as its first argument:

```go
import (
    "context"

    "github.com/velocitykode/velocity/orm"
)

func init() {
    orm.AddGlobalScope[Project]("tenant", func(ctx context.Context, q *orm.Query[Project]) {
        if id, ok := tenancy.TeamID(ctx); ok {
            q.Where("team_id = ?", id)
        }
    })
}
```

In a handler:

```go
// Tenant-blind: scope adds team_id automatically because ctx carries the team id.
projects, err := orm.Model[Project]{}.
    Where("status = ?", "active").
    Get(ctx)

// Admin export across tenants: explicit opt-out, grep-friendly for review.
// WithoutGlobalScope lives on *Query[T], so start the chain with a
// builder method (here OrderBy) before opting out.
all, err := orm.Model[Project]{}.
    OrderBy("id", "asc").
    WithoutGlobalScope("tenant").
    Get(ctx)
```

Treat any handler that does not run through your tenant-aware middleware as a footgun: if `tenancy.TeamID(ctx)` returns `(0, false)`, the scope adds no predicate and the query goes wide. Pair this with an integration test that asserts every model query in your handlers either has the scope applied or an explicit `WithoutGlobalScope` call.

## Removing a scope

```go
// Remove dynamically (mainly useful in tests)
orm.RemoveGlobalScope[Post]("published_only")

// Equivalent: re-register with nil fn
orm.AddGlobalScope[Post]("published_only", nil)
```

## Related

- [CRUD](/docs/database/crud/) - soft delete and lifecycle hooks; soft delete is itself a built-in global scope
- [Query Builder](/docs/database/queries/) - terminals that scopes attach to (`Get`, `Count`, `Pluck`, `Update`)
- [Transactional Outbox](/docs/database/outbox/) - the other ORM primitive shipped alongside scopes for atomic side effects

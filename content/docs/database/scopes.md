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

Scopes are registered against a concrete model type with `orm.AddGlobalScope[T]`. The function receives the in-flight `*orm.Query[T]` and mutates it in place; it does not return a value.

```go
import "github.com/velocitykode/velocity/orm"

func init() {
    orm.AddGlobalScope[Post]("published_only", func(q *orm.Query[Post]) {
        q.Where("published = ?", true)
    })
}
```

Registration is typically done in a service provider, an `init()` in the model file, or a startup hook. Re-registering the same name replaces the prior function. Passing a `nil` fn removes the scope. Order is preserved across runs so generated SQL is deterministic.

{{< callout type="info" title="Soft-delete is a scope" >}}
Velocity's built-in soft-delete predicate is registered under the reserved name `orm.SoftDeleteScopeName` (`"soft_delete"`) the first time you query a soft-delete model. You can opt out of it with `WithoutGlobalScope(orm.SoftDeleteScopeName)`, the same mechanism your own scopes use.
{{< /callout >}}

## Opting out per query

Two escape hatches let a single query bypass scopes without disturbing the registry:

```go
// Skip one named scope (e.g. show drafts to admins)
posts, err := orm.Model[Post]{}.WithContext(ctx).
    WithoutGlobalScope("published_only").
    Get()

// Skip every scope (e.g. an admin export tool)
posts, err := orm.Model[Post]{}.WithContext(ctx).
    WithoutGlobalScopes().
    Get()
```

Both methods return `*Query[T]`, so they compose with the rest of the builder.

{{< callout type="warning" title="Cross-tenant leak warning" >}}
`WithoutGlobalScopes()` disables every registered scope, including the multi-tenant predicate. Reach for `WithoutGlobalScope(name)` when you only need to bypass one. Audit every call site, scopes are how the framework keeps you safe by default.
{{< /callout >}}

## Where scopes apply

Scopes run on every terminal that builds SQL from the query: `Get`, `First`, `Count`, `Exists`, `Pluck`, `Update`, and the soft-delete-driven `Delete` path. Idempotency is guaranteed per query, even when one terminal delegates to another (for example `Exists` calling `Count`), the scope predicate is added at most once.

Raw SQL queries built with `orm.NewRawQuery` do not run scopes. If you need the soft-delete predicate woven into a raw statement, use `orm.NewRawQuerySoftDeleteOnly`, see [Query Builder](/docs/database/queries/) for the rationale.

## Recipe: Multi-tenant `team_id` scope

The canonical use case. The scope predicate reads from a per-goroutine tenant resolver that your auth middleware populates, and registers once at startup so the rest of the codebase can write tenant-blind queries.

The scope function itself has no access to the query's context (the `ctx` field is unexported), so route the team id through a resolver your app controls:

```go
package tenancy

import "sync"

var (
    currentMu     sync.RWMutex
    currentTeamFn func() (uint, bool)
)

// SetResolver wires up a function called by the global scope to read the
// active tenant. Auth middleware typically sets this from the request ctx
// using a goroutine-local pattern (e.g. golang.org/x/sync/singleflight or
// a per-request variable).
func SetResolver(fn func() (uint, bool)) {
    currentMu.Lock()
    defer currentMu.Unlock()
    currentTeamFn = fn
}

func CurrentTeamID() (uint, bool) {
    currentMu.RLock()
    defer currentMu.RUnlock()
    if currentTeamFn == nil {
        return 0, false
    }
    return currentTeamFn()
}
```

Register the scope once:

```go
import "github.com/velocitykode/velocity/orm"

func init() {
    orm.AddGlobalScope[Project]("tenant", func(q *orm.Query[Project]) {
        if id, ok := tenancy.CurrentTeamID(); ok {
            q.Where("team_id = ?", id)
        }
    })
}
```

In a handler:

```go
// Tenant-blind: scope adds team_id automatically.
projects, err := orm.Model[Project]{}.WithContext(ctx).
    Where("status = ?", "active").
    Get()

// Admin export across tenants: explicit opt-out, grep-friendly for review.
all, err := orm.Model[Project]{}.WithContext(ctx).
    WithoutGlobalScope("tenant").
    Get()
```

Treat any handler that does not run through your tenant-aware middleware as a footgun: if the resolver returns `(0, false)`, the scope adds no predicate and the query goes wide. Pair this with an integration test that asserts every model query in your handlers either has the scope applied or an explicit `WithoutGlobalScope` call.

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

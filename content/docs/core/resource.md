---
title: Resources
description: Transform domain models into API responses with collections, pagination, and conditional fields.
weight: 55
---

The `resource` package is a transformation layer that converts domain
models into serializable maps ready for JSON responses. It keeps the
public shape of your API decoupled from internal struct layout.

Import path: `github.com/velocitykode/velocity/resource`

## The Resource interface

Every resource type implements a single method:

```go
type Resource interface {
    ToResource() map[string]any
}
```

Define a resource for each model that leaves your application:

```go
package resources

import "myapp/internal/models"

type UserResource struct {
    models.User
}

func (r UserResource) ToResource() map[string]any {
    return map[string]any{
        "id":    r.ID,
        "name":  r.Name,
        "email": r.Email,
        // Password deliberately excluded — never leaves the server
    }
}
```

Send it from a handler with `ctx.Resource`:

```go
func Show(ctx *router.Context) error {
    user, err := models.FindUser(ctx.Param("id"))
    if err != nil {
        return err
    }
    return ctx.Resource(resources.UserResource{User: user})
}
```

`ctx.Resource` calls `ToResource()` and writes it as a 200 JSON response.

## Collections

`NewCollection` transforms a typed slice into `[]map[string]any`:

```go
users := []models.User{ /* ... */ }

resources := resource.NewCollection([]resources.UserResource{
    {User: users[0]},
    {User: users[1]},
})

return ctx.JSON(http.StatusOK, resources)
```

The generic constraint `[T Resource]` ensures at compile time that every
element has a `ToResource()` method.

## Paginated collections

`NewPaginatedCollection` wraps items in a `{data, meta}` envelope:

```go
return ctx.JSON(http.StatusOK, resource.NewPaginatedCollection(
    []resources.UserResource{{User: u1}, {User: u2}},
    resource.PaginationMeta{
        Total:       42,
        PerPage:     15,
        CurrentPage: 1,
    },
))
```

`LastPage` is computed automatically (ceiling division) — you only
supply `Total`, `PerPage`, and `CurrentPage`.

Response shape:

```json
{
  "data": [
    {"id": 1, "name": "Alice", "email": "alice@example.com"},
    {"id": 2, "name": "Bob", "email": "bob@example.com"}
  ],
  "meta": {
    "total": 42,
    "per_page": 15,
    "current_page": 1,
    "last_page": 3
  }
}
```

## Building meta from an ORM paginator

ORM paginators satisfy the `Paginator` interface:

```go
type Paginator interface {
    Total() int
    PerPage() int
    CurrentPage() int
    Items() any
}
```

Use `FromPaginator` to convert a paginator into `PaginationMeta`:

```go
page, err := models.Users().Paginate(ctx, 15)
if err != nil {
    return err
}

userResources := make([]resources.UserResource, 0, len(page.Items().([]models.User)))
for _, u := range page.Items().([]models.User) {
    userResources = append(userResources, resources.UserResource{User: u})
}

return ctx.JSON(http.StatusOK, resource.NewPaginatedCollection(
    userResources,
    resource.FromPaginator(page),
))
```

## Conditional fields

Four helpers let you include fields only when a condition holds.

### When — static condition

```go
func (r UserResource) ToResource() map[string]any {
    m := map[string]any{
        "id":   r.ID,
        "name": r.Name,
    }

    if k, v, ok := resource.When(r.ShowEmail, "email", r.Email); ok {
        m[k] = v
    }
    return m
}
```

### WhenNotNil — skip nil values (including typed nils)

```go
if k, v, ok := resource.WhenNotNil("avatar_url", r.AvatarURL); ok {
    m[k] = v
}
```

Uses reflection so that `(*string)(nil)` is correctly detected as nil.
A plain `v == nil` check misses typed nils wrapped in an interface.

### WhenFunc — lazy evaluation

When computing the value is expensive, defer it until the condition is
actually true:

```go
if k, v, ok := resource.WhenFunc(r.IncludePosts, "posts", func() any {
    return loadPostsForUser(r.ID)  // only called when IncludePosts is true
}); ok {
    m[k] = v
}
```

### Merge — compose conditional blocks

For longer resources, group conditions into closures and apply them in
sequence:

```go
func (r UserResource) ToResource() map[string]any {
    m := map[string]any{"id": r.ID, "name": r.Name}

    resource.Merge(m,
        func(m map[string]any) {
            if r.ShowEmail {
                m["email"] = r.Email
            }
        },
        func(m map[string]any) {
            if r.CreatedAt != nil {
                m["created_at"] = r.CreatedAt.Format(time.RFC3339)
            }
        },
    )
    return m
}
```

## Design notes

- **Leaf package.** `resource` imports nothing from velocity — only the
  standard library (`reflect`). It can be consumed by tests and tools
  without dragging in the rest of the framework.
- **Decoupling pagination.** The `Paginator` interface lets the `orm`
  package produce meta without `resource` importing `orm`.
- **No middleware, no side effects.** Pure transformation — deterministic
  and easy to test.

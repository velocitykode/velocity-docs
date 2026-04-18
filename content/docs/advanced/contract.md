---
title: Contracts
description: Minimal interfaces that break circular dependencies between core packages.
weight: 95
---

The `contract` package defines the narrow interfaces that let Velocity
packages depend on each other's behavior without importing each other
directly. It contains only interface declarations - no implementations.

Import path: `github.com/velocitykode/velocity/contract`

## Interfaces

```go
type AuthManager interface {
    GateAllows(r *http.Request, ability string, args ...interface{}) bool
    GateAuthorize(r *http.Request, ability string, args ...interface{}) error
}

type CSRFProtector interface {
    Middleware(next http.Handler) http.Handler
}

type ViewEngine interface {
    Back(w http.ResponseWriter, r *http.Request)
}
```

Each interface lists exactly the methods the consuming package needs.

## Who implements them

| Interface         | Implementation   |
| ----------------- | ---------------- |
| `AuthManager`     | `*auth.Manager`  |
| `CSRFProtector`   | `*csrf.CSRF`     |
| `ViewEngine`      | `*view.Engine`   |

## When you'd use it

- **Writing a custom auth manager, CSRF protector, or view engine** -
  satisfy the interface and Velocity will accept your implementation
  wherever the concrete type is expected.
- **Testing against Velocity internals** - use a fake that satisfies
  the contract instead of constructing the full type.

Most application code doesn't import `contract` directly; it's an
internal seam that keeps package dependency graphs acyclic.

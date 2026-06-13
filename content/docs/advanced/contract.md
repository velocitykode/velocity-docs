---
title: Contracts
description: Minimal, stdlib-only interfaces that break circular dependencies between Velocity subsystems.
weight: 95
---

The `contract` package defines the narrow interfaces that let Velocity
packages depend on each other's behavior without importing each other
directly. It is a leaf package: it declares interfaces (plus a small set
of stdlib-only environment helpers) and carries no implementations of its
own. Every signature uses only stdlib types, so the contract leaf never
pulls a heavier package into your import graph.

Import path: `github.com/velocitykode/velocity/contract`

## Cross-cutting interfaces

Two contracts are implemented across many subsystems rather than by a
single type. Bootstrap wiring threads them through every subsystem that
implements them.

```go
// EventDispatcherAware is implemented by every subsystem that emits
// framework events (cache, queue, scheduler, router, ORM, auth, view,
// mail, crypto). Bootstrap calls SetEventDispatcher to thread a single
// dispatcher through them all.
type EventDispatcherAware interface {
    SetEventDispatcher(fn func(ctx context.Context, event any) error)
}

// ShutdownAware is implemented by types that hold background resources
// (goroutines, connections, file handles). The provider registry and
// App.Shutdown call Shutdown in reverse registration order. Implementations
// must honour the context deadline and be safe to call more than once.
type ShutdownAware interface {
    Shutdown(ctx context.Context) error
}
```

## Subsystem interfaces

Each interface lists exactly the methods the consuming package needs.

```go
// Implemented by *auth.Manager.
type AuthManager interface {
    GateAllows(r *http.Request, ability string, args ...interface{}) bool
    GateAuthorize(r *http.Request, ability string, args ...interface{}) error
}

// Implemented by *csrf.CSRF.
type CSRFProtector interface {
    Middleware(next http.Handler) http.Handler
}

// Implemented by *view.Engine.
type ViewEngine interface {
    Back(w http.ResponseWriter, r *http.Request)
}

// Logger mirrors the log package's Logger interface exactly, so
// *log.StackLogger, log.NullLogger, and the redacting logger all satisfy
// it with no adapter. app.Services types its Log field as this contract.
type Logger interface {
    Debug(msg string, kvs ...any)
    Info(msg string, kvs ...any)
    Warn(msg string, kvs ...any)
    Error(msg string, kvs ...any)
    Fatal(msg string, kvs ...any)
}

// Encryptor is the symmetric-encryption contract. Encrypt* return the
// base64 envelope string; Decrypt* take it back. The *WithAAD variants
// bind additional authenticated data to the ciphertext.
type Encryptor interface {
    Encrypt(plaintext string) (string, error)
    EncryptBytes(plaintext []byte) (string, error)
    Decrypt(payload string) (string, error)
    DecryptBytes(payload string) ([]byte, error)
    EncryptBytesWithAAD(plaintext, aad []byte) (string, error)
    DecryptBytesWithAAD(payload string, aad []byte) ([]byte, error)
    GenerateKey() (string, error)
}
```

The package declares many more contracts in the same spirit - one narrow
interface per seam. The full set, with their implementers, is below.

## Who implements them

| Interface              | Implementation                            |
| ---------------------- | ----------------------------------------- |
| `EventDispatcherAware` | every event-emitting subsystem            |
| `ShutdownAware`        | every subsystem holding background resources |
| `AuthManager`          | `*auth.Manager`                           |
| `CSRFProtector`        | `*csrf.CSRF`                              |
| `CSRFTokenRotator`     | `*csrf.CSRF`                              |
| `ViewEngine`           | `*view.Engine`                            |
| `RedirectAllowlist`    | the router (`Router.RedirectAllowedHosts`) |
| `Logger`               | `*log.StackLogger`, `log.NullLogger`      |
| `Encryptor`            | `*crypto/drivers.AESDriver`, `crypto.Encryptor` |
| `Database`             | `*orm.Manager`                            |
| `LoginThrottler`       | `auth.NoopLoginThrottler` (default no-op) |
| `ExceptionHandler`     | the exceptions handler                    |
| `Cache` / `CacheManager` | the cache manager and stores            |
| `MailManager` / `Mailer` | `*mail.Manager`                         |
| `StorageManager` / `StorageDriver` | the storage manager and drivers |
| `Dispatcher` / `EventListener` | the events dispatcher             |
| `QueueDriver` / `QueueJob` | the queue manager and jobs            |
| `Validator`            | the validation engine                     |
| `Notifier` / `NotificationChannel` | the notification manager      |

## Environment helpers

The contract leaf also owns the canonical `APP_ENV` vocabulary, because
subsystems that cannot import the root `app` package (exceptions, auth,
csrf, scheduler, ...) still need to classify the environment. `app`
re-exports these as `app.Env`, `app.IsProductionEnv`, and so on.

```go
const EnvVar = "APP_ENV" // canonical env-var name

contract.GetEnv()                // normalised APP_ENV (lowercased, trimmed)
contract.NonProdEnvNames()       // []string of recognised non-prod names
contract.IsProductionEnv(env)    // "production"/"prod"/"staging"/unknown -> true
contract.IsTestingEnv(env)       // "test"/"testing" -> true
contract.IsDevelopmentEnv(env)   // "development"/"dev" -> true
contract.IsDevOrTestEnv(env)     // dev/test/local profiles -> true
```

Anything outside the recognised set is treated as production
(fail-secure): a typo in `APP_ENV` never silently disables a production gate.

## When you'd use it

- **Writing a custom auth manager, CSRF protector, or view engine** -
  satisfy the interface and Velocity will accept your implementation
  wherever the concrete type is expected.
- **Testing against Velocity internals** - use a fake that satisfies
  the contract instead of constructing the full type.

Most application code doesn't import `contract` directly; it's an
internal seam that keeps package dependency graphs acyclic.

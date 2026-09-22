---
title: Form Requests
description: Self-validating request types with automatic binding, flashing, and redirect-on-failure.
weight: 50
---

Form requests bundle binding, validation, and error handling into one
call. You define a struct with rules; the handler calls `vform.Form[T]`
and receives a validated instance, or the request is redirected back
with errors flashed before the handler even continues.

Import path: `github.com/velocitykode/velocity/validation/vform`

See the [validation](/docs/core/validation) page for the underlying
rule catalog. Form requests are the sugar on top for HTTP handlers; the
rules themselves use the canonical `validation.Rules` type, so anything
documented there works inside a `Rules()` method as-is.

## Defining a form request

```go
import "github.com/velocitykode/velocity/validation"

type CreatePostRequest struct {
    Title string `json:"title"`
    Body  string `json:"body"`
}

func (r *CreatePostRequest) Rules() validation.Rules {
    return validation.Rules{
        "title": {validation.Required(), validation.Min(3)},
        "body":  {validation.Required(), validation.Min(10)},
    }
}
```

Rules are typed values built by the constructors in the `validation`
package, not strings. Parameters are carried pre-split, so a parameter may
contain any character (including `,` and `|`) without escaping.

The `Rules()` method makes the struct a `vform.FormRequest`, which is an
alias for `router.Validatable`: one form struct serves both `vform.Form[T]`
and `ctx.BindValid`, so there is a single declaration to satisfy rather
than two identical ones. The return type is `validation.Rules`
(`map[string][]validation.Rule`, aliased from `contract.ValidationRuleSet`)
so the same value can be passed straight into `validation.Check` or
`dbrules.CheckWithDB` without an intermediate conversion.

{{< callout type="warning" title="Rules must have a matching signature" >}}
`contract.ValidationRuleSet` is a defined type, not an alias for a bare
map, so a `Rules()` method returning a structurally identical map type
fails to satisfy the interface. As a backstop, `Validate[T]` and `Form[T]`
detect a method literally named `Rules` whose signature does not satisfy
`FormRequest` and return an error naming the offending signature, rather
than silently skipping validation.
{{< /callout >}}

### Custom messages

Implement `WithMessages` to override per-field rule errors:

```go
func (r *CreatePostRequest) ValidationMessages() validation.Messages {
    return validation.Messages{
        {Field: "title", Rule: "required"}: "Please provide a title",
        {Field: "body", Rule: "min"}:       "Body must be at least 10 characters",
    }
}
```

Keys are `validation.MessageKey` values addressing one field+rule pair. The
`Rule` half is the canonical rule name the constructor emits (`required`,
`min`, `email`, `unique`, `alpha_dash`, ...), not the Go constructor
identifier.

### Authorization

`vform.Form[T]` itself does not gate requests, place authorization in
middleware (e.g. an auth-required middleware) or check explicitly inside
the handler before calling `Form[T]`. Authorization that depends on the
bound payload should run after `Form[T]` returns the validated `*T`.

## Using it in a handler

```go
func (h *PostHandler) Store(ctx *router.Context) error {
    req, err := vform.Form[CreatePostRequest](ctx)
    if err != nil {
        // err is router.ErrValidationAborted on validation failure;
        // returning it lets the router skip emitting an error response
        // because vform has already redirected back.
        return err
    }

    post := models.NewPost(req.Title, req.Body)
    if err := post.Save(); err != nil {
        return err
    }
    return ctx.Redirect(http.StatusSeeOther, "/posts/"+post.ID)
}
```

### Failure flow

When validation fails, `Form` takes over the response:

1. Errors are flashed via `ctx.FlashErrors`
2. Original input is flashed as old input via `ctx.FlashInput`
   (sensitive fields are stripped automatically by case-insensitive
   substring match - `password`, `passwd`, `passcode`, `secret`, `token`,
   `pin`, `cvv`, `cvc`, `card`, `ssn`, `otp`, `credential`, `credentials`,
   `api_key`, `apikey`, `private_key`, and `privatekey` are redacted)
3. The view engine's `Back` hook is invoked to redirect to the referrer
   (skipped when no view engine is wired, e.g. an API-only app)
4. `Form` returns `router.ErrValidationAborted` so the router skips
   emitting an additional error response

`FlashErrors` and `FlashInput` write short-lived encrypted flash cookies
(`_velocity_errors` and `_velocity_old`), each sealed under its own AAD
label so one can never be replayed as the other. The view layer reads them
on the next render and injects them as the `errors` and `old` props, so
your template can read `errors.title` and repopulate fields via
`old('title')`. No handler code after a failed `vform.Form` call needs
to run, the early `return err` covers it.

## Custom rendering on validation failure

The default `Form[T]` flow (flash + redirect back) is the right choice
for traditional form posts. For Inertia pages that should re-render with
view-specific props, JSON APIs that want a custom error envelope, or any
case where "redirect back" isn't a fit, use the lower-level
`vform.Validate[T]` entry point.

`Validate[T]` performs the same bind + validate cycle but never flashes
or redirects. It returns the populated `*T` and a nil `*Result` on
success, or a zero-value `*T` and a non-nil `*Result` carrying the
per-field errors on failure. Only consume `*T` when `*Result` is nil.
The `error` return is reserved for non-validation failures: a bind or
decode error, or a malformed rule set (both wrap a handler bug, never
user input).

```go
import (
    "github.com/velocitykode/velocity/validation/vform"
    "github.com/velocitykode/velocity/view"
)

func (h *AcceptInvite) Show(ctx *router.Context) error {
    req, result, err := vform.Validate[AcceptInviteRequest](ctx)
    if err != nil {
        // bind error (e.g. malformed JSON), not a validation error
        return err
    }
    if result != nil {
        // Validation failed. Render the same view with errors + the
        // invitation token still present so the user keeps context.
        return view.Render(ctx, "Invite/Accept", view.Props{
            "errors":     result.All(),
            "old":        result.Old(),
            "invite_id":  ctx.Query("token"),
        })
    }

    // Validation passed; req is the bound *AcceptInviteRequest.
    return h.acceptAndRedirect(ctx, req)
}
```

`view.Render(ctx, component, props...)` is the handler-facing entry point
for the Inertia view engine (`view.Props` is an alias for the engine's
prop map). It resolves the engine from the context's service container
and returns an error if no view engine is wired.

`Result.All()` returns one error per field (`map[string]string`,
Inertia-friendly), `Result.Messages()` returns every error
(`map[string][]string`), `Result.Err()` collapses the result into an error
wrapping `validation.ErrValidationFailed`, and `Result.Old()` returns the
input with sensitive fields removed, ready to flash or pass back as a
view prop.

## Structs without Rules

If `T` does not implement `FormRequest`, both `Form[T]` and `Validate[T]`
just bind the request body into a fresh `*T` and return it, no
validation runs. This lets the same helpers double as a strict DTO
binder when there's nothing to check.

## Types

```go
// In package validation (all aliased from the stdlib-only contract leaf)
type Rule       = contract.ValidationRule        // interface{ Rule() ValidationRuleSpec }
type Rules      = contract.ValidationRuleSet     // map[string][]Rule, keyed by field
type MessageKey = contract.ValidationMessageKey  // struct{ Field, Rule string }
type Messages   = contract.ValidationMessages    // map[MessageKey]string

// In package validation/vform
type FormRequest = router.Validatable  // interface{ Rules() validation.Rules }

type WithMessages interface {
    ValidationMessages() validation.Messages
}

type Result = validation.Result       // re-exported for Validate[T] callers

func Form[T any](ctx *router.Context) (*T, error)
func Validate[T any](ctx *router.Context) (*T, *Result, error)
```

## Relation to the `validation` package

`vform` is the HTTP-handler entry point: it owns binding, flashing, and
redirect-back. The lower-level `validation.Check`, `validation.CheckW`, and
`validation.CheckData` functions are the canonical entry points outside
HTTP, or inside HTTP when you want to control the response shape yourself
without `Validate[T]`'s bind-then-error flow. All of them return
`(*Result, error)`, keeping a malformed rule set (a handler bug) distinct
from field-level failures (user input).

The DB-backed rules (`Unique`, `Exists`) execute in the
`validation/dbrules` subpackage so the core `validation` package pulls in
no `orm` or SQL-driver dependency: use `dbrules.CheckWithDB` /
`CheckWithDBW` and `dbrules.CheckDataWithDB` / `CheckDataWithDBCtx` when
your rule set names them. `vform` already routes through
`dbrules.CheckWithDBW` and resolves the database from the context's
service container, so a `Rules()` method naming `Unique` works without any
extra wiring. When no database is reachable, a `Unique` or `Exists` rule is
reported as a configuration error rather than silently failing the field.

## Related

- [Validation](/docs/core/validation/) - the underlying rule engine `vform` delegates to
- [Handlers](/docs/core/handlers/) - where `Form[T]` and `Validate[T]` plug into request flow
- [Frontend Forms](/docs/frontend/forms/) - client-side form helpers that pair with flashed errors and old input

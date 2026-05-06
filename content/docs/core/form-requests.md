---
title: Form Requests
description: Self-validating request types with automatic binding, flashing, and redirect-on-failure.
weight: 46
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
        "title": {"required", "min:3"},
        "body":  {"required", "min:10"},
    }
}
```

The `Rules()` method makes the struct a `vform.FormRequest`. The return
type is `validation.Rules` (`map[string][]string`) so the same value can
be passed straight into `validation.Check` / `CheckWithDB` without an
intermediate conversion.

{{% callout type="info" title="Migrating from `map[string]string`" %}}
The old `map[string]string` rule shape (single `"required|email"` token
per field) has been replaced by `validation.Rules` (`map[string][]string`).
Pipe-strings still work as a single slice element (`{"required|email"}`)
and via the `validation.PipeRules` + `validation.NewRules` shim:

```go
func (r *CreatePostRequest) Rules() validation.Rules {
    return validation.NewRules(validation.PipeRules{
        "title": "required|min:3",
        "body":  "required|min:10",
    })
}
```

Use the slice form directly for new code; reach for `NewRules` only when
porting existing rule strings.
{{% /callout %}}

### Custom messages

Implement `WithMessages` to override per-field rule errors:

```go
func (r *CreatePostRequest) ValidationMessages() map[string]string {
    return map[string]string{
        "title.required": "Please provide a title",
        "body.min":       "Body must be at least 10 characters",
    }
}
```

Keys are `{field}.{rule}`. The framework converts the map into
`validation.Messages` internally before invoking the validator.

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

1. Errors are flashed to the session via `ctx.WithErrors`
2. Original input is flashed as old input via `ctx.WithInput`
   (`password`, `secret`, `token` keys are stripped automatically)
3. The view engine's `Back` hook is invoked to redirect to the referrer
4. `Form` returns `router.ErrValidationAborted` so the router skips
   emitting an additional error response

Your template can read `errors.title` and repopulate fields via
`old('title')`. No handler code after a failed `vform.Form` call needs
to run, the early `return err` covers it.

## Custom rendering on validation failure

The default `Form[T]` flow (flash + redirect back) is the right choice
for traditional form posts. For Inertia pages that should re-render with
view-specific props, JSON APIs that want a custom error envelope, or any
case where "redirect back" isn't a fit, use the lower-level
`vform.Validate[T]` entry point.

`Validate[T]` performs the same bind + validate cycle but never flashes
or redirects: it returns the populated `*T` on success, or a `*Result`
with the per-field errors on failure.

```go
import "github.com/velocitykode/velocity/validation/vform"

func (h *AcceptInvite) Show(ctx *router.Context) error {
    req, result, err := vform.Validate[AcceptInviteRequest](ctx)
    if err != nil {
        // bind error (e.g. malformed JSON), not a validation error
        return err
    }
    if result != nil {
        // Validation failed. Render the same view with errors + the
        // invitation token still present so the user keeps context.
        return ctx.Inertia("Invite/Accept", inertia.Props{
            "errors":     result.All(),
            "old":        result.Old(),
            "invite_id":  ctx.Query("token"),
        })
    }

    // Validation passed; req is the bound *AcceptInviteRequest.
    return h.acceptAndRedirect(ctx, req)
}
```

`Result.All()` returns one error per field (Inertia-friendly map),
`Result.Messages()` returns every error, and `Result.Old()` returns the
input with sensitive fields removed, ready to flash or pass back as a
view prop.

## Structs without Rules

If `T` does not implement `FormRequest`, both `Form[T]` and `Validate[T]`
just bind the request body into a fresh `*T` and return it, no
validation runs. This lets the same helpers double as a strict DTO
binder when there's nothing to check.

## Types

```go
// In package validation
type Rules     = map[string][]string  // field -> list of rule tokens
type PipeRules = map[string]string    // legacy: field -> "required|email"
type Messages  = map[string]string    // "field.rule" -> message

func NewRules(p PipeRules) Rules      // pipe-string -> canonical

// In package validation/vform
type FormRequest interface {
    Rules() validation.Rules
}

type WithMessages interface {
    ValidationMessages() map[string]string
}

type Result = validation.Result       // re-exported for Validate[T] callers

func Form[T any](ctx *router.Context) (*T, error)
func Validate[T any](ctx *router.Context) (*T, *Result, error)
```

## Relation to the `validation` package

`vform` is the HTTP-handler entry point: it owns binding, flashing, and
redirect-back. The lower-level `validation.Check`, `validation.CheckData`,
`validation.CheckWithDB`, and `validation.CheckDataWithDB` functions are
the canonical entry points outside HTTP, or inside HTTP when you want to
control the response shape yourself without `Validate[T]`'s
bind-then-error flow.

## Related

- [Validation](/docs/core/validation/) - the underlying rule engine `vform` delegates to
- [Handlers](/docs/core/handlers/) - where `Form[T]` and `Validate[T]` plug into request flow
- [Frontend Forms](/docs/frontend/forms/) - client-side form helpers that pair with flashed errors and old input

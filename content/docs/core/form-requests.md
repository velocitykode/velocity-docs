---
title: Form Requests
description: Self-validating request types with automatic binding, flashing, and redirect-on-failure.
weight: 46
---

Form requests bundle binding, validation, and error handling into one
call. You define a struct with rules; the handler calls `validate.Form[T]`
and receives a validated instance - or the request is redirected back
with errors flashed before the handler even continues.

Import path: `github.com/velocitykode/velocity/validate`

See the [validation](/docs/core/validation) page for the underlying
rule system. Form requests are the sugar on top for HTTP handlers.

## Defining a form request

```go
type CreatePostRequest struct {
    Title string `json:"title"`
    Body  string `json:"body"`
}

func (r *CreatePostRequest) Rules() validate.Rules {
    return validate.Rules{
        "title": {"required", "min:3"},
        "body":  {"required", "min:10"},
    }
}
```

The `Rules()` method makes the struct a `FormRequest`.

### Custom messages

Implement `WithMessages` to override per-field rule errors:

```go
func (r *CreatePostRequest) ValidationMessages() validate.Messages {
    return validate.Messages{
        "title.required": "Please provide a title",
        "body.min":       "Body must be at least 10 characters",
    }
}
```

Keys are `{field}.{rule}`.

### Authorization

Implement `WithAuthorization` to gate the request:

```go
func (r *CreatePostRequest) Authorize() bool {
    return auth.FromContext(ctx).Check()  // or any policy check
}
```

If `Authorize()` returns false, the request is rejected before
validation runs.

## Using it in a handler

```go
func (h *PostHandler) Store(ctx *router.Context) error {
    req := validate.Form[CreatePostRequest](ctx)
    // Execution only reaches here if the request is valid.

    post := models.NewPost(req.Title, req.Body)
    if err := post.Save(); err != nil {
        return err
    }
    return ctx.Redirect(http.StatusSeeOther, "/posts/"+post.ID)
}
```

### Failure flow

When validation fails, `Form` takes over the response:

1. Errors are flashed to the session (`ctx.WithErrors`)
2. Original input is flashed as old input (`ctx.WithInput`)
3. The view engine is asked to redirect back to the referrer
4. The handler is aborted with `router.AbortValidation{}`

Your template can read `errors.title` and repopulate fields via
`old('title')`. No handler code after `validate.Form` runs on failure.

## Structs without Rules

If `T` does not implement `FormRequest`, `Form[T]` just binds the
request body and returns - no validation performed. This lets you use
the same helper for simple DTO binding when there's nothing to check.

## Types

```go
type Rules    = map[string][]string        // field → list of rule strings
type Messages = map[string]string          // "field.rule" → message

type FormRequest interface {
    Rules() Rules
}

type WithMessages interface {
    ValidationMessages() Messages
}

type WithAuthorization interface {
    Authorize() bool
}
```

## Relation to the `validation` package

The older `validate.Check`, `validate.CheckData`, and
`validate.CheckWithDB` functions are deprecated - they convert
`[]string` rules to pipe-separated form and call into the `validation`
package. For new code, call `validation.Check*` directly. `Form[T]` is
the only non-deprecated entry point in this package because it needs
the router `Context` (for binding, flashing, and redirecting) that
lives above `validation`.

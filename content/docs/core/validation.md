---
title: "Validation"
description: Validate HTTP requests and form data with Velocity's declarative rule-based validation system.
weight: 50
---

Velocity provides a flexible, extensible validation system for validating HTTP requests, form data, and general data structures. The validation package uses a declarative, rule-based approach designed for Go's type system.

Import path: `github.com/velocitykode/velocity/validation`

For HTTP handlers, the higher-level [form-request](/docs/core/form-requests) helper (`vform.Form[T]`) wraps the rules below with binding, flashing, and redirect-on-failure. Reach for `vform` first; reach for `validation.Check*` directly when you need a custom render path or you're validating data that isn't an HTTP request.

## Quick Start

{{% callout type="info" %}}
**Simple and Declarative**: Define validation rules as a slice of rule tokens per field and let Velocity handle the rest.
{{% /callout %}}

{{< tabs items="Basic Validation,HTTP Request Validation,Custom Messages" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/validation"

func validateUser(data map[string]interface{}) error {
    rules := validation.Rules{
        "email":    {"required", "email"},
        "password": {"required", "min:8"},
        "age":      {"required", "numeric", "min:18"},
        "username": {"required", "alpha_num"},
    }

    result := validation.CheckData(data, rules)
    if result.HasErrors() {
        // result.All() is map[string]string (first error per field).
        // result.Messages() is map[string][]string (all errors per field).
        fmt.Println("Validation failed:", result.All())
        return result.Err()
    }

    // No errors, use the input directly.
    return nil
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/validation"
)

func RegisterUser(c *router.Context) error {
    rules := validation.Rules{
        "name":     {"required", "string"},
        "email":    {"required", "email"},
        "password": {"required", "min:8", "confirmed"},
        "age":      {"required", "numeric", "min:18"},
        "terms":    {"required", "accepted"},
    }

    result := validation.Check(c.Request, rules)
    if result.HasErrors() {
        return c.JSON(422, map[string]interface{}{
            "errors": result.Messages(),
        })
    }

    // Validation passed, bind the request body and proceed.
    var input struct {
        Name, Email, Password string
        Age                   int
    }
    if err := c.BindAuto(&input); err != nil {
        return err
    }

    return c.JSON(200, input)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/validation"
)

func validateWithCustomMessages(c *router.Context) error {
    rules := validation.Rules{
        "email":    {"required", "email"},
        "password": {"required", "min:8"},
    }

    messages := validation.Messages{
        "email.required":    "Please provide your email address",
        "email.email":       "Please enter a valid email address",
        "password.required": "Password is required",
        "password.min":      "Password must be at least 8 characters",
    }

    result := validation.Check(c.Request, rules, messages)
    if result.HasErrors() {
        return c.JSON(422, map[string]interface{}{
            "errors": result.Messages(),
        })
    }

    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

## Migrating from `map[string]string`

`validation.Rules` is now `map[string][]string`. Each field maps to an ordered slice of rule tokens. The legacy single-string-per-field form (e.g. `"required|email"`) lives on as `validation.PipeRules` and converts via `validation.NewRules`:

```go
// Legacy pipe-string form (still accepted via PipeRules).
legacy := validation.PipeRules{
    "email":    "required|email",
    "password": "required|min:8|confirmed",
}

// Canonical form.
rules := validation.NewRules(legacy)
// equivalent to:
//   validation.Rules{
//       "email":    {"required", "email"},
//       "password": {"required", "min:8", "confirmed"},
//   }
```

Pipe-delimited tokens inside a single slice element (`{"required|email"}`) are still accepted, the validator splits on `|` before evaluating, so existing code paths keep working while you migrate. New code should write the slice form directly.

## Configuration

The validation package works out of the box with no configuration required. However, you can customize behavior through environment variables:

```env
# Stop validation on first error (default: false)
VALIDATION_STOP_ON_FIRST=false

# Default locale for error messages
VALIDATION_DEFAULT_LOCALE=en

# Bail on first rule failure per field (default: true)
VALIDATION_BAIL_ON_ERROR=true
```

## Available Rules

Velocity ships 49 built-in rules plus two database rules (`unique`, `exists`) that are registered automatically when validation runs against an `orm.Database` (i.e. `CheckWithDB` / `CheckDataWithDB`, or via `vform.Form[T]` when the request has services attached).

The table below is the complete catalog. The "Empty input" column describes how the rule treats a `nil` or absent field; combine with `required` to enforce presence and with `nullable` / `filled` for opt-out semantics.

| Rule | Args | Example | Empty input |
|---|---|---|---|
| `accepted` | (none) | `{"terms": {"accepted"}}` | fails |
| `alpha` | (none) | `{"name": {"alpha"}}` | passes (use with `required`) |
| `alpha_dash` | (none) | `{"slug": {"alpha_dash"}}` | passes |
| `alpha_num` | (none) | `{"username": {"alpha_num"}}` | passes |
| `array` | (none) | `{"tags": {"array"}}` | passes |
| `between` | `min,max` | `{"age": {"numeric", "between:18,65"}}` | passes |
| `boolean` | (none) | `{"active": {"boolean"}}` | passes |
| `confirmed` | (none) | `{"password": {"confirmed"}}` | passes (skipped when value is `nil`) |
| `date` | (none) | `{"published_at": {"date"}}` | passes |
| `date_format` | `layout` | `{"day": {"date_format:2006-01-02"}}` | passes |
| `different` | `field` | `{"alt_email": {"different:email"}}` | passes |
| `email` | (none) | `{"email": {"email"}}` | empty string fails; `nil` passes |
| `ends_with` | `suffix[,...]` | `{"file": {"ends_with:.pdf,.png"}}` | passes |
| `exists` | `table[,column]` | `{"team_id": {"exists:teams,id"}}` | passes (DB rule, requires `CheckWithDB`) |
| `file` | (none) | `{"avatar": {"file"}}` | passes |
| `filled` | (none) | `{"bio": {"filled"}}` | passes when field absent; fails when present-but-empty |
| `gt` | `n` or `field` | `{"max": {"gt:min"}}` | passes |
| `gte` | `n` or `field` | `{"qty": {"gte:1"}}` | passes |
| `image` | (none) | `{"avatar": {"image"}}` | passes |
| `in` | `v[,v,...]` | `{"role": {"in:admin,user,mod"}}` | passes |
| `integer` | (none) | `{"age": {"integer"}}` | passes |
| `ip` | (none) | `{"addr": {"ip"}}` | empty string fails; `nil` passes |
| `ipv4` | (none) | `{"addr": {"ipv4"}}` | empty string fails; `nil` passes |
| `ipv6` | (none) | `{"addr": {"ipv6"}}` | empty string fails; `nil` passes |
| `json` | (none) | `{"meta": {"json"}}` | passes |
| `lt` | `n` or `field` | `{"min": {"lt:max"}}` | passes |
| `lte` | `n` or `field` | `{"qty": {"lte:100"}}` | passes |
| `max` | `n` | `{"bio": {"max:500"}}` | passes |
| `mimes` | `ext[,ext,...]` | `{"upload": {"mimes:jpg,png,pdf"}}` | passes |
| `min` | `n` | `{"password": {"min:8"}}` | passes |
| `not_in` | `v[,v,...]` | `{"username": {"not_in:admin,root"}}` | passes |
| `nullable` | (none) | `{"middle_name": {"nullable", "string"}}` | always passes (marker) |
| `numeric` | (none) | `{"price": {"numeric"}}` | passes |
| `password` | `[len][,mixed][,num][,symbol]` | `{"pw": {"password:12"}}` | fails (treats empty as missing) |
| `present` | (none) | `{"opt_in": {"present"}}` | fails when key absent; passes when key present-but-empty |
| `regex` | `pattern` | `{"sku": {"regex:^[A-Z]{3}-\\d{4}$"}}` | passes (pattern must be `^...$` anchored) |
| `required` | (none) | `{"name": {"required"}}` | fails on `nil`, `""`, empty slice/map |
| `required_if` | `field,value` | `{"phone": {"required_if:contact,phone"}}` | conditional |
| `required_unless` | `field,value` | `{"company": {"required_unless:type,personal"}}` | conditional |
| `required_with` | `field` | `{"shipping": {"required_with:address"}}` | conditional |
| `required_without` | `field` | `{"sku": {"required_without:gtin"}}` | conditional |
| `same` | `field` | `{"pw_confirm": {"same:password"}}` | passes |
| `size` | `n` | `{"zip": {"size:5"}}` | passes |
| `starts_with` | `prefix[,...]` | `{"url": {"starts_with:https://"}}` | passes |
| `string` | (none) | `{"name": {"string"}}` | passes |
| `timezone` | (none) | `{"tz": {"timezone"}}` | empty string fails; `nil` passes |
| `ulid` | (none) | `{"id": {"ulid"}}` | passes |
| `unique` | `table[,column[,exceptID[,idCol]]]` | `{"email": {"unique:users,email"}}` | passes (DB rule, requires `CheckWithDB`) |
| `url` | (none) | `{"website": {"url"}}` | empty string fails; `nil` passes |
| `url_public` | (none) | `{"webhook": {"url_public"}}` | same as `url` plus rejects private/internal hosts |
| `uuid` | (none) | `{"id": {"uuid"}}` | passes |

{{% callout type="info" title="`confirmed` cross-field semantics" %}}
The `confirmed` rule on field `<X>` looks for a sibling field named `<X>_confirmation` in the input map and compares the two with `reflect.DeepEqual`. The convention is fixed; the suffix is not configurable. If the confirmation field is missing or differs, validation fails with `"The <X> confirmation does not match."`.

```go
rules := validation.Rules{
    "password": {"required", "min:8", "confirmed"},
}

// Both fields must arrive in the request:
//   password=secret123
//   password_confirmation=secret123
```

`confirmed` returns success when the source field is `nil`, so combine it with `required` if the field itself is mandatory. Use [`same`](#same--different) instead when you need to match against an arbitrary field name.
{{% /callout %}}

### Highlights

#### required

Field must be present and not empty (`nil`, `""`, empty slice, empty map all fail):

```go
rules := validation.Rules{"name": {"required"}}
```

#### nullable / filled / present

`nullable` is a marker: it always passes and lets a value be `nil` or empty without other rules tripping. `filled` accepts an absent field but fails when the field is present and empty. `present` requires the key to exist in the input map but allows an empty value.

```go
rules := validation.Rules{
    "middle_name": {"nullable", "string"},
    "bio":         {"filled"},
    "opt_in":      {"present"},
}
```

#### min / max / size / between

These rules adapt to the value's type. On strings they measure character length; on numbers they compare values; on slices they count elements.

```go
rules := validation.Rules{
    "password": {"min:8"},
    "bio":      {"max:500"},
    "zip_code": {"size:5"},
    "age":      {"numeric", "between:18,65"},
}
```

#### confirmed / same / different

Cross-field comparisons. `confirmed` is a special-cased `same` that targets `<field>_confirmation`. `same` and `different` accept any sibling field name as their parameter.

```go
rules := validation.Rules{
    "password":         {"required", "confirmed"},
    "password_confirm": {"same:password"},
    "alt_email":        {"different:email"},
}
```

#### in / not_in

Value must (or must not) be in a comma-separated list:

```go
rules := validation.Rules{
    "role":     {"in:admin,user,moderator"},
    "username": {"not_in:admin,root,system"},
}
```

#### accepted

Field must be `yes`, `on`, `1`, or `true` (case-insensitive). Useful for terms-of-service checkboxes:

```go
rules := validation.Rules{"terms": {"accepted"}}
```

#### required_if / required_unless / required_with / required_without

Conditional presence rules. Use them when a field is required only when another field has a particular value, or only when another field is present/absent:

```go
rules := validation.Rules{
    "phone":    {"required_if:contact,phone"},
    "company":  {"required_unless:type,personal"},
    "shipping": {"required_with:address"},
    "sku":      {"required_without:gtin"},
}
```

#### gt / gte / lt / lte

Strict / inclusive numeric comparisons. The parameter may be a numeric literal or another field name, in which case the threshold is read from that field's numeric value:

```go
rules := validation.Rules{
    "max_price": {"numeric", "gt:min_price"},
    "qty":       {"numeric", "lte:100"},
}
```

#### password

Stricter than `min`. Defaults to length >= 8 plus at least one upper, lower, digit, and symbol. A single numeric parameter overrides only the length; flag tokens (`mixed`, `num`, `symbol`, `length:<n>`) tune the requirements:

```go
rules := validation.Rules{
    "pw": {"password:12"},                    // length >= 12, all defaults
    "pw": {"password:8,mixed,num,symbol"},    // explicit
}
```

#### regex

Pattern must be anchored with `^...$` and is rejected if it contains obvious catastrophic-backtracking shapes (e.g. `(a+)+`). Each evaluation is bounded to 10 ms.

```go
rules := validation.Rules{"sku": {"regex:^[A-Z]{3}-\\d{4}$"}}
```

#### file / mimes / image

`file` confirms the value carries `*multipart.FileHeader`-shaped metadata. `mimes` checks the filename's extension (no content sniffing) against a comma-separated allowlist. `image` is a shortcut for the common image extensions (`jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `svg`, `heic`, `heif`, `avif`).

```go
rules := validation.Rules{
    "avatar":   {"image", "max:2048"},
    "document": {"file", "mimes:pdf,docx"},
}
```

#### unique / exists (database rules)

Registered only when validation has access to an `orm.Database`. `vform.Form[T]` wires this automatically from `ctx.Services.DB`; with the lower-level entry points use `validation.CheckWithDB` / `validation.CheckDataWithDB`.

```go
rules := validation.Rules{
    "email":   {"required", "email", "unique:users,email"},
    "team_id": {"required", "exists:teams,id"},
}

// On update, exclude the current row by id:
rules = validation.Rules{
    "email": {"required", "email", "unique:users,email," + userID},
}
```

## API Reference

### Top-level entry points

`Check`, `CheckData`, `CheckWithDB`, and `CheckDataWithDB` are the package's public entry points. They all return a `*Result` whose `HasErrors()`, `All()`, `Messages()`, `First()`, and `Old()` methods drive both JSON responses and view-side flash data.

#### Check

Validate an HTTP request (form values or JSON body, auto-detected from `Content-Type`):

```go
func handler(c *router.Context) error {
    rules := validation.Rules{
        "email": {"required", "email"},
        "name":  {"required", "string"},
    }

    result := validation.Check(c.Request, rules)
    if result.HasErrors() {
        return c.JSON(422, map[string]interface{}{
            "errors": result.Messages(),
        })
    }
    // ... bind and continue
    return nil
}
```

#### CheckData

Validate a pre-extracted `map[string]interface{}`:

```go
data := map[string]interface{}{"email": "user@example.com", "age": 25}
result := validation.CheckData(data, validation.Rules{
    "email": {"required", "email"},
    "age":   {"required", "numeric", "min:18"},
})
if err := result.Err(); err != nil {
    // err wraps validation.ErrValidationFailed and unwraps to ValidationErrors
    return err
}
```

#### CheckWithDB / CheckDataWithDB

Same as above but with `unique` and `exists` rules registered against an `orm.Database`:

```go
result := validation.CheckWithDB(c.Request, rules, c.Services.DB)
```

### Result methods

| Method | Returns |
|---|---|
| `HasErrors()` | `bool`: true when at least one field failed |
| `First(field)` | first message for `field`, or `""` |
| `All()` | `map[string]string`, first message per field (Inertia-friendly shape) |
| `Messages()` | `map[string][]string`, all messages per field |
| `Err()` | `error` wrapping `ErrValidationFailed`; `nil` on success. Satisfies `errors.As(&ValidationErrors{})` |
| `Old()` | `map[string]interface{}` of original input with `password` / `secret` / `token` fields stripped, suitable for flashing |

### ValidationErrors

When you unwrap `Result.Err()` with `errors.As(&validation.ValidationErrors{})`, you get the lower-level shape:

```go
var ve validation.ValidationErrors
if errors.As(result.Err(), &ve) {
    ve.Count()                     // total error count
    ve.HasError("email")           // bool
    ve.First("email")              // first message
    ve.All()                       // map[string][]string
    ve.HasRule("email", "required")// bool, prefer over substring match
    ve.RulesFor("email")           // []string of rule names that failed
}
```

`errors.Is(result.Err(), validation.ErrValidationFailed)` works for the generic "validation failed" branch.

## Custom Validation Rules

`validation.Rules` is the type for the rule set; `validation.RuleHandler` is the signature for a custom rule. Custom rules must be registered on a `Validator` instance returned by `validation.NewValidator()`. There is no global rule registry; this keeps custom rules opt-in per validator.

```go
import (
    "fmt"
    "unicode"

    "github.com/velocitykode/velocity/validation"
)

func newAppValidator() validation.Validator {
    v := validation.NewValidator()
    v.RegisterRule("strong_password", func(
        field string,
        value interface{},
        params []string,
        data map[string]interface{},
    ) error {
        pw, ok := value.(string)
        if !ok {
            return fmt.Errorf("The %s field must be a string.", field)
        }

        var hasUpper, hasLower, hasNumber, hasSpecial bool
        for _, r := range pw {
            switch {
            case unicode.IsUpper(r):
                hasUpper = true
            case unicode.IsLower(r):
                hasLower = true
            case unicode.IsNumber(r):
                hasNumber = true
            case unicode.IsPunct(r) || unicode.IsSymbol(r):
                hasSpecial = true
            }
        }
        if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
            return fmt.Errorf("The %s must contain uppercase, lowercase, number, and special character.", field)
        }
        return nil
    })
    return v
}

// Usage
v := newAppValidator()
result, err := v.Validate(data, validation.Rules{
    "password": {"required", "min:8", "strong_password"},
})
```

For most adopters the built-in [`password`](#password) rule is enough; reach for a custom rule only when the policy is genuinely app-specific.

## Custom Error Messages

The high-level entry points accept a variadic `Messages` map keyed by `"field.rule"`:

```go
messages := validation.Messages{
    "email.required":   "Email is required",
    "email.email":      "Invalid email format",
    "password.required": "Password is required",
    "password.min":     "Password must be at least 8 characters",
}

result := validation.Check(c.Request, rules, messages)
```

When using a `validation.NewValidator()` instance directly, call `SetMessages` once before invoking `Validate` / `ValidateRequest`. From a [form-request](/docs/core/form-requests), implement the `WithMessages` interface and `vform.Form[T]` will pass them through.

## Best Practices

### 1. Validate at the edge

Validate as soon as input enters the handler, before any business logic:

```go
func CreateUser(c *router.Context) error {
    result := validation.Check(c.Request, validation.Rules{
        "email": {"required", "email"},
        "name":  {"required", "string"},
    })
    if result.HasErrors() {
        return c.JSON(422, map[string]interface{}{
            "errors": result.Messages(),
        })
    }
    // ... bind + business logic
    return nil
}
```

### 2. Prefer `vform.Form[T]` for HTTP

[Form requests](/docs/core/form-requests) bundle binding, validation, flashing, and redirect-back into one call. Use `validation.Check*` directly only when you need a custom render path or you're validating data that isn't an HTTP request.

### 3. Provide clear error messages

```go
messages := validation.Messages{
    "email.email":    "Please enter a valid email address",
    "password.min":   "Your password needs to be at least 8 characters",
    "terms.accepted": "You must accept the terms of service",
}
```

### 4. Order rules from general to specific

```go
rules := validation.Rules{
    // Good: required first, then type, then constraints.
    "age": {"required", "numeric", "min:18", "max:120"},
}
```

### 5. Reuse rule sets

```go
var (
    EmailRules    = []string{"required", "email"}
    PasswordRules = []string{"required", "min:8", "strong_password"}
    PhoneRules    = []string{"required", "numeric", "size:10"}
)

rules := validation.Rules{
    "email":    EmailRules,
    "password": PasswordRules,
    "phone":    PhoneRules,
}
```

## Complete Example

Here's a full user-registration endpoint using `validation.CheckWithDB` (so the `unique` rule resolves against the database):

```go
package handlers

import (
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/validation"
)

type UserHandler struct{}

func (uc *UserHandler) Register(c *router.Context) error {
    rules := validation.Rules{
        "name":                  {"required", "string", "min:2", "max:100"},
        "email":                 {"required", "email", "unique:users,email"},
        "password":              {"required", "min:8", "confirmed"},
        "password_confirmation": {"required"},
        "age":                   {"required", "numeric", "min:18"},
        "terms":                 {"required", "accepted"},
        "newsletter":            {"nullable", "boolean"},
    }

    messages := validation.Messages{
        "name.required":      "Please tell us your name",
        "name.min":           "Name must be at least 2 characters",
        "email.required":     "We need your email address",
        "email.email":        "Please enter a valid email address",
        "email.unique":       "That email is already registered",
        "password.required":  "Password is required",
        "password.min":       "Password must be at least 8 characters",
        "password.confirmed": "Passwords do not match",
        "age.required":       "Please provide your age",
        "age.min":            "You must be at least 18 years old",
        "terms.accepted":     "You must accept the terms of service",
    }

    result := validation.CheckWithDB(c.Request, rules, c.Services.DB, messages)
    if result.HasErrors() {
        return c.JSON(422, map[string]interface{}{
            "message": "Validation failed",
            "errors":  result.Messages(),
        })
    }

    var input struct {
        Name, Email, Password string
        Age                   int
        Newsletter            bool
    }
    if err := c.BindAuto(&input); err != nil {
        return err
    }

    user := &User{
        Name:            input.Name,
        Email:           input.Email,
        Password:        hashPassword(input.Password),
        Age:             input.Age,
        NewsletterOptIn: input.Newsletter,
    }
    if err := user.Save(); err != nil {
        return c.JSON(500, map[string]string{"error": "Failed to create user"})
    }

    return c.JSON(201, map[string]interface{}{
        "message": "Registration successful",
        "user":    user,
    })
}
```

## Testing

```go
func TestValidation(t *testing.T) {
    data := map[string]interface{}{
        "email":    "user@example.com",
        "password": "secret12",
        "age":      25,
    }

    rules := validation.Rules{
        "email":    {"required", "email"},
        "password": {"required", "min:8"},
        "age":      {"required", "numeric", "min:18"},
    }

    result := validation.CheckData(data, rules)
    assert.False(t, result.HasErrors())
}

func TestValidationErrors(t *testing.T) {
    data := map[string]interface{}{
        "email": "invalid-email",
        "age":   "not-a-number",
    }

    rules := validation.Rules{
        "email": {"required", "email"},
        "age":   {"required", "numeric"},
    }

    result := validation.CheckData(data, rules)
    assert.True(t, result.HasErrors())

    var ve validation.ValidationErrors
    require.True(t, errors.As(result.Err(), &ve))
    assert.True(t, ve.HasError("email"))
    assert.True(t, ve.HasError("age"))
    assert.Equal(t, 2, ve.Count())
}
```

## Related

- [Form Requests](/docs/core/form-requests/) - HTTP-handler entry point that wraps validation with binding, flashing, and redirect-back
- [Middleware](/docs/core/middleware/) - where global input shaping (CSRF, rate limit, body parsing) runs before validation

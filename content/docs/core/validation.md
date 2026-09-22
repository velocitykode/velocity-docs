---
title: "Validation"
description: Validate HTTP requests and form data with Velocity's typed, rule-based validation system.
weight: 60
---

Velocity provides a flexible, extensible validation system for validating HTTP requests, form data, and general data structures. Rules are **typed values** built by constructors in the `validation` package and collected in a `validation.Rules` set keyed by field name.

Import path: `github.com/velocitykode/velocity/validation`

Database-backed rules (`Unique`, `Exists`) execute in `github.com/velocitykode/velocity/validation/dbrules`, a separate leaf so the core validation package carries no ORM or SQL-driver dependency.

For HTTP handlers, the higher-level [form-request](/docs/core/form-requests) helper (`vform.Form[T]`) wraps the rules below with binding, flashing, and redirect-on-failure. Reach for `vform` first; reach for `validation.Check*` directly when you need a custom render path or you're validating data that isn't an HTTP request.

## Quick Start

{{% callout type="info" %}}
**Typed and declarative**: a rule is a value, not a string. `validation.Min(8)` is a function call the compiler checks, so a typo is a build failure instead of a runtime "unknown validation rule".
{{% /callout %}}

{{< tabs items="Basic Validation,HTTP Request Validation,Custom Messages" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/validation"

func validateUser(data map[string]interface{}) error {
    rules := validation.Rules{
        "email":    {validation.Required(), validation.Email()},
        "password": {validation.Required(), validation.Min(8)},
        "age":      {validation.Required(), validation.Numeric(), validation.Gte("18")},
        "username": {validation.Required(), validation.AlphaNum()},
    }

    result, err := validation.CheckData(data, rules)
    if err != nil {
        // Malformed rule set (wraps validation.ErrInvalidRule): a bug in this
        // code, not bad user input. Field failures never travel here.
        return err
    }
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
        "name":     {validation.Required(), validation.String()},
        "email":    {validation.Required(), validation.Email()},
        "password": {validation.Required(), validation.Min(8), validation.Confirmed()},
        "age":      {validation.Required(), validation.Numeric(), validation.Gte("18")},
        "terms":    {validation.Required(), validation.Accepted()},
    }

    result, err := validation.CheckW(c.Response, c.Request, rules)
    if err != nil {
        return err
    }
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
        "email":    {validation.Required(), validation.Email()},
        "password": {validation.Required(), validation.Min(8)},
    }

    // Messages are keyed by a {Field, Rule} pair, not a "field.rule" string.
    messages := validation.Messages{
        {Field: "email", Rule: "required"}:    "Please provide your email address",
        {Field: "email", Rule: "email"}:       "Please enter a valid email address",
        {Field: "password", Rule: "required"}: "Password is required",
        {Field: "password", Rule: "min"}:      "Password must be at least 8 characters",
    }

    result, err := validation.CheckW(c.Response, c.Request, rules, messages)
    if err != nil {
        return err
    }
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

## Configuration

The validation package works out of the box with no configuration required and reads no environment variables. Behavior is fixed by the engine: rules for a field run in declared order and evaluation **bails on the first failing rule per field** (the field stops accumulating errors once one rule fails), while every other field is still evaluated. Custom messages are supplied per call (or once per `Validator` via `SetMessages`), and custom rules carry their own handler on the rule value (see [Custom Validation Rules](#custom-validation-rules)), so neither goes through a global registry.

Request bodies read by `Check` / `CheckW` are capped at `validation.DefaultMaxBodyBytes` (10 MiB, matching `router.DefaultMaxBodySize`). An oversized body does not truncate silently; it produces a field-level error keyed `_body` reading `"The request body is too large."`.

## Rules are values

A `validation.Rules` set maps a field name to the rules applied to it. Each entry is a `validation.Rule` value returned by a constructor:

```go
rules := validation.Rules{
    "name":  {validation.Required(), validation.Min(3)},
    "email": {validation.Required(), validation.Email(), validation.Unique("users", "email")},
}
```

Three properties follow from rules being values rather than strings:

- **Parameters are carried pre-split and are never re-tokenized.** A parameter may contain any character, including `,` and `|`, so `validation.Regex("^(foo|bar),(baz)$")` and `validation.In("Doe, John", "Roe, Jane")` survive intact.
- **Rule values are immutable and safe to share.** Builder methods such as `Unique(...).Except(id)` return a new value instead of mutating the receiver, so a package-level `var CommonRules = validation.Rules{...}` can be reused concurrently.
- **Rule sets are checked before they run.** Normalization reports a nil rule, an empty rule name, an unusable `Except` argument, a custom rule with a nil handler, a custom name that shadows a framework rule, and two distinct rule values claiming one custom name. Every such failure wraps `validation.ErrInvalidRule` and comes back on the `error` return, never as a field message.

{{% callout type="warning" title="An unresolvable rule name is an error, not a field failure" %}}
Evaluation is preceded by a resolution check. A rule that nothing provides (a `Custom` name that was never wired, or `Unique` / `Exists` with no database attached) is reported to the caller through the `error` return instead of failing the user's field. That keeps a handler bug distinct from bad input.
{{% /callout %}}

## Available Rules

Velocity ships 49 built-in rules plus two database rules (`Unique`, `Exists`) supplied by `validation/dbrules` when validation runs against an `orm.Database`.

The table below is the complete catalog. The **Rule name** column is the string the engine reports on failure, which is what a `validation.Messages` key and `ValidationErrors.HasRule` match on. The **Absent / nil** column describes how the rule treats a field that is missing or `nil`; combine with `Required()` to enforce presence and with `Nullable()` / `Filled()` for opt-out semantics.

| Constructor | Rule name | Example | Absent / nil |
|---|---|---|---|
| `Accepted()` | `accepted` | `{"terms": {validation.Accepted()}}` | fails |
| `Alpha()` | `alpha` | `{"name": {validation.Alpha()}}` | passes (use with `Required()`) |
| `AlphaDash()` | `alpha_dash` | `{"slug": {validation.AlphaDash()}}` | passes |
| `AlphaNum()` | `alpha_num` | `{"username": {validation.AlphaNum()}}` | passes |
| `Array()` | `array` | `{"tags": {validation.Array()}}` | passes |
| `Between(min, max int)` | `between` | `{"age": {validation.Numeric(), validation.Between(18, 65)}}` | passes |
| `Boolean()` | `boolean` | `{"active": {validation.Boolean()}}` | passes |
| `Confirmed()` | `confirmed` | `{"password": {validation.Confirmed()}}` | passes (skipped when value is `nil`) |
| `Date()` | `date` | `{"published_at": {validation.Date()}}` | passes |
| `DateFormat(layout string)` | `date_format` | `{"day": {validation.DateFormat("2006-01-02")}}` | passes |
| `Different(field string)` | `different` | `{"alt_email": {validation.Different("email")}}` | passes |
| `Email()` | `email` | `{"email": {validation.Email()}}` | empty string fails; `nil` passes |
| `EndsWith(suffix string, ...)` | `ends_with` | `{"file": {validation.EndsWith(".pdf", ".png")}}` | passes |
| `Exists(table, column string)` | `exists` | `{"team_id": {validation.Exists("teams", "id")}}` | passes (DB rule, see below) |
| `File()` | `file` | `{"avatar": {validation.File()}}` | passes |
| `Filled()` | `filled` | `{"bio": {validation.Filled()}}` | passes when field absent; fails when present-but-empty |
| `Gt(field string)` | `gt` | `{"max": {validation.Gt("min")}}` | passes |
| `Gte(field string)` | `gte` | `{"qty": {validation.Gte("1")}}` | passes |
| `Image()` | `image` | `{"avatar": {validation.Image()}}` | passes |
| `In(value string, ...)` | `in` | `{"role": {validation.In("admin", "user", "mod")}}` | passes |
| `Integer()` | `integer` | `{"age": {validation.Integer()}}` | passes |
| `IP()` | `ip` | `{"addr": {validation.IP()}}` | empty string fails; `nil` passes |
| `IPv4()` | `ipv4` | `{"addr": {validation.IPv4()}}` | empty string fails; `nil` passes |
| `IPv6()` | `ipv6` | `{"addr": {validation.IPv6()}}` | empty string fails; `nil` passes |
| `JSON()` | `json` | `{"meta": {validation.JSON()}}` | passes |
| `Lt(field string)` | `lt` | `{"min": {validation.Lt("max")}}` | passes |
| `Lte(field string)` | `lte` | `{"qty": {validation.Lte("100")}}` | passes |
| `Max(n int)` | `max` | `{"bio": {validation.Max(500)}}` | passes |
| `Mimes(ext string, ...)` | `mimes` | `{"upload": {validation.Mimes("jpg", "png", "pdf")}}` | passes |
| `Min(n int)` | `min` | `{"password": {validation.Min(8)}}` | passes |
| `NotIn(value string, ...)` | `not_in` | `{"username": {validation.NotIn("admin", "root")}}` | passes |
| `Nullable()` | `nullable` | `{"middle_name": {validation.Nullable(), validation.String()}}` | always passes (marker) |
| `Numeric()` | `numeric` | `{"price": {validation.Numeric()}}` | passes |
| `Password()` | `password` | `{"pw": {validation.Password()}}` | fails (treats empty as missing) |
| `Present()` | `present` | `{"opt_in": {validation.Present()}}` | fails when key absent; passes when key present-but-empty |
| `Regex(pattern string)` | `regex` | `{"sku": {validation.Regex("^[A-Z]{3}$")}}` | passes (pattern must be `^...$` anchored) |
| `Required()` | `required` | `{"name": {validation.Required()}}` | fails on `nil`, `""`, empty slice/map |
| `RequiredIf(field, value string)` | `required_if` | `{"phone": {validation.RequiredIf("contact", "phone")}}` | conditional |
| `RequiredUnless(field, value string)` | `required_unless` | `{"company": {validation.RequiredUnless("type", "personal")}}` | conditional |
| `RequiredWith(field string, ...)` | `required_with` | `{"shipping": {validation.RequiredWith("address")}}` | conditional (any named field present) |
| `RequiredWithout(field string, ...)` | `required_without` | `{"sku": {validation.RequiredWithout("gtin")}}` | conditional (any named field absent) |
| `Same(field string)` | `same` | `{"pw_confirm": {validation.Same("password")}}` | passes |
| `Size(n int)` | `size` | `{"zip": {validation.Size(5)}}` | passes |
| `StartsWith(prefix string, ...)` | `starts_with` | `{"url": {validation.StartsWith("https://")}}` | passes |
| `String()` | `string` | `{"name": {validation.String()}}` | passes |
| `Timezone()` | `timezone` | `{"tz": {validation.Timezone()}}` | empty string fails; `nil` passes |
| `ULID()` | `ulid` | `{"id": {validation.ULID()}}` | passes |
| `Unique(table, column string)` | `unique` | `{"email": {validation.Unique("users", "email")}}` | passes (DB rule, see below) |
| `URL()` | `url` | `{"website": {validation.URL()}}` | empty string fails; `nil` passes |
| `URLPublic()` | `url_public` | `{"webhook": {validation.URLPublic()}}` | same as `URL()` plus rejects private/internal hosts |
| `UUID()` | `uuid` | `{"id": {validation.UUID()}}` | passes |

Constructors whose handler needs at least one parameter take the first one as a required argument, so an empty parameter list does not compile: `In`, `NotIn`, `StartsWith`, `EndsWith`, `Mimes`, `RequiredWith`, and `RequiredWithout`.

Four constructors return a builder value rather than a bare `Rule`, because they accept options: `Password()` returns `PasswordSpec`, `Mimes(...)` returns `MimesSpec`, `Image()` returns `ImageSpec`, and `Unique(...)` returns `UniqueSpec`. All four satisfy the `Rule` interface, so they drop into a `Rules` set unchanged.

{{% callout type="info" title="`Confirmed()` cross-field semantics" %}}
The `confirmed` rule on field `<X>` looks for a sibling field named `<X>_confirmation` in the input map and compares the two with `reflect.DeepEqual`. The convention is fixed; the suffix is not configurable. If the confirmation field is missing or differs, validation fails with `"The <X> confirmation does not match."`, reported on `<X>` itself (not on the confirmation field), so bind the message to the primary input.

```go
rules := validation.Rules{
    "password": {validation.Required(), validation.Min(8), validation.Confirmed()},
}

// Both fields must arrive in the request:
//   password=secret123
//   password_confirmation=secret123
```

`Confirmed()` returns success when the source field is `nil`, so combine it with `Required()` if the field itself is mandatory. Use [`Same`](#confirmed--same--different) instead when you need to match against an arbitrary field name.
{{% /callout %}}

### Highlights

#### Required()

Field must be present and not empty (`nil`, `""`, empty slice, empty map all fail):

```go
rules := validation.Rules{"name": {validation.Required()}}
```

#### Nullable() / Filled() / Present()

`Nullable()` is a marker whose effect lives in the engine loop: when the field's value is empty (`nil` or `""`), **every other rule on that field is skipped, including `Required()`**. `Filled()` accepts an absent field but fails when the field is present and empty. `Present()` requires the key to exist in the input map but allows an empty value.

```go
rules := validation.Rules{
    "middle_name": {validation.Nullable(), validation.String()},
    "bio":         {validation.Filled()},
    "opt_in":      {validation.Present()},
}
```

`Nullable()`'s notion of empty is deliberately narrow (`nil` or `""`) and does not extend to empty slices or maps: it exists for the HTML-form case where an untouched optional text input submits `""`.

#### Min() / Max() / Size() / Between()

These rules adapt to the value's runtime type. On strings they measure byte length (Go's `len`, not rune count, so multi-byte UTF-8 characters count as more than one); on `int` and `float64` they compare values; on slices they count elements.

```go
rules := validation.Rules{
    "password": {validation.Min(8)},
    "bio":      {validation.Max(500)},
    "zip_code": {validation.Size(5)},
    "age":      {validation.Numeric(), validation.Between(18, 65)},
}
```

{{% callout type="warning" title="Form values arrive as strings" %}}
`Min` / `Max` / `Size` / `Between` branch on the Go type they receive. A number posted through an HTML form arrives as a `string`, so `validation.Min(18)` on it measures **length**, not magnitude. Use `Gte("18")` for numeric bounds on values that may arrive as strings: the numeric comparison rules parse strings into `float64` first.
{{% /callout %}}

#### Confirmed() / Same() / Different()

Cross-field comparisons. `Confirmed()` is a special-cased `Same` that targets `<field>_confirmation`. `Same` and `Different` accept any sibling field name as their parameter.

```go
rules := validation.Rules{
    "password":         {validation.Required(), validation.Confirmed()},
    "password_confirm": {validation.Same("password")},
    "alt_email":        {validation.Different("email")},
}
```

#### In() / NotIn()

Value must (or must not) be one of the listed values. The first value is a separate parameter, so a zero-value call does not compile:

```go
rules := validation.Rules{
    "role":     {validation.In("admin", "user", "moderator")},
    "username": {validation.NotIn("admin", "root", "system")},
}
```

Because parameters are carried pre-split, a value containing a comma is fine: `validation.In("Doe, John", "Roe, Jane")`.

#### Accepted()

Field must be `yes`, `on`, `1`, or `true` (case-insensitive for strings; `true` and `1` also accepted as `bool` / `int`). Useful for terms-of-service checkboxes:

```go
rules := validation.Rules{"terms": {validation.Accepted()}}
```

#### RequiredIf() / RequiredUnless() / RequiredWith() / RequiredWithout()

Conditional presence rules. Use them when a field is required only when another field has a particular value, or only when other fields are present/absent:

```go
rules := validation.Rules{
    "phone":    {validation.RequiredIf("contact", "phone")},
    "company":  {validation.RequiredUnless("type", "personal")},
    "shipping": {validation.RequiredWith("address")},
    "sku":      {validation.RequiredWithout("gtin")},
}
```

`RequiredWith` and `RequiredWithout` take any number of field names and honour every one of them: `RequiredWith("a", "b")` requires the field when **any** of the named fields is present, `RequiredWithout("a", "b")` when **any** is absent.

```go
rules := validation.Rules{
    "billing_zip": {validation.RequiredWith("billing_street", "billing_city")},
}
```

#### Gt() / Gte() / Lt() / Lte()

Strict / inclusive numeric comparisons. The parameter is a string that is first parsed as a numeric literal; if that fails it is looked up as another field name and the threshold is read from that field's numeric value:

```go
rules := validation.Rules{
    "max_price": {validation.Numeric(), validation.Gt("min_price")}, // field reference
    "qty":       {validation.Numeric(), validation.Lte("100")},      // numeric literal
}
```

A parameter that is neither numeric nor an existing numeric field fails the field with a message naming the offending parameter.

#### Password()

Stricter than `Min`. Requires length >= 8 plus at least one uppercase letter, one lowercase letter, one digit, and one symbol. `MinLength(n)` returns a new rule that raises the length floor (values below 1 leave the built-in floor of 8 in place); the character-class requirements are always on.

```go
rules := validation.Rules{
    "pw": {validation.Required(), validation.Password()},            // >= 8, all classes
    "pw": {validation.Required(), validation.Password().MinLength(12)}, // >= 12
}
```

#### Regex()

The pattern must be anchored with `^...$` and is rejected if AST analysis finds a catastrophic-backtracking shape (e.g. `(a+)+`). Values longer than 4096 bytes are rejected before matching, and each evaluation is bounded to 10 ms. Compiled patterns are cached.

```go
rules := validation.Rules{"sku": {validation.Regex(`^[A-Z]{3}-\d{4}$`)}}
```

The pattern is carried verbatim in a single parameter, so alternations (`|`) and quantifiers (`{2,4}`) need no escaping.

#### File() / Mimes() / Image()

`File()` confirms the value carries `*multipart.FileHeader`-shaped metadata (any type exposing a `Filename` and `Size`, plus `Open() (multipart.File, error)` for sniffing). `Mimes(...)` checks the filename's extension against an allowlist **and** sniffs the first 512 bytes so a renamed payload (e.g. `payload.php.jpg`) is rejected; script-runner extensions and PE/ELF/Mach-O/Java-class magic bytes are refused outright regardless of the parameter list. `Image()` is a shortcut for the raster image extensions (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.heic`, `.heif`, `.avif`).

SVG is **excluded by default** because SVG is XML and can carry `<script>`. Opt in with the builder method:

```go
rules := validation.Rules{
    "avatar":   {validation.Image(), validation.Max(2048)},
    "document": {validation.File(), validation.Mimes("pdf", "docx")},
    "logo":     {validation.Image().AllowSVG()},
    "asset":    {validation.Mimes("jpg", "svg").AllowSVG()},
}
```

{{% callout type="warning" title="Uploads must be merged into the data map" %}}
`ExtractRequestData` does not populate multipart files, so `File` / `Mimes` / `Image` see nothing for an upload field unless you merge the `*multipart.FileHeader` into the data map yourself and validate with `CheckData`. For a one-off header check without a rule set, `ctx.ValidateFile(fh, opts...)` in the router package takes the header directly.
{{% /callout %}}

#### Unique() / Exists() (database rules)

`Unique` and `Exists` describe the check; execution lives in `validation/dbrules`, which owns the ORM dependency. They resolve whenever validation runs through a DB-aware entry point: `ctx.Validate`, `ctx.BindValid`, `vform.Form[T]` / `vform.Validate[T]`, or `dbrules.Check*` called directly. An empty column argument defaults to the field name at evaluation time.

```go
rules := validation.Rules{
    "email":   {validation.Required(), validation.Email(), validation.Unique("users", "email")},
    "team_id": {validation.Required(), validation.Exists("teams", "id")},
}

// On update, exclude the current row. Except accepts any integer, unsigned
// integer, or string kind (including named types such as `type UserID int64`)
// and any fmt.Stringer; the value is converted once, at construction.
rules = validation.Rules{
    "email": {
        validation.Required(),
        validation.Email(),
        validation.Unique("users", "email").Except(user.ID),
    },
}

// Match Except against a column other than "id":
validation.Unique("users", "email").Except(tenantID).IDColumn("tenant_id")
```

Both builder methods return a new value, so the base rule stays reusable. `IDColumn` has no effect without `Except`.

{{% callout type="warning" title="`Unique` is advisory, not authoritative" %}}
The rule runs a `SELECT COUNT(*)` and returns; the caller's subsequent `INSERT` races any other request that passed the same `SELECT`. Velocity deliberately does not lock or serialize the query: enforcing uniqueness at scale is the database's job.

Add a UNIQUE constraint at the database layer, then route the resulting write error through `dbrules.AsValidationError(err, fieldRules)`, which maps a driver-specific violation (Postgres SQLSTATE 23505, MySQL errno 1062, SQLite extended code 2067) back onto the offending field with the same "has already been taken" message the rule emits.
{{% /callout %}}

Raw database errors are never surfaced to the client. A failing `unique` / `exists` query produces a generic `"Unable to validate <field>."` message and logs the underlying error through `slog.Default()` at ERROR level.

## API Reference

### Entry points

Every entry point takes the same `validation.Rules` value. There are two families: the orm-free ones in `validation`, and the DB-backed ones in `validation/dbrules`.

| Function | Package | Signature |
|---|---|---|
| `Check` | `validation` | `Check(r *http.Request, rules Rules, messages ...Messages) (*Result, error)` |
| `CheckW` | `validation` | `CheckW(w http.ResponseWriter, r *http.Request, rules Rules, messages ...Messages) (*Result, error)` |
| `CheckData` | `validation` | `CheckData(data map[string]interface{}, rules Rules, messages ...Messages) (*Result, error)` |
| `CheckWithDB` | `dbrules` | `CheckWithDB(r *http.Request, rules validation.Rules, db orm.Database, messages ...validation.Messages) (*validation.Result, error)` |
| `CheckWithDBW` | `dbrules` | `CheckWithDBW(w http.ResponseWriter, r *http.Request, rules validation.Rules, db orm.Database, messages ...validation.Messages) (*validation.Result, error)` |
| `CheckDataWithDB` | `dbrules` | `CheckDataWithDB(data map[string]interface{}, rules validation.Rules, db orm.Database, messages ...validation.Messages) (*validation.Result, error)` |
| `CheckDataWithDBCtx` | `dbrules` | `CheckDataWithDBCtx(ctx context.Context, data map[string]interface{}, rules validation.Rules, db orm.Database, messages ...validation.Messages) (*validation.Result, error)` |

All seven return `(*Result, error)`. The `error` is a malformed rule set; field failures travel on `*Result`. On the `error` path `*Result` is `nil`, so check `err` first.

#### Check / CheckW

Validate an HTTP request (form values or JSON body, auto-detected from `Content-Type`). Prefer `CheckW` when a `http.ResponseWriter` is in hand: it wraps the body read with `http.MaxBytesReader` so an oversized body can also signal the connection to close.

```go
func handler(c *router.Context) error {
    rules := validation.Rules{
        "email": {validation.Required(), validation.Email()},
        "name":  {validation.Required(), validation.String()},
    }

    result, err := validation.CheckW(c.Response, c.Request, rules)
    if err != nil {
        return err
    }
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
result, err := validation.CheckData(data, validation.Rules{
    "email": {validation.Required(), validation.Email()},
    "age":   {validation.Required(), validation.Numeric(), validation.Gte("18")},
})
if err != nil {
    return err // malformed rule set
}
if err := result.Err(); err != nil {
    // err wraps validation.ErrValidationFailed and unwraps to ValidationErrors
    return err
}
```

#### dbrules.CheckWithDBW / CheckDataWithDBCtx

Same as above with `Unique` and `Exists` wired to an `orm.Database`. The request context is threaded into the queries, so a slow `unique` lookup is dropped when the client disconnects.

```go
import (
    "github.com/velocitykode/velocity/orm"
    "github.com/velocitykode/velocity/validation/dbrules"
)

// c.DB() returns the stdlib-only contract.Database; recover the wider
// orm.Database with the supported type assertion.
db, _ := c.DB().(orm.Database)

result, err := dbrules.CheckWithDBW(c.Response, c.Request, rules, db)
```

For non-HTTP code paths (jobs, workers, seeders) use `CheckDataWithDBCtx` and pass the caller's context.

### Handler-side entry points

Two `router.Context` methods wrap the same rule sets and are usually what a handler reaches for.

#### ctx.Validate

```go
func (c *Context) Validate(rules contract.ValidationRuleSet, messages ...contract.ValidationMessages) error
```

`validation.Rules` is an alias for `contract.ValidationRuleSet`, so a rule set passes straight in. On failure `ctx.Validate` flashes the errors and the redacted old input, redirects back when a view engine is installed, and returns `router.ErrValidationAborted` so the handler can return early without the router emitting a second response. DB-backed rules resolve here.

```go
func (h *Handler) Store(ctx *router.Context) error {
    if err := ctx.Validate(validation.Rules{
        "name":  {validation.Required()},
        "email": {validation.Required(), validation.Email(), validation.Unique("users", "email")},
    }); err != nil {
        return err
    }
    // only reaches here if valid
    return nil
}
```

It returns an ordinary error (not a panic) when no validator is wired, since it runs per request.

#### ctx.BindValid

`router.Validatable` is the self-validating request contract:

```go
type Validatable interface {
    Rules() contract.ValidationRuleSet
}
```

`vform.FormRequest` is an alias for it, so one form struct serves both `ctx.BindValid` and `vform.Form[T]`.

```go
type UpdateProfile struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

func (r *UpdateProfile) Rules() validation.Rules {
    return validation.Rules{
        "name":  {validation.Required(), validation.Min(2)},
        "email": {validation.Required(), validation.Email(), validation.Unique("users", "email")},
    }
}

func (h *Handler) Update(c *router.Context) error {
    var req UpdateProfile
    if err := c.BindValid(&req); err != nil {
        return err
    }
    // ...
    return nil
}
```

`BindValid` binds JSON, then validates the resulting struct through the data-validator seam the framework wires during boot, so DB-backed rules resolve here too. Unlike `ctx.Validate` it neither flashes nor redirects: it just returns the validation error. It returns an error when no validator is wired.

### Result methods

| Method | Returns |
|---|---|
| `HasErrors()` | `bool`: true when at least one field failed |
| `First(field)` | first message for `field`, or `""` |
| `All()` | `map[string]string`, first message per field (Inertia-friendly shape) |
| `Messages()` | `map[string][]string`, all messages per field |
| `Err()` | `error` wrapping `ErrValidationFailed`; `nil` on success. Satisfies `errors.As(&ValidationErrors{})` |
| `Old()` | `map[string]interface{}` of original input with sensitive fields stripped (case-insensitive substring match on `password`, `passwd`, `passcode`, `secret`, `token`, `pin`, `cvv`, `cvc`, `card`, `ssn`, `otp`, `credential`, `credentials`, `api_key`, `apikey`, `private_key`, `privatekey`), suitable for flashing |

### ValidationErrors

When you unwrap `Result.Err()` with `errors.As(&validation.ValidationErrors{})`, you get the lower-level shape:

```go
var ve validation.ValidationErrors
if errors.As(result.Err(), &ve) {
    ve.Count()                      // total error count
    ve.HasError("email")            // bool
    ve.First("email")               // first message
    ve.All()                        // map[string][]string
    ve.HasRule("email", "required") // bool, prefer over substring match
    ve.RulesFor("email")            // []string of rule names that failed
}
```

`errors.Is(result.Err(), validation.ErrValidationFailed)` works for the generic "validation failed" branch, and `errors.Is(err, validation.ErrInvalidRule)` for the malformed-rule-set branch on the `error` return.

### Validator

`validation.NewValidator()` returns a long-lived `Validator` (the same type the framework installs as `Services.Validator`):

```go
type Validator interface {
    Validate(data interface{}, rules ValidationRuleSet) (*ValidatedData, error)
    ValidateValue(value interface{}, rules ...ValidationRule) error
    SetMessages(messages ValidationMessages)
}
```

`Validate` accepts a `map[string]interface{}` or a `map[string]string` and returns `*ValidatedData` alongside the error. `ValidateValue` validates a single unnamed value against a rule list; messages and message-key lookups for it use the field name `"value"`.

```go
v := validation.NewValidator()

if err := v.ValidateValue("not-an-email", validation.Required(), validation.Email()); err != nil {
    // err is a validation.ValidationErrors describing the "value" field,
    // or wraps ErrInvalidRule when the rule list is malformed.
}
```

## Custom Validation Rules

`validation.Custom(name, handler)` builds a rule that carries its own handler, so it runs anywhere the rule set reaches, including the fresh per-request validator the `Check` helpers build. There is no registration step and no global rule registry.

```go
import (
    "fmt"
    "unicode"

    "github.com/velocitykode/velocity/validation"
)

// The returned value IS the rule's identity: declare it once at package level
// and reuse it wherever the rule applies. Two distinct Custom values sharing a
// name inside one rule set are rejected during normalization, because nothing
// could decide which handler wins.
var StrongPassword = validation.Custom("strong_password", func(
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

// Usage: identical to any built-in.
rules := validation.Rules{
    "password": {validation.Required(), validation.Min(8), StrongPassword},
}
```

The handler signature is `validation.RuleHandler`:

```go
type RuleHandler func(field string, value interface{}, params []string, data map[string]interface{}) error
```

`params` is a copy handed to each invocation, so a handler that mutates it cannot corrupt the shared rule set. A `Custom` name that shadows a built-in (including `unique` and `exists`) is rejected during normalization, as is a nil handler.

For most adopters the built-in [`Password()`](#password) rule is enough; reach for a custom rule only when the policy is genuinely app-specific.

## Custom Error Messages

`validation.Messages` is keyed by a `{Field, Rule}` pair. `Rule` is the rule name from the [catalog](#available-rules) table; a key with an empty `Rule` is never consulted, because an override always names the rule it replaces.

```go
messages := validation.Messages{
    {Field: "email", Rule: "required"}:    "Email is required",
    {Field: "email", Rule: "email"}:       "Invalid email format",
    {Field: "password", Rule: "required"}: "Password is required",
    {Field: "password", Rule: "min"}:      "Password must be at least 8 characters",
}

result, err := validation.CheckW(c.Response, c.Request, rules, messages)
```

Every `Check*` helper, `ctx.Validate`, and `Validator.SetMessages` accept the same map. From a [form-request](/docs/core/form-requests), implement `vform.WithMessages` and the messages are passed through automatically:

```go
func (r *SignupRequest) ValidationMessages() validation.Messages {
    return validation.Messages{
        {Field: "email", Rule: "required"}: "We need your email.",
    }
}
```

Velocity ships English-only messages; there is no locale setting. `SetMessages` is the override path.

## Best Practices

### 1. Validate at the edge

Validate as soon as input enters the handler, before any business logic:

```go
func CreateUser(c *router.Context) error {
    result, err := validation.CheckW(c.Response, c.Request, validation.Rules{
        "email": {validation.Required(), validation.Email()},
        "name":  {validation.Required(), validation.String()},
    })
    if err != nil {
        return err
    }
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

[Form requests](/docs/core/form-requests) bundle binding, validation, flashing, and redirect-back into one call. Use `validation.Check*` or `dbrules.Check*` directly only when you need a custom render path or you're validating data that isn't an HTTP request.

### 3. Separate the two error paths

The `error` return means the rule set is broken (a handler bug, a 500). `result.HasErrors()` means the user's input is bad (a 422 or a redirect back). Never render the first as a field message.

```go
result, err := validation.CheckW(c.Response, c.Request, rules)
if err != nil {
    return err // 500: ErrInvalidRule, not user-facing
}
if result.HasErrors() {
    return c.JSON(422, map[string]interface{}{"errors": result.Messages()})
}
```

### 4. Provide clear error messages

```go
messages := validation.Messages{
    {Field: "email", Rule: "email"}:     "Please enter a valid email address",
    {Field: "password", Rule: "min"}:    "Your password needs to be at least 8 characters",
    {Field: "terms", Rule: "accepted"}:  "You must accept the terms of service",
}
```

### 5. Order rules from general to specific

```go
rules := validation.Rules{
    // Good: required first, then type, then constraints.
    "age": {validation.Required(), validation.Numeric(), validation.Gte("18"), validation.Lte("120")},
}
```

### 6. Reuse rule sets

Rule values are immutable, so a package-level rule list is safe to share across handlers and goroutines:

```go
var (
    EmailRules    = []validation.Rule{validation.Required(), validation.Email()}
    PasswordRules = []validation.Rule{validation.Required(), validation.Min(8), StrongPassword}
    PhoneRules    = []validation.Rule{validation.Required(), validation.Numeric(), validation.Size(10)}
)

rules := validation.Rules{
    "email":    EmailRules,
    "password": PasswordRules,
    "phone":    PhoneRules,
}
```

## Complete Example

A full user-registration endpoint using `dbrules.CheckWithDBW`, so `Unique` resolves against the database:

```go
package handlers

import (
    "github.com/velocitykode/velocity/orm"
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/validation"
    "github.com/velocitykode/velocity/validation/dbrules"
)

type UserHandler struct{}

func (uc *UserHandler) Register(c *router.Context) error {
    rules := validation.Rules{
        "name":                  {validation.Required(), validation.String(), validation.Min(2), validation.Max(100)},
        "email":                 {validation.Required(), validation.Email(), validation.Unique("users", "email")},
        "password":              {validation.Required(), validation.Min(8), validation.Confirmed()},
        "password_confirmation": {validation.Required()},
        "age":                   {validation.Required(), validation.Numeric(), validation.Gte("18")},
        "terms":                 {validation.Required(), validation.Accepted()},
        "newsletter":            {validation.Nullable(), validation.Boolean()},
    }

    messages := validation.Messages{
        {Field: "name", Rule: "required"}:      "Please tell us your name",
        {Field: "name", Rule: "min"}:           "Name must be at least 2 characters",
        {Field: "email", Rule: "required"}:     "We need your email address",
        {Field: "email", Rule: "email"}:        "Please enter a valid email address",
        {Field: "email", Rule: "unique"}:       "That email is already registered",
        {Field: "password", Rule: "required"}:  "Password is required",
        {Field: "password", Rule: "min"}:       "Password must be at least 8 characters",
        {Field: "password", Rule: "confirmed"}: "Passwords do not match",
        {Field: "age", Rule: "required"}:       "Please provide your age",
        {Field: "age", Rule: "gte"}:            "You must be at least 18 years old",
        {Field: "terms", Rule: "accepted"}:     "You must accept the terms of service",
    }

    db, _ := c.DB().(orm.Database)

    result, err := dbrules.CheckWithDBW(c.Response, c.Request, rules, db, messages)
    if err != nil {
        // Malformed rule set: a bug here, not bad input.
        return err
    }
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
        "email":    {validation.Required(), validation.Email()},
        "password": {validation.Required(), validation.Min(8)},
        "age":      {validation.Required(), validation.Numeric(), validation.Gte("18")},
    }

    result, err := validation.CheckData(data, rules)
    require.NoError(t, err)
    assert.False(t, result.HasErrors())
}

func TestValidationErrors(t *testing.T) {
    data := map[string]interface{}{
        "email": "invalid-email",
        "age":   "not-a-number",
    }

    rules := validation.Rules{
        "email": {validation.Required(), validation.Email()},
        "age":   {validation.Required(), validation.Numeric()},
    }

    result, err := validation.CheckData(data, rules)
    require.NoError(t, err)
    assert.True(t, result.HasErrors())

    var ve validation.ValidationErrors
    require.True(t, errors.As(result.Err(), &ve))
    assert.True(t, ve.HasRule("email", "email"))
    assert.True(t, ve.HasRule("age", "numeric"))
    assert.Equal(t, 2, ve.Count())
}
```

The `validation/testing` package ships three helpers for rule-level tests:

```go
import vtesting "github.com/velocitykode/velocity/validation/testing"

func TestEmailRule(t *testing.T) {
    // Applies the rules to every key in the input map.
    // expectedErr=true means the input is expected to fail.
    vtesting.RuleAssertion(t, map[string]interface{}{"email": "bad"}, true,
        validation.Required(), validation.Email())

    v := vtesting.NewTestValidator()
    _, err := v.Validate(map[string]interface{}{"email": ""}, validation.Rules{
        "email": {validation.Required(), validation.Email()},
    })

    // Asserts the field failed the NAMED rule, not just "something failed".
    vtesting.AssertErrorRule(t, err, "email", "required")

    // Use only where the exact wording is load-bearing.
    vtesting.AssertErrorMessage(t, err, "email", "is required")
}
```

Prefer `AssertErrorRule` (or `ValidationErrors.HasRule`) over substring-matching messages: a test asserting `HasError("email")` still passes when the wrong rule fired.

## Related

- [Form Requests](/docs/core/form-requests/) - HTTP-handler entry point that wraps validation with binding, flashing, and redirect-back
- [Middleware](/docs/core/middleware/) - where global input shaping (CSRF, rate limit, body parsing) runs before validation

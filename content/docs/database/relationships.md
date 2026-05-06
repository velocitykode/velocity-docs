---
title: Relationships
description: Define hasOne, hasMany, belongsTo, manyToMany, and polymorphic relationships with eager loading in Velocity ORM.
weight: 30
---

Velocity ORM supports five relation types: `hasOne`, `hasMany`, `belongsTo`, `manyToMany`, and `polymorphic`. Relations are declared via a struct tag and loaded with `.With()`.

## Relationship Types

| Type | Cardinality | Tag goes on | Example |
|------|-------------|-------------|---------|
| `hasOne` | One-to-one | Parent | User has one Profile |
| `hasMany` | One-to-many | Parent | User has many Posts |
| `belongsTo` | Inverse of hasOne / hasMany | Child | Post belongs to User |
| `manyToMany` | Many-to-many via pivot | Either side | User has many Roles |
| `polymorphic` | Heterogeneous parent | Child | Comment on Post or Video |

## Tag Syntax

Every relation tag uses **comma-separated** values inside a single `relation:` key. The shape depends on the type:

```
orm:"relation:hasOne,<foreignKey>,<localKey>"
orm:"relation:hasMany,<foreignKey>,<localKey>"
orm:"relation:belongsTo,<foreignKey>,<localKey>"
orm:"relation:manyToMany,<pivotTable>,<localFK>,<relatedFK>"
orm:"relation:polymorphic,<typeColumn>,<idColumn>"
```

- `<type>`: one of `hasOne`, `hasMany`, `belongsTo`, `manyToMany`, `polymorphic` (case-sensitive).
- `hasOne` / `hasMany` / `belongsTo`: `<foreignKey>` is the column on the **child** table; `<localKey>` is the column on the **parent** (almost always `id`).
- `manyToMany`: `<pivotTable>` is the join table; `<localFK>` and `<relatedFK>` are its two FK columns. See [Many-to-Many](#many-to-many).
- `polymorphic`: `<typeColumn>` and `<idColumn>` live on the **child** and identify the parent row. See [Polymorphic Relations](#polymorphic-relations).

All parts are required for each shape. There are no convention-based defaults: the parser will not infer key names from the field name.

{{< callout type="warning" title="Use commas, not semicolons" >}}
The outer `orm:"..."` tag uses `;` to separate top-level directives (`column:foo;type:bigint;not_null`). The `relation:` directive value uses `,` internally. Mixing them causes the parser to reject the tag.
{{< /callout >}}

## Has One

Tag goes on the parent's pointer field. Foreign key lives on the child table.

```go
type User struct {
    orm.Model[User]
    Name    string   `orm:"column:name;type:varchar(255)"`
    Profile *Profile `orm:"relation:hasOne,user_id,id"`
}

type Profile struct {
    orm.Model[Profile]
    UserID uint   `orm:"column:user_id;type:bigint;not_null"`
    Bio    string `orm:"column:bio;type:text"`
    User   *User  `orm:"relation:belongsTo,user_id,id"`
}
```

Load:

```go
users, err := User{}.With("Profile").Get()
for _, u := range users {
    if u.Profile != nil {
        fmt.Println(u.Name, u.Profile.Bio)
    }
}
```

## Has Many

Tag goes on the parent's slice field. Foreign key lives on each child row.

```go
type User struct {
    orm.Model[User]
    Name  string `orm:"column:name;type:varchar(255)"`
    Posts []Post `orm:"relation:hasMany,user_id,id"`
}

type Post struct {
    orm.Model[Post]
    UserID uint   `orm:"column:user_id;type:bigint;not_null"`
    Title  string `orm:"column:title;type:varchar(255)"`
    User   *User  `orm:"relation:belongsTo,user_id,id"`
}
```

Load:

```go
users, err := User{}.With("Posts").Get()
for _, u := range users {
    fmt.Printf("%s has %d posts\n", u.Name, len(u.Posts))
}
```

`[]*Post` is also accepted. The element type drives whether each loaded row is allocated as a value or pointer.

## Belongs To

Tag goes on the child's pointer-to-parent field. Foreign key lives on the same struct (the child).

```go
type Comment struct {
    orm.Model[Comment]
    PostID  uint   `orm:"column:post_id;type:bigint;not_null"`
    Content string `orm:"column:content;type:text"`
    Post    *Post  `orm:"relation:belongsTo,post_id,id"`
}
```

Load:

```go
comments, err := Comment{}.With("Post").Get()
for _, c := range comments {
    if c.Post != nil {
        fmt.Println(c.Post.Title)
    }
}
```

The same shape applies to any inverse relation: `Post.User`, `Profile.User`, etc.

## Many-to-Many

Many-to-many is declared with the `manyToMany:` tag and a pivot table that holds the two foreign keys. Both ends of the relation get a slice field; the pivot rows are managed through accessor helpers, never through plain `Save()`.

### Tag syntax

```
orm:"manyToMany:<pivot_table>,<localFK>,<relatedFK>"
```

- `<pivot_table>`: name of the join table (e.g. `team_members`).
- `<localFK>`: column on the pivot pointing at the **declaring** struct's `id`.
- `<relatedFK>`: column on the pivot pointing at the **other** struct's `id`.

All three parts are required. The two ends of the same relation use the **same pivot table**, but swap the order of `localFK` and `relatedFK` so each side's "local" is the column referencing itself.

```go
type User struct {
    orm.Model[User]
    Name  string `orm:"column:name;type:varchar(255)"`
    Roles []Role `orm:"manyToMany:user_roles,user_id,role_id"`
}

type Role struct {
    orm.Model[Role]
    Name  string `orm:"column:name;type:varchar(64)"`
    Users []User `orm:"manyToMany:user_roles,role_id,user_id"`
}
```

The pivot table itself does not need a Go struct. It only has to exist in the database with at least the two FK columns; any extra columns become "pivot extras" (see below).

### Eager loading

`.With("Roles")` works the same as for `hasMany`. The loader issues two SQL queries total per preload regardless of parent count:

1. One `SELECT ... FROM <pivot> WHERE <localFK> IN (?, ?, ...)` to fetch all linkage rows.
2. One `SELECT * FROM <related_table> WHERE id IN (?, ?, ...)` to fetch the related models.

Results are grouped client-side onto each parent's slice field. The pivot table's column list is probed once (`SELECT * FROM <pivot> WHERE 1=0`) and cached in a `sync.Map` keyed by `(driver, table)`, so subsequent loads of the same relation skip the schema lookup.

```go
users, _ := User{}.With("Roles").Get()
for _, u := range users {
    fmt.Printf("%s has %d roles\n", u.Name, len(u.Roles))
}
```

### Mutating pivot rows: Attach, Detach, Sync

Use `orm.M2M(parent, "RelationName")` to obtain an `*M2MAccessor`, then call `Attach`, `Detach`, or `Sync`. Each method runs inside a single transaction.

```go
acc, err := orm.M2M(&user, "Roles")
if err != nil {
    return err
}

// Add links. Duplicates and existing rows are skipped.
err = acc.Attach(ctx, adminRole.ID, editorRole.ID)

// Remove specific links.
err = acc.Detach(ctx, editorRole.ID)

// Detach-all when called with no ids.
err = acc.Detach(ctx)

// Replace the entire set: missing rows are inserted, extras deleted.
err = acc.Sync(ctx, adminRole.ID, viewerRole.ID)
```

The parent must have a non-zero `id` before constructing the accessor; `M2M` returns `"parent has no id - save it first"` if you call it on an unsaved struct.

### Pivot extras via `LoadManyToManyWithPivot`

When the pivot table carries extra columns (timestamps, role flags, sort order, etc.), `LoadManyToManyWithPivot[T, R]` returns the related rows paired with a `map[string]any` of every non-FK pivot column for that linkage:

```go
type PivotResult[T any] struct {
    Related T
    Pivot   map[string]any
}
```

```go
results, err := orm.LoadManyToManyWithPivot[User, Role](&user, "Roles")
if err != nil {
    return err
}
for _, r := range results {
    assignedAt, _ := r.Pivot["assigned_at"].(time.Time)
    fmt.Printf("%s, assigned %s\n", r.Related.Name, assignedAt)
}
```

The first type parameter is the parent type, the second is the related type. The function fails fast with a clear error if `R` does not match the related type discovered from the tag.

{{< callout type="tip" title="Recipe: Users with role tags via pivot" >}}
The pivot table here carries an extra `assigned_at` timestamp on every row. The relation declarations stay clean (no mention of the extra column), and the extra surfaces only when you ask for it via `LoadManyToManyWithPivot`.

```go
// Schema (illustrative migration)
// CREATE TABLE user_roles (
//   user_id     BIGINT NOT NULL,
//   role_id     BIGINT NOT NULL,
//   assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
//   PRIMARY KEY (user_id, role_id)
// );

type User struct {
    orm.Model[User]
    Name  string `orm:"column:name;type:varchar(255)"`
    Roles []Role `orm:"manyToMany:user_roles,user_id,role_id"`
}

type Role struct {
    orm.Model[Role]
    Name string `orm:"column:name;type:varchar(64)"`
}

// Assign a few roles to a user.
acc, _ := orm.M2M(&user, "Roles")
_ = acc.Sync(ctx, adminRole.ID, editorRole.ID)

// Render the roles with their assignment timestamp.
results, _ := orm.LoadManyToManyWithPivot[User, Role](&user, "Roles")
for _, r := range results {
    when, _ := r.Pivot["assigned_at"].(time.Time)
    fmt.Printf("%s (since %s)\n", r.Related.Name, when.Format(time.RFC3339))
}
```
{{< /callout >}}

## Polymorphic Relations

A polymorphic relation lets a single field point at one of several different parent tables. For example, a `Comment` that can hang off either a `Post` or a `Video`. The discriminator (which table the row lives in) is stored as a string in a "type" column alongside the foreign-key id.

### Tag syntax

```
orm:"polymorphic:<type_col>,<id_col>"
```

- `<type_col>`: column on the **child** table holding the type-name string (e.g. `commentable_type`).
- `<id_col>`: column on the **child** table holding the foreign key id (e.g. `commentable_id`).

The polymorphic field's Go type **must** be `orm.Morph` (struct value, not pointer or slice). The two scalar columns themselves still need to be declared on the struct so they round-trip through SQL.

```go
type Comment struct {
    orm.Model[Comment]
    Body            string     `orm:"column:body;type:text"`
    CommentableType string     `orm:"column:commentable_type;type:varchar(64);not_null"`
    CommentableID   uint       `orm:"column:commentable_id;type:bigint;not_null"`
    Commentable     orm.Morph  `orm:"polymorphic:commentable_type,commentable_id"`
}
```

### The `Morph` value

```go
type Morph struct {
    TypeName string  // discriminator stored in the type column
    ID       any     // foreign key value
    Resolved any     // populated by eager-load or Resolve (typically *T)
}
```

`Morph.IsZero()` reports whether the morph carries any type/id information. Useful when rendering a list and skipping rows that point nowhere.

### Registering morph types

Each possible target type must be registered once at startup so the loader can map a type-name string to a Go type:

```go
func init() {
    orm.RegisterMorph("post",  reflect.TypeOf(Post{}))
    orm.RegisterMorph("video", reflect.TypeOf(Video{}))
}
```

A common pattern is to register from a service provider's `Boot`. Re-registering the same name overwrites the previous binding, which is convenient for swapping implementations in tests.

`LookupMorph(name)` returns the registered type and a boolean. `ResetMorphRegistry()` clears every binding (test-only).

### Eager loading

`.With("Commentable")` groups parents by the value in the type column, then issues one `SELECT ... WHERE id IN (...)` per distinct type. For `N` parents spread across `K` distinct types, the loader issues `K` SQL round trips for that preload, not `N`.

```go
comments, _ := Comment{}.With("Commentable").Get()
for _, c := range comments {
    switch v := c.Commentable.Resolved.(type) {
    case *Post:
        fmt.Println("on post:", v.Title)
    case *Video:
        fmt.Println("on video:", v.URL)
    }
}
```

`Resolved` is set to a `*T` for the registered type. Type-switch on it to branch.

### Single-row resolution

When you have a `Comment` in hand and want to load its target without going through the eager-load path, call `Resolve` on the field's `Morph`:

```go
target, err := comment.Commentable.Resolve(ctx)
if err != nil {
    return err
}
post := target.(*Post)
```

`Resolve` returns a clear error for unknown type-names, an empty `TypeName`, a zero `ID`, or `ErrRecordNotFound` when the target row does not exist.

### Strict vs non-strict mode

The eager-load path and `Morph.Resolve` differ on what happens when a row's `TypeName` is not in the registry:

- **`Morph.Resolve` always errors** on an unknown type. Single-row callers have direct access to the failure and can branch on it.
- **Eager-load defaults to non-strict**: rows of an unknown type are skipped, and a warning is written to `os.Stderr`. The unresolved rows simply have `Resolved == nil`. This way, deploying a new morph type before every caller has been updated to register it does **not** crash list views. The new rows render as "unknown" instead of taking the page down.

Toggle the mode at startup or in tests:

```go
orm.SetMorphStrict(true)   // unknown types fail the entire eager-load batch
orm.SetMorphStrict(false)  // skip + warn (default)
b := orm.MorphStrict()     // read current setting
```

The warning destination is configurable. Pass `nil` to silence warnings entirely, or a buffer to capture them in tests:

```go
var buf bytes.Buffer
prev := orm.SetMorphWarnWriter(&buf)
defer orm.SetMorphWarnWriter(prev) // restore
```

`SetMorphWarnWriter` returns the previous writer so test cleanup can restore it.

{{< callout type="info" title="Why non-strict by default?" >}}
A polymorphic schema usually grows by addition: a new morph target gets added to the database before every service that lists those rows is rebuilt with the matching `RegisterMorph` call. If eager-load were strict by default, that ordering would crash any list view containing even one row of the new type. Non-strict mode degrades gracefully: affected rows show up with `Resolved == nil` and the rest of the list renders normally. Use `SetMorphStrict(true)` in tests and in jobs where silent skipping would hide a real bug.
{{< /callout >}}

{{< callout type="tip" title="Recipe: Comments on Posts and Videos via polymorphic morph" >}}
```go
type Post struct {
    orm.Model[Post]
    Title string `orm:"column:title;type:varchar(255)"`
}

type Video struct {
    orm.Model[Video]
    URL string `orm:"column:url;type:varchar(512)"`
}

type Comment struct {
    orm.Model[Comment]
    Body            string    `orm:"column:body;type:text"`
    CommentableType string    `orm:"column:commentable_type;type:varchar(64);not_null"`
    CommentableID   uint      `orm:"column:commentable_id;type:bigint;not_null"`
    Commentable     orm.Morph `orm:"polymorphic:commentable_type,commentable_id"`
}

// Register the targets once at startup.
func init() {
    orm.RegisterMorph("post",  reflect.TypeOf(Post{}))
    orm.RegisterMorph("video", reflect.TypeOf(Video{}))
}

// Create a comment against a post.
c := Comment{
    Body:            "great read",
    CommentableType: "post",
    CommentableID:   post.ID,
}
_ = c.Save()

// Eager-load a feed of comments. One IN query per distinct target type.
comments, _ := Comment{}.With("Commentable").Get()
for _, c := range comments {
    switch v := c.Commentable.Resolved.(type) {
    case *Post:
        fmt.Println("post:", v.Title)
    case *Video:
        fmt.Println("video:", v.URL)
    case nil:
        // Non-strict mode: type was not registered; row was skipped with a warning.
    }
}
```
{{< /callout >}}

## Eager Loading

`.With(name...)` queues relations to load after the primary query. Pass field names exactly as declared on the struct (case-insensitive match is also accepted, but exact is preferred for clarity).

```go
// One relation
users, _ := User{}.With("Posts").Get()

// Multiple relations
users, _ := User{}.With("Profile", "Posts").Get()
```

Each preload runs as a single `SELECT ... WHERE <queryColumn> IN (?, ?, ...)` against the related table, then results are grouped back onto their parent rows. Soft-deleted children are filtered automatically when the related model embeds `orm.SoftDeleteModel`.

## Custom Foreign Keys

Use any column name; the parser does not require `<parent>_id` form. Both keys are passed verbatim to SQL.

```go
type Post struct {
    orm.Model[Post]
    AuthorID uint  `orm:"column:author_id;type:bigint;not_null"`
    Author   *User `orm:"relation:belongsTo,author_id,id"`
}

type User struct {
    orm.Model[User]
    Name  string `orm:"column:name;type:varchar(255)"`
    Posts []Post `orm:"relation:hasMany,author_id,id"`
}
```

Composite keys are not supported.

## Common Pitfalls

### 1. Bare relation type with no keys

```go
// WRONG: parser rejects with "relation tag has empty key names".
Posts []Post `orm:"relation:hasMany"`
```

Both keys are required. There is no inferred default.

### 2. Semicolons inside `relation:`

```go
// WRONG: parser sees a single value "hasMany;foreign_key:user_id;..."
// which has only one comma-separated part instead of three.
Posts []Post `orm:"relation:hasMany;foreign_key:user_id;local_key:id"`
```

Use commas for the three parts inside `relation:`. Use semicolons only between top-level directives like `column:`, `type:`, `not_null`.

### 3. Tag on the wrong side of the relation

The parser does not validate which side the tag lives on. Putting a `belongsTo` tag on the parent or a `hasMany` tag on the child compiles fine but loads zero rows because the `IN` query will never match. Always verify:

- `belongsTo`: child struct, points at one parent.
- `hasMany` / `hasOne`: parent struct, points at one or many children.

### 4. Wrong relation type name

```go
// WRONG: "BelongsTo" capitalized; parser expects "belongsTo".
*User `orm:"relation:BelongsTo,user_id,id"`
```

Type names are case-sensitive: `hasOne`, `hasMany`, `belongsTo` (camelCase).

### 5. Unsupported tag forms inside `relation:`

The `relation:` directive itself accepts only `hasOne`, `hasMany`, and `belongsTo`. Many-to-many uses the separate `manyToMany:` tag and polymorphic uses `polymorphic:` (see the dedicated sections above). `morphOne` / `morphMany` style tags are not implemented; the polymorphic field is always a single `orm.Morph` value.

## Error Reference

Errors emitted by `parseRelationTag` (in `orm/relation.go`):

| Error | Cause |
|-------|-------|
| `orm: invalid relation tag "<value>" - expected "type,foreignKey,localKey"` | Wrong number of comma-separated parts. Most often caused by using `;` inside `relation:` or omitting one of the keys. |
| `orm: unknown relation type "<value>"` | First part is not `hasOne`, `hasMany`, or `belongsTo`. |
| `orm: relation tag "<value>" has empty key names` | Foreign or local key is blank, e.g. `relation:hasMany,,id`. |
| `orm: relation "<name>" not found on <model>` | `.With("X")` references a struct field that does not exist or does not carry a `relation:` tag. |
| `orm: invalid foreign key in relation tag` / `orm: invalid local key` | Key name fails identifier validation (non-alphanumeric, starts with a digit, etc.). |

Grep these strings if you hit a runtime error; the prefix `orm:` is consistent across the package.

## Behavior Details

These are observable runtime behaviors of the relation loader that are easy to miss by reading the API alone.

### Case-insensitive name matching

`findRelationField` tries an exact match first, then falls back to lowercase. Both work:

```go
users, _ := User{}.With("Posts").Get()  // exact (preferred)
users, _ := User{}.With("posts").Get()  // case-insensitive fallback
```

### Numeric key normalization

Parent and child keys are normalized to `int64` before comparison. Mixing `uint`, `uint32`, `int64`, etc., across the foreign / local key columns still matches correctly. String keys (UUIDs) compare as-is.

### Zero-key rows are skipped

Parents whose collected key value is `0` or `""` are dropped from the IN query. Children whose group key is zero are not assigned. This avoids accidental fan-out across all uninitialized rows when seed data contains placeholders.

### Embedded base-model fields are visible as columns

The field walker recurses into anonymous embedded structs (skipping `time.Time`). This is why `id` resolves on a model that embeds `orm.Model[T]` instead of declaring `ID` directly.

### `IsExisting` is set on loaded children

Each loaded related row has its `IsExisting` flag set to `true` on the embedded base model. Calling `Save()` on a loaded child performs an UPDATE rather than an INSERT. Useful when mutating a relation in place.

### `hasOne` returns the first match if multiple rows exist

`assignSingle` takes the first row from the matching group. If two child rows share the same foreign key value, the second is silently discarded. Add a uniqueness constraint on the foreign key column to enforce one-to-one at the database level.

### One query per preload, not per parent

Each `.With("X")` adds one preload. The loader issues a single `SELECT ... WHERE <col> IN (?, ?, ...)` per preload regardless of parent count, then groups results client-side. Two preloads on a 1000-row primary query produce three SQL round trips total (one primary + two preload), not 2001.

## Best Practices

1. **Always eager-load.** `.With(...)` prevents N+1 queries on lists.
2. **Index foreign keys.** Every `<x>_id` column should have a database index; add it in the migration.
3. **Match key types.** Foreign and local key columns must be comparable (both `bigint`, both string UUIDs, etc.). Mixed types silently return zero matches.
4. **Soft-delete propagation.** Children with `orm.SoftDeleteModel` are filtered automatically; children without it are not.
5. **Verify by loading once.** After declaring a new relation, run a `.With("X").Get()` against seed data and assert non-empty results before relying on it in handlers.

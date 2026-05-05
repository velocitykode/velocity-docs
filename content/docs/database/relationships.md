---
title: Relationships
description: Define hasOne, hasMany, and belongsTo relationships with eager loading in Velocity ORM.
weight: 30
---

Velocity ORM supports three relation types: `hasOne`, `hasMany`, and `belongsTo`. Relations are declared via a struct tag and loaded with `.With()`.

## Relationship Types

| Type | Cardinality | Tag goes on | Example |
|------|-------------|-------------|---------|
| `hasOne` | One-to-one | Parent | User has one Profile |
| `hasMany` | One-to-many | Parent | User has many Posts |
| `belongsTo` | Inverse of hasOne / hasMany | Child | Post belongs to User |

## Tag Syntax

Every relation tag uses **comma-separated** values inside a single `relation:` key:

```
orm:"relation:<type>,<foreignKey>,<localKey>"
```

- `<type>`: one of `hasOne`, `hasMany`, `belongsTo` (case-sensitive).
- `<foreignKey>`: the column on the **child** table that holds the link.
- `<localKey>`: the column on the **parent** table being referenced (almost always `id`).

All three parts are required. There are no convention-based defaults: the parser will not infer key names from the field name.

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
type Server struct {
    orm.SoftDeleteModel[Server]
    CloudProviderID uint            `orm:"column:cloud_provider_id;type:bigint;not_null"`
    CloudProvider   *cloud.Provider `orm:"relation:belongsTo,cloud_provider_id,id"`
}
```

Load:

```go
servers, err := Server{}.With("CloudProvider").Get()
for _, s := range servers {
    if s.CloudProvider != nil {
        fmt.Println(s.CloudProvider.Name)
    }
}
```

The same shape applies to any inverse relation: `Comment.Post`, `Post.User`, etc.

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

### 5. Unsupported types

The parser currently accepts only the three types above. `belongsToMany`, `morphOne`, `morphMany`, and other Eloquent-style relations are not implemented.

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

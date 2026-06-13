---
title: Collections
description: Generic, type-safe collection helpers for slices - filter, map, reduce, group, and more.
weight: 70
---

The `collect` package is a library of generic slice helpers. Every
function takes a `[]T` and returns a new slice (or scalar) - inputs
are never mutated. Two APIs are provided: free functions and a
fluent `*Collection[T]`.

Import path: `github.com/velocitykode/velocity/collect`

## Free functions

```go
import "github.com/velocitykode/velocity/collect"

users := []User{ /* ... */ }

adults := collect.Filter(users, func(u User) bool { return u.Age >= 18 })
names  := collect.Map(adults, func(u User) string { return u.Name })
total  := collect.Sum(users, func(u User) float64 { return float64(u.Spend) })
```

### Transforms

| Function          | Behavior                                                    |
| ----------------- | ----------------------------------------------------------- |
| `Filter`          | keep elements where `fn(x)` is true                         |
| `Reject`          | inverse of `Filter`                                         |
| `Map[T,R]`        | project `[]T` → `[]R`                                       |
| `FlatMap[T,R]`    | project each to `[]R`, concatenate                          |
| `Reduce[T,R]`     | fold into a single `R`                                      |
| `Pluck[T,R]`      | extract one field per element                               |
| `Reverse`         | reverse order                                               |
| `Sort` / `SortBy` / `SortByDesc` | sort (custom comparator / keyfn)             |
| `Unique` / `UniqueBy` | dedupe (by value / by keyfn)                            |
| `Chunk`           | split into equal-sized groups                               |
| `Flatten`         | `[][]T` → `[]T`                                             |
| `Take` / `Skip`   | first n / after first n                                     |
| `Shuffle`         | random order                                                |
| `Partition`       | split by predicate into `(matches, rest)`                   |
| `Zip[T,U,R]`      | combine two slices pairwise                                 |
| `Times[T]`        | build a slice of length n by calling `fn(i)`                |

### Predicates

| Function          | Behavior                                                    |
| ----------------- | ----------------------------------------------------------- |
| `Contains`        | any element matches                                         |
| `Every`           | all elements match                                          |
| `None`            | zero elements match                                         |
| `CountBy`         | count of matching elements                                  |

### Element access

`First`, `Last`, `FirstWhere` - return `(T, ok)`; `ok` is false when
nothing matched or the slice is empty.

```go
if first, ok := collect.First(users, func(u User) bool { return u.IsAdmin }); ok {
    // use first
}
```

### Aggregation

`Sum`, `Min`, `Max` - `Min` and `Max` return `(T, ok)` so they can
signal empty slices.

```go
total := collect.Sum(orders, func(o Order) float64 { return o.Total })

if mostExpensive, ok := collect.Max(orders, func(o Order) float64 { return o.Total }); ok {
    // use mostExpensive
}
```

### Grouping

```go
byRegion := collect.GroupBy(users, func(u User) string { return u.Region })
// map[string][]User

byID := collect.KeyBy(users, func(u User) int { return u.ID })
// map[int]User  (last-wins on duplicates)
```

### Set operations

`Intersect`, `Diff`, `Partition`, `Shuffle`.

```go
common := collect.Intersect(teamA, teamB)
only   := collect.Diff(teamA, teamB)
```

### Imperative helpers

- `Each` - side-effect iteration
- `Tap` - inspect the slice mid-chain (with fluent API)
- `Pop` / `Push` - immutable stack operations
- `When` - apply a transform only if a condition holds

## Fluent Collection API

`From[T]` wraps a slice so calls chain:

```go
result := collect.From(users).
    Filter(func(u User) bool { return u.Active }).
    Sort(func(a, b User) bool { return a.Name < b.Name }).
    Take(10).
    All()
```

Every method returns `*Collection[T]` so the chain reads top-to-bottom.
Terminal methods:

- `All()` - unwrap to `[]T`
- `Count()`, `IsEmpty()`, `IsNotEmpty()`
- `First`, `Last`, `FirstWhere` - return `(T, ok)`
- `Contains`, `Every`, `None`
- `Chunk(n)` - returns `[][]T` (ends the chain)
- `Pop` - returns `(*Collection[T], T, ok)`

## Design notes

- **Immutable by default.** `Filter`, `Sort`, `Reverse`, etc. return new
  slices - they never mutate their argument.
- **Generic over comparable / ordered where needed.** `Unique` and
  `Intersect` require `T comparable`; `SortBy` requires
  `cmp.Ordered` on the key.
- **No lazy evaluation.** Each function materializes its result.
  For huge streams use iterators from `iter` (stdlib) or channels -
  `collect` is for in-memory collections.

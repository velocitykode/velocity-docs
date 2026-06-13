---
title: Vector Search
description: Run pgvector similarity search through Velocity's ORM, and use the velocity-ai document store for a batteries-included embed-and-search pipeline.
weight: 55
---

Velocity's ORM has first-class [pgvector](https://github.com/pgvector/pgvector) support: a dedicated `orm.Vector` column type and nearest-neighbour query methods that compile to native pgvector distance operators. On top of those primitives, the separate `velocity-ai` module ships a document store that pairs the search query with an embedding provider.

This page covers both layers:

1. The **core ORM** vector primitives (`orm.Vector`, distance metrics, and the query methods).
2. The **velocity-ai** `vector.Store`, which adds the `documents` model, its migration, and the embed-then-search pipeline.

{{% callout type="info" %}}
Vector search is **PostgreSQL only**. pgvector is a Postgres extension, so both the migration and the search query require a Postgres-backed ORM connection. On any other driver the migration fails closed and the query returns a clear `driver does not support vector search` error rather than emitting SQL the dialect cannot run.
{{% /callout %}}

## Core ORM primitives

These live in the `github.com/velocitykode/velocity/orm` package; no AI module is required.

### The `orm.Vector` type

`orm.Vector` is a dense `float32` embedding stored in a pgvector column:

```go
// github.com/velocitykode/velocity/orm
type Vector []float32
```

It implements `driver.Valuer` and `sql.Scanner`, so it round-trips through the ORM with no special-casing: on write it renders the pgvector text literal `[1,2,3]` (bound as a normal parameter), and on read it parses that same literal back. A `nil` Vector maps to SQL `NULL`.

Declare a model field as `orm.Vector` and tag the column type so the migration emits a `vector(N)` column:

```go
import "github.com/velocitykode/velocity/orm"

type Document struct {
    orm.Model[Document]
    Content   string     `orm:"column:content"`
    Embedding orm.Vector `orm:"column:embedding;type:vector(1536)"`
}
```

### Distance metrics

The metric is named by the `orm.DistanceMetric` string type. The concrete SQL operator is resolved by the driver's vector grammar:

```go
const (
    DistanceL2           DistanceMetric = "l2"            // Euclidean (L2): pgvector <->
    DistanceCosine       DistanceMetric = "cosine"        // cosine distance: pgvector <=>
    DistanceInnerProduct DistanceMetric = "inner_product" // negative inner product: pgvector <#>
    DistanceL1           DistanceMetric = "l1"            // taxicab (L1): pgvector <+> (pgvector 0.7+)
)
```

### Query methods

The vector helpers are available on `Model[T]{}` (and the UUID / soft-delete model variants) and on the `*Query[T]` chain:

```go
// Order the result set by vector distance, nearest first.
func (Model[T]) OrderByDistance(column string, vec Vector, metric DistanceMetric) *Query[T]

// Sugar for OrderByDistance(...).Limit(k): the k nearest rows.
func (Model[T]) NearestNeighbors(column string, vec Vector, metric DistanceMetric, k int) *Query[T]

// Add the distance to the projection under alias, so the score can be scanned.
func (Model[T]) SelectDistance(column string, vec Vector, metric DistanceMetric, alias string) *Query[T]
```

{{< tabs items="Nearest neighbours,Ordered with score,Order only" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/orm"

// The 10 documents closest to queryVec under cosine distance, nearest first.
docs, err := orm.Model[Document]{}.
    NearestNeighbors("embedding", queryVec, orm.DistanceCosine, 10).
    Get(ctx)
```
{{< /tab >}}

{{< tab >}}
```go
// SelectDistance projects the computed distance as a column so it can be
// scanned into a model field whose column matches the alias (e.g. a
// `Distance float64` field for alias "distance"). It does not order results,
// so combine it with OrderByDistance for a ranked search with a returned score.
type ScoredDocument struct {
    orm.Model[ScoredDocument]
    Content   string     `orm:"column:content"`
    Embedding orm.Vector `orm:"column:embedding;type:vector(1536)"`
    Distance  float64    `orm:"column:distance"`
}

docs, err := orm.Model[ScoredDocument]{}.
    SelectDistance("embedding", queryVec, orm.DistanceCosine, "distance").
    OrderByDistance("embedding", queryVec, orm.DistanceCosine).
    Limit(10).
    Get(ctx)
```
{{< /tab >}}

{{< tab >}}
```go
// OrderByDistance evaluates the distance in ORDER BY only; it is not added to
// the projection. Use it directly when you only need ranking, not the score.
docs, err := orm.Model[Document]{}.
    OrderByDistance("embedding", queryVec, orm.DistanceL2).
    Limit(5).
    Get(ctx)
```
{{< /tab >}}

{{< /tabs >}}

The query vector is always bound as a parameter, never interpolated into SQL. See the {{< relref "queries" >}} page for the rest of the query builder, and {{< relref "migrations" >}} for the schema builder used below.

### Declaring a vector column in a migration

The migration schema builder declares vector columns and indexes. All three helpers are Postgres-only and return a clear error on any other driver:

```go
import "github.com/velocitykode/velocity/orm/migrate"

func init() {
    migrate.Register(&migrate.Migration{
        Version:     "20260101000000",
        Description: "create documents table with a pgvector embedding column",
        Up: func(m *migrate.Migrator) error {
            // CREATE EXTENSION IF NOT EXISTS vector
            if err := m.CreateVectorExtension(); err != nil {
                return err
            }
            if err := m.CreateTable("documents", func(t *migrate.TableBuilder) {
                t.ID()
                t.Text("content")
                t.Vector("embedding", 1536) // vector(1536)
                t.Timestamps()
            }); err != nil {
                return err
            }
            // CREATE INDEX ... USING hnsw ("embedding" vector_cosine_ops)
            return m.VectorIndex("documents", "embedding", "hnsw", "vector_cosine_ops")
        },
        Down: func(m *migrate.Migrator) error {
            return m.DropTable("documents")
        },
    })
}
```

`TableBuilder.Vector(name, dimensions)` emits a `vector(N)` column (dimension validated 1..16000, the pgvector limit). `Migrator.VectorIndex(table, column, method, opClass)` builds an approximate-nearest-neighbour index where `method` is the access method (`hnsw` or `ivfflat`) and `opClass` is the operator class matching your metric (`vector_cosine_ops`, `vector_l2_ops`, `vector_ip_ops`, ...). The index name is auto-generated as `idx_<table>_<column>_<method>`.

## The velocity-ai document store

The `velocity-ai` module is a separate Go module that builds on the ORM primitives above. Its `vector` package ships a ready-made `documents` model, the migration that provisions it, and a `Store` whose `Search` runs the nearest-neighbour query for you.

```bash
go get github.com/velocitykode/velocity-ai
```

### The `Document` model

```go
// github.com/velocitykode/velocity-ai/vector
type Document struct {
    orm.Model[Document]
    Content   string     `orm:"column:content" json:"content"`
    Embedding orm.Vector `orm:"column:embedding;type:vector(1536)" json:"embedding,omitempty"`
}

func (Document) TableName() string { return "documents" }
func (Document) Fillable() []string { return []string{"content", "embedding"} }
```

The embedding width is fixed by the exported constant `vector.EmbeddingDimensions` (`1536`), and the searched column name by `vector.EmbeddingColumn` (`"embedding"`). These are the single source of truth shared by the model, the migration, and any caller producing query vectors; a query vector of a different length is rejected by Postgres at query time.

### Provisioning the table

The migration is registered by importing the `vector/migrations` package for its side effects. It installs the pgvector extension, declares the `vector(1536)` column, and builds an HNSW cosine index:

```go
import (
    _ "github.com/velocitykode/velocity-ai/vector/migrations" // provisions `documents`
    "github.com/velocitykode/velocity-ai/vector"
)
```

### Searching

`NewStore` returns a `Store` bound to the package-default ORM connection (set via `orm.SetDefault`, which must be Postgres-backed). `Search` returns the `k` documents closest to `queryVec` under the given metric, nearest first:

```go
// github.com/velocitykode/velocity-ai/vector
func NewStore() *Store

func (s *Store) Search(ctx context.Context, queryVec orm.Vector, k int, metric orm.DistanceMetric) ([]Result, error)
```

Each match is a `Result`: the matched `Document` plus its 1-based rank in the nearest-first ordering.

```go
type Result struct {
    Document Document
    Rank     int // 1 == nearest neighbour
}
```

```go
import (
    "github.com/velocitykode/velocity-ai/vector"
    "github.com/velocitykode/velocity/orm"
)

// orm.SetDefault(pgManager) must have been called during boot.
hits, err := vector.NewStore().Search(ctx, queryVec, 10, orm.DistanceCosine)
if err != nil {
    return err
}
for _, hit := range hits {
    fmt.Printf("#%d (rank): %s\n", hit.Rank, hit.Document.Content)
}
```

`Search` is built purely from ORM methods (`NearestNeighbors` then `Get`); it never hand-builds SQL or interpolates the query vector. On a non-vector driver it surfaces the same `does not support vector search` error from the ORM, and the query is never issued.

### Producing the query vector with embeddings

`Search` takes a query vector you supply; the embeddings themselves come from the velocity-ai `Manager`. Resolve the Manager from the Velocity service container, then drive the fluent embedding builder:

```go
import (
    "github.com/velocitykode/velocity-ai/manager"
    "github.com/velocitykode/velocity-ai/vector"
    "github.com/velocitykode/velocity/app"
    "github.com/velocitykode/velocity/orm"
)

func semanticSearch(ctx context.Context, s *app.Services, query string) ([]vector.Result, error) {
    m := manager.FromServices(s) // *manager.Manager, nil if AI provider not registered

    // Embeddings(...).For(...).Generate(ctx) returns *provider.EmbeddingsResponse.
    resp, err := m.Embeddings().For(query).Generate(ctx)
    if err != nil {
        return nil, err
    }

    // EmbeddingsResponse.Embeddings is [][]float64; convert the first row to
    // orm.Vector ([]float32) for the search.
    raw := resp.Embeddings[0]
    queryVec := make(orm.Vector, len(raw))
    for i, f := range raw {
        queryVec[i] = float32(f)
    }

    return vector.NewStore().Search(ctx, queryVec, 10, orm.DistanceCosine)
}
```

The `Manager.Embeddings(...)` entrypoint returns a `PendingEmbedding` builder. `For(inputs...)` sets the text to embed, and `Generate(ctx)` resolves the configured embedding provider (the default is selected by `DefaultEmbeddingProvider` in your AI config, e.g. the OpenAI embedding gateway) and returns a `*provider.EmbeddingsResponse`. The builder also exposes `WithProvider` / `WithProviders` (failover), `WithModel`, `WithDimensions`, and `Cached`.

{{% callout type="info" %}}
**Two layers, one pipeline.** The core ORM gives you the query primitives (`orm.Vector`, the distance metrics, and `NearestNeighbors` / `OrderByDistance` / `SelectDistance`) so you can run pgvector search against any model you own. The `velocity-ai` `vector` package gives you the batteries-included path: a ready-made `documents` model and migration, an embedding provider to turn text into vectors, and a `Store.Search` that stitches them together.
{{% /callout %}}

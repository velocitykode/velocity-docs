---
title: Pipeline
description: Generic, type-safe middleware-style pipeline for threading values through sequential stages.
weight: 75
---

The `pipeline` package is a generic "chain of responsibility". A value
passes through a series of stages; each stage can inspect, transform,
short-circuit, or forward the value to the next.

Import path: `github.com/velocitykode/velocity/pipeline`

## Stages

```go
type Stage[T any] interface {
    Handle(passable T, next func(T) error) error
}
```

Any struct implementing `Handle` is a stage. For one-off stages the
`Pipe[T]` adapter turns a function into a `Stage[T]`:

```go
trim := pipeline.Pipe[*Request](func(r *Request, next func(*Request) error) error {
    r.Body = strings.TrimSpace(r.Body)
    return next(r)
})
```

## Building and running

```go
result := pipeline.New[*Request]().
    Send(req).
    Through(trim, validate, authorize).
    Then(func(r *Request) error {
        return handle(r)
    })
```

- `Send(v)` - set the value passing through
- `Through(stages...)` - replace the stage list
- `Add(stages...)` - append to the stage list
- `Then(final)` - run the pipeline ending at `final`
- `ThenReturn()` - run the pipeline with a no-op terminal; use when all
  work happens inside stages

## Pre-compiling

`Build` compiles the stage chain once and returns a callable you can
invoke many times - useful when a pipeline is shared across requests:

```go
chain := pipeline.New[*Request]().
    Through(trim, validate, authorize).
    Build(handle)

// Later:
err := chain(req)
```

## Short-circuiting

A stage that does not call `next(passable)` stops the chain. Return
`nil` or an error to indicate why:

```go
cacheStage := pipeline.Pipe[*Request](func(r *Request, next func(*Request) error) error {
    if cached, ok := cache.Get(r.Key); ok {
        r.Result = cached
        return nil  // skip remaining stages
    }
    return next(r)
})
```

## Mutating the passable

Pipelines pass by whatever semantics `T` has - pointers propagate
mutations, values don't. The examples above use `*Request` so stages
can mutate in place.

## Where it's used in Velocity

The `bus` package uses `pipeline.Stage[bus.Command]` for command
middleware. You can use it directly anywhere you want to compose
sequential processing steps with short-circuit semantics.

## Concurrency

`Pipeline` is not safe for concurrent use during construction. Build
the pipeline (or call `Build`) on a single goroutine; the resulting
chain can be invoked from many goroutines provided the stages
themselves are safe.

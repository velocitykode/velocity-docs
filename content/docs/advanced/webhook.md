---
title: Webhooks
description: Primitives for signing, verifying, and retrying webhook deliveries.
weight: 75
---

The `webhook` package ships three composable primitives for outbound and
inbound webhook plumbing: a `Signer` that produces a Stripe-style header,
a `Verifier` that validates the same header in constant time, and a
`RetryPolicy` for exponential backoff with jitter. The package is a leaf
that depends only on the Go standard library, so you can compose it with
your own queue, transport, or HTTP client of choice.

Import path: `github.com/velocitykode/velocity/webhook`

{{< callout type="info" title="Primitives only" >}}
This package intentionally ships no delivery service, admin UI, or job
runner. Pair `Signer` with [`httpclient`](/docs/advanced/httpclient/) for
outbound delivery and [`queue`](/docs/advanced/queue/) for durable
retries.
{{< /callout >}}

## Decision matrix

| Situation | Helper |
|---|---|
| Sign an outbound payload | `NewSigner(secret).Header(payload)` |
| Verify an incoming payload | `NewVerifier(secret).Verify(payload, header)` |
| Reject replays of a previously verified payload | Set `Verifier.Nonces` to a `NonceStore` |
| Opt out of timestamp freshness checks | Set `Verifier.DisableTimestampCheck = true` |
| Schedule the next retry attempt | `DefaultRetryPolicy.Next(attempt)` |
| Plug in a non-default MAC primitive | Implement `Algorithm` and assign it to `Signer.Algorithm` / `Verifier.Algorithm` |

## Signer

`Signer` produces a signature header value over a payload using a
pluggable `Algorithm` and a shared `Secret`. The default algorithm is
`HMACSHA256`; supply your own implementation of the `Algorithm`
interface to swap in a different MAC.

```go
type Algorithm interface {
    Name() string
    Sign(secret, payload []byte) []byte
}
```

Construct a signer with `NewSigner(secret []byte) *Signer`, which
preconfigures `HMACSHA256`. The struct fields are exported so tests can
override the time source via `Now func() time.Time`.

```go
s := webhook.NewSigner([]byte(os.Getenv("WEBHOOK_SECRET")))

header, err := s.Header(payload)
if err != nil {
    return err
}
// header == "t=1714972800,v1=4f3c...e9"
req.Header.Set("X-Signature", header)
```

`Header` returns a fully-formed `t=<unix>,v1=<hex>` value. The format
mirrors Stripe's webhook signature scheme: the timestamp is part of the
signed material, so a verifier can reject stale or replayed deliveries
without trusting the header alone.

If you need the raw parts:

```go
sig, ts, err := s.Sign(payload)
// sig is hex-encoded HMAC, ts is the unix-second timestamp string
```

`Sign` returns `ErrNoAlgorithm` if `Algorithm` is nil and
`ErrMissingSecret` if `Secret` is empty.

{{< callout type="tip" title="Why framed signing matters" >}}
The MAC is computed over `<timestamp>.<payload>`, not over `payload`
alone. Without that framing, an attacker who captures a valid header
could swap the visible `t=` value for a fresh one and the MAC would
still verify. Framing binds the timestamp into the signed bytes so the
verifier rejects any tampered timestamp.
{{< /callout >}}

## Verifier

`Verifier` parses a header, recomputes the MAC over the same framed
payload, and compares in constant time using `crypto/subtle`. A
`Tolerance` window rejects timestamps that are too far behind or ahead
of the current clock.

`NewVerifier` sets `Algorithm` to `HMACSHA256` and `Tolerance` to its
default of 5 minutes. A zero-value `Verifier` literal must set
`Algorithm` explicitly - defaults are not auto-applied on the bare
struct.

```go
v := webhook.NewVerifier([]byte(os.Getenv("WEBHOOK_SECRET")))
// Tolerance defaults to 5 minutes

if err := v.Verify(payload, r.Header.Get("X-Signature")); err != nil {
    http.Error(w, "invalid signature", http.StatusUnauthorized)
    return
}
```

Use `VerifyContext(ctx, payload, header)` when the underlying
`NonceStore` should observe request cancellation.

`Verify` returns one of the following sentinel errors:

| Error | Meaning |
|---|---|
| `ErrMalformedHeader` | Header is missing, has wrong format, or contains a non-numeric timestamp / non-hex signature. |
| `ErrMissingSecret` | `Verifier.Secret` is nil or empty. |
| `ErrNoAlgorithm` | `Verifier.Algorithm` is nil. |
| `ErrTimestampOutOfTolerance` | `|now - signedAt| > Tolerance`. |
| `ErrSignatureMismatch` | Recomputed MAC does not match the supplied signature. |
| `ErrReplay` | A `NonceStore` is configured and the nonce was already observed. |

Leaving `Tolerance` at its zero value does **not** disable the timestamp
check - zero is treated as the 5-minute default so a zero-value
`Verifier` still rejects stale signatures. To skip freshness validation
entirely, set `DisableTimestampCheck = true`:

```go
v := webhook.NewVerifier(secret)
v.DisableTimestampCheck = true // a correctly signed payload verifies forever
```

{{< callout type="warning" title="DisableTimestampCheck removes the replay window" >}}
With `DisableTimestampCheck` set, any captured delivery can be re-sent
indefinitely unless you also configure a `NonceStore` in `Nonces`. Even
then the nonce TTL is finite, so a replay arriving after the nonce
expires is accepted again. Only opt out when an upstream provider cannot
produce timestamps and replay is mitigated elsewhere.
{{< /callout >}}

{{< callout type="warning" title="Never echo the header" >}}
The errors above are deliberately opaque: they never embed the payload,
secret, or computed MAC. Log the error value, return a generic 401 to
the remote peer, and resist the urge to surface the exact failure
reason in the response body.
{{< /callout >}}

## NonceStore

When `Verifier.Nonces` is non-nil, the hex signature itself is used as
the nonce and a successful verification additionally records that nonce
so a second delivery of the same signed payload returns `ErrReplay`.
The TTL written to the store equals `Verifier.Tolerance` (or 5 minutes
when `Tolerance` is zero), so expired signatures cannot be replayed
indefinitely.

```go
type NonceStore interface {
    CheckAndMark(ctx context.Context, nonce string, ttl time.Duration) (alreadySeen bool, err error)
}
```

`CheckAndMark` is a single atomic operation. A naive `Seen(nonce)`
followed by `Mark(nonce)` allows two concurrent verifications of the
same payload to both observe `alreadySeen=false` and both succeed; the
single-call shape eliminates that TOCTOU window by construction.

### Memory driver

Import path: `github.com/velocitykode/velocity/webhook/drivers/nonce`

```go
import nonceMem "github.com/velocitykode/velocity/webhook/drivers/nonce"

store := nonceMem.NewMemory(1 * time.Minute) // sweep interval
defer store.Close(context.Background())

v := webhook.NewVerifier(secret)
v.Nonces = store
```

The memory driver is appropriate for development, single-process
deployments, and tests. It is backed by a `sync.RWMutex`-protected map
with two expiry mechanisms working together:

- **Lazy expiry on read.** `CheckAndMark` checks the stored expiry
  before deciding whether the nonce is still live; an expired entry is
  treated as absent and overwritten with a fresh TTL.
- **Background sweep.** A goroutine scoped to the sweep interval scans
  the map and deletes entries whose expiry has passed. Pass a
  non-positive interval to `NewMemory` to disable the sweep entirely
  (entries still expire on read but stale records accumulate until
  process restart).

The sweep loop wraps each tick in a deferred `recover` so a transient
panic in one iteration never silently disables nonce expiry for the
lifetime of the process. Install an observer with
`store.SetOnPanic(fn func(any))` to surface those recovered panics
through your logger or metrics pipeline.

`store.Len()` reports the current map size (including not-yet-swept
expired entries) and is primarily useful for tests.

{{< callout type="warning" title="Multi-process deployments" >}}
The memory driver is process-local. Replicas behind a load balancer
each maintain their own nonce set, so the same payload delivered to two
replicas would verify on both. Ship a Redis or database-backed driver
implementing `webhook.NonceStore` for replay protection across
processes.
{{< /callout >}}

## RetryPolicy

`RetryPolicy` describes an exponential-backoff schedule with bounded
uniform jitter and a hard attempt cap. The schedule for attempt `N`
(0-indexed) is:

```
delay = min(BaseDelay * Factor^attempt, Cap)
delay = delay + uniform(-Jitter*delay, +Jitter*delay)
```

```go
type RetryPolicy struct {
    BaseDelay   time.Duration
    Factor      float64
    MaxAttempts int
    Jitter      float64
    Cap         time.Duration
}
```

`DefaultRetryPolicy` is a sensible starting point: 1s base, factor 2,
8 attempts max, 20% jitter, capped at 5 minutes.

```go
p := webhook.DefaultRetryPolicy

for attempt := 0; ; attempt++ {
    err := deliver(ctx, payload)
    if err == nil {
        return nil
    }
    delay, ok := p.Next(attempt)
    if !ok {
        // Out of attempts; route to dead-letter sink.
        return err
    }
    select {
    case <-time.After(delay):
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

`Next(attempt int) (time.Duration, bool)` returns `(0, false)` once
`attempt >= MaxAttempts`. Treat the second return as "stop retrying"
and route the work to a dead-letter sink of your choice.

Field semantics:

- `Factor <= 1` disables growth: every retry happens at `BaseDelay`,
  still subject to jitter and `Cap`.
- `Jitter` is clamped to `[0, 1]`. A value of `0.2` yields a delay
  uniformly distributed in `[0.8*delay, 1.2*delay]`.
- `Cap == 0` disables the upper bound on the exponential delay.
- Negative `attempt` is treated as `0`; negative `BaseDelay` is treated
  as `0`.

Jitter is sampled from `math/rand/v2`'s package-level generator
(ChaCha8-backed, seeded from OS entropy at package init). Jitter is
not security-critical but the source is non-predictable enough to keep
synchronized retry storms from forming across replicas.

## Recipe: sign and send an outbound webhook

**When:** your service publishes an event to a customer-supplied URL
and you want their handler to be able to authenticate the call.

```go
import (
    "bytes"
    "context"
    "encoding/json"
    "net/http"
    "time"

    "github.com/velocitykode/velocity/httpclient"
    "github.com/velocitykode/velocity/webhook"
)

func deliver(ctx context.Context, c *httpclient.Client, url string, secret []byte, event any) error {
    payload, err := json.Marshal(event)
    if err != nil {
        return err
    }

    s := webhook.NewSigner(secret)
    header, err := s.Header(payload)
    if err != nil {
        return err
    }

    req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
    if err != nil {
        return err
    }
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Webhook-Signature", header)

    p := webhook.DefaultRetryPolicy
    for attempt := 0; ; attempt++ {
        resp, err := c.Do(ctx, req)
        if err == nil && resp.StatusCode < 500 {
            resp.Body.Close()
            return nil
        }
        if resp != nil {
            resp.Body.Close()
        }
        delay, ok := p.Next(attempt)
        if !ok {
            return err
        }
        select {
        case <-time.After(delay):
        case <-ctx.Done():
            return ctx.Err()
        }
    }
}
```

**Why this shape:** the signer produces the header once per payload,
not once per retry, so identical bytes hit the wire on every attempt
and the receiver's idempotency keys work as intended. The retry policy
treats only 5xx responses (and transport errors) as retryable.

## Recipe: verify an incoming webhook with replay protection

**When:** you receive webhooks from an upstream provider and want to
reject both forged signatures and replays.

```go
import (
    "context"
    "errors"
    "io"
    "net/http"
    "time"

    "github.com/velocitykode/velocity/webhook"
    nonceMem "github.com/velocitykode/velocity/webhook/drivers/nonce"
)

var (
    secret = []byte("...")
    store  = nonceMem.NewMemory(1 * time.Minute)
)

func handle(w http.ResponseWriter, r *http.Request) {
    payload, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "read", http.StatusBadRequest)
        return
    }
    defer r.Body.Close()

    v := webhook.NewVerifier(secret)
    v.Tolerance = 5 * time.Minute
    v.Nonces = store

    err = v.VerifyContext(r.Context(), payload, r.Header.Get("X-Webhook-Signature"))
    switch {
    case errors.Is(err, webhook.ErrReplay):
        // Already processed; ack idempotently rather than 401.
        w.WriteHeader(http.StatusOK)
        return
    case err != nil:
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    // Process the verified payload...
    w.WriteHeader(http.StatusOK)
}
```

**Why this shape:** reading the raw body before parsing is essential -
the signature is over those exact bytes. The `ErrReplay` branch returns
200 instead of 401 because a duplicate is the upstream's retry doing
its job, not an attack.

## Related

- [HTTP Client](/docs/advanced/httpclient/) - instrumented outbound
  client; pair with `Signer` for signed deliveries.
- [Queue System](/docs/advanced/queue/) - durable background workers;
  enqueue webhook deliveries so retries survive restarts.
- [Events](/docs/advanced/events/) - in-process pub/sub; a typical
  trigger for outbound webhook fan-out.

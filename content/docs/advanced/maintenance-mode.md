---
title: Maintenance Mode
description: Take an application offline for deploys and migrations with vel down and vel up, keep health probes and webhooks reachable, and let operators bypass the 503 with a secret.
weight: 110
keywords: [maintenance mode, vel down, vel up, 503, bypass secret]
---

Maintenance mode makes the application answer every request with a `503`
JSON body while you deploy, migrate, or repair, without stopping the
process. It is a marker file that the CLI writes and a middleware that
reads it.

## Enable it

```bash
vel down [--secret TOKEN] [--retry N]
```

| Flag       | Default | Description                                            |
| ---------- | ------- | ------------------------------------------------------ |
| `--secret` | (none)  | Bypass token for operators. See [Bypassing](#bypassing-maintenance-mode) |
| `--retry`  | (none)  | Recorded as `retry_after` in the maintenance marker     |

```bash
vel down --secret "abc123" --retry 60
```

The command writes a `.vel/down` marker file holding the secret, the
retry value, and a UTC timestamp. Both the file (`0600`) and its
directory (`0700`) are owner-only because the marker carries the bypass
secret. The location is resolved independently of the current working
directory and can be moved with `VELOCITY_MAINTENANCE_ROOT`, so the
writer and the runtime middleware always agree on one path.

## Disable it

```bash
vel up
```

Removes the marker file. Takes no arguments. A missing marker is not an
error.

## The middleware

The starter kits install the gate in the global stack, so `vel down`
works out of the box:

```go
func Middleware(m *velocity.MiddlewareStack) {
    m.Global(
        velocity.PreventRequestsDuringMaintenance(),
        // ...
    )
}
```

While the marker exists, every request gets:

```json
{"message": "Service Unavailable"}
```

with status `503`. Requests keep flowing to the next handler when:

- the path is excluded (see below), or
- the request carries a valid bypass cookie.

The marker is read on every request, so `vel down` and `vel up` take
effect immediately with no restart.

## Excluded paths

`/healthz`, `/livez`, and `/readyz` bypass maintenance by default so a
load balancer does not pull the instance out of rotation. Matching is by
path prefix on a segment boundary: `/healthz` covers `/healthz/anything`
but not `/healthzoo`.

Webhook endpoints are not excluded by default because their paths vary
per application. Add your own either in code or through the environment:

```go
velocity.PreventRequestsDuringMaintenance(
    velocity.WithMaintenanceExcludePaths("/webhooks/stripe", "/hooks/github"),
)
```

```env
VELOCITY_MAINTENANCE_EXCLUDE_PATHS=/webhooks/stripe,/hooks/github
```

Both add to the defaults; each path is added once.

## Bypassing maintenance mode

When `vel down` was given a `--secret`, an operator can exempt their own
browser for 12 hours. Send the secret once in the `X-Maintenance-Bypass`
header, or visit `/<secret>`. The middleware mints a signed
`velocity_maintenance_bypass` cookie and redirects to `/`; subsequent
requests with that cookie pass through.

{{< callout type="tip" >}}
Prefer the `X-Maintenance-Bypass` header over the `/<secret>` path: a
secret in the URL leaks into access logs, proxy logs, `Referer` headers,
and browser history. If you did use the path, bring the app up and down
again with a fresh secret afterwards.
{{< /callout >}}

The cookie's signature is keyed from the operator secret through HKDF, so
a leaked `APP_KEY` alone cannot forge a bypass. Secret comparison is
constant-time.

## Scheduled tasks during maintenance

Scheduled tasks pause while the app is down unless marked
`EvenInMaintenanceMode()`. See
[Scheduler]({{< relref "scheduler#maintenance-mode" >}}).

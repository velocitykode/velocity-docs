---
title: Notifications
description: Send notifications across mail, database, broadcast, and Slack from a single definition.
weight: 55
---

The `notification` package lets you define a single notification and
deliver it over any combination of channels - mail, database,
broadcast (WebSocket), Slack. You write `ToMail`, `ToDatabase`,
`ToBroadcast`, `ToSlack` as needed; the manager dispatches to the
right channel driver.

Import path: `github.com/velocitykode/velocity/notification`

## Core interfaces

```go
type Notification interface {
    Via(notifiable any) []string  // channel names, e.g. "mail", "database"
}

type Notifiable interface {
    NotificationRoute(channel string) string  // address for this channel
}

type Channel interface {
    Send(ctx context.Context, notifiable any, notification Notification) error
}
```

A **notification** declares which channels it targets. A **notifiable**
(usually your `User` model) tells each channel where to deliver. A
**channel** performs the actual delivery.

## Defining a notification

```go
type OrderShipped struct {
    OrderID  int
    Carrier  string
    TrackURL string
}

func (n *OrderShipped) Via(_ any) []string {
    return []string{"mail", "database"}
}

func (n *OrderShipped) ToMail(_ any) *notification.MailMessage {
    return notification.NewMailMessage().
        Subject("Your order has shipped").
        Greeting("Hi there!").
        Line("Your order is on its way.").
        Action("Track your package", n.TrackURL).
        Line(fmt.Sprintf("Carrier: %s", n.Carrier)).
        Outro("Thanks for shopping with us.")
}

func (n *OrderShipped) ToDatabase(_ any) *notification.DatabaseMessage {
    return notification.NewDatabaseMessage("orders.shipped").
        Set("order_id", n.OrderID).
        Set("carrier", n.Carrier).
        Set("track_url", n.TrackURL)
}
```

## Defining a notifiable

A notifiable is anything that implements `Notifiable.NotificationRoute(channel string) string`. The channel driver calls this once per send to learn where to deliver. Each built-in channel interprets the returned string differently:

| Channel | What `NotificationRoute` should return | Used by |
|---|---|---|
| `"mail"` | RFC 5322 email address | `MailChannel` falls back to this when `MailMessage.To()` is empty |
| `"database"` | Stable identifier (string) for the row's `notifiable_id` column | `DatabaseChannel` writes this verbatim into `notifications.notifiable_id` |
| `"broadcast"` | A user identifier; the channel prefixes it with `private-` (e.g. `42` becomes `private-42`) when `BroadcastMessage.On(...)` is empty | `BroadcastChannel` |
| `"slack"` | A full Slack incoming-webhook URL | `SlackChannel` POSTs the rendered payload here; URLs that resolve to private/internal addresses are rejected |
| custom | Whatever your channel needs (push token, phone number, etc.) | Your channel implementation |

Return `""` for any channel the notifiable does not support. Channels differ in how they treat an empty route: the Slack channel returns a "no Slack webhook URL for notifiable" error, while the mail, database, and broadcast channels do not error - mail sends with no recipient, database stores an empty `notifiable_id`, and broadcast skips delivery and returns nil. Only list a channel in `Via()` when the notifiable can route it.

```go
type User struct {
    ID              int
    Email           string
    SlackWebhookURL string
}

func (u *User) NotificationRoute(channel string) string {
    switch channel {
    case "mail":
        return u.Email
    case "database":
        return strconv.Itoa(u.ID)
    case "broadcast":
        return strconv.Itoa(u.ID)
    case "slack":
        return u.SlackWebhookURL
    }
    return ""
}
```

The same notifiable can serve every channel; `Via()` decides which routes are actually consulted on a given send.

## Sending

The manager fans out to each channel in `Via()`:

```go
mgr := notification.NewManager()

err := mgr.Send(ctx, user, &OrderShipped{
    OrderID:  42,
    Carrier:  "UPS",
    TrackURL: "https://ups.com/track/42",
})
```

Send to many recipients at once:

```go
mgr.SendMany(ctx, []any{user1, user2, user3}, notif)
```

`SendMany` accumulates errors - one failed recipient doesn't prevent
the others from receiving the notification.

## Recipe: Send the same notification on mail, slack, and database

**When:** A single domain event (a new signup, a paid invoice, a shipped order) needs to land in the user's inbox, post to a team Slack channel, and persist to the in-app inbox at the same time, without writing the dispatch logic three times.

**Code:**
```go
type SignupReceived struct {
    User *User
}

func (n *SignupReceived) Via(_ any) []string {
    return []string{"mail", "slack", "database"}
}

func (n *SignupReceived) ToMail(_ any) *notification.MailMessage {
    return notification.NewMailMessage().
        Subject("Welcome to Acme").
        Greeting("Hi " + n.User.Name).
        Line("Thanks for signing up.").
        Action("Open dashboard", "https://acme.app/dashboard")
}

func (n *SignupReceived) ToSlack(_ any) *notification.SlackMessage {
    return notification.NewSlackMessage().
        Content("New signup: " + n.User.Email).
        AsUser("Signups Bot").
        WithIcon(":wave:")
}

func (n *SignupReceived) ToDatabase(_ any) *notification.DatabaseMessage {
    return notification.NewDatabaseMessage("signup.received").
        Set("user_id", n.User.ID).
        Set("email", n.User.Email)
}

// elsewhere
mgr.Send(ctx, n.User, &SignupReceived{User: n.User})
```

**Why this shape:** `Via()` is the routing decision and lives on the notification, not the notifiable, because the same `User` can receive different notifications over different channel sets. The manager iterates `Via()` in order and calls each channel's `Send`; one channel failing returns an error but does not short-circuit the remaining channels, so a flaky Slack webhook will not block the database row from being written. Each `To*` method must match the channel listed in `Via()`, since channels assert the notification implements their channel-specific interface (e.g. `SlackChannel` requires `SlackNotification`) and return an error otherwise. Routes for each channel come from the notifiable's `NotificationRoute(channel)`; for the recipe above, `User.NotificationRoute("slack")` must return a webhook URL and `NotificationRoute("database")` must return a stable id.

**See also:** [`mail`](/docs/advanced/mail/), [`broadcast`](/docs/realtime/broadcast/), [`events`](/docs/advanced/events/) (listen to `notification.sent` / `notification.failed`).

## Channels

The package ships four built-in channels, each in its own sub-package.
Blank-import `notification/standard` to register all of them at once
via their `init()` side effects:

```go
import _ "github.com/velocitykode/velocity/notification/standard"
```

This pulls in mail, database, broadcast, and slack.

Or cherry-pick by blank-importing only the channel packages you want.
Each channel's `init()` calls `notification.Drivers().Register(...)`
exactly once. Registering the same name twice panics, so import each
channel package only once.

```go
import (
    _ "github.com/velocitykode/velocity/notification/mail"
    _ "github.com/velocitykode/velocity/notification/database"
)
```

After registration, `mgr.Channel("mail")` lazily instantiates the
driver and returns it; the manager uses this internally when a
notification lists `"mail"` in `Via()`. Use `mgr.SetChannel(name, ch)`
to inject a pre-configured channel instance (e.g. a `*mail.MailChannel`
with `SetMailer(...)` already called). `notification.RegisteredChannels()`
returns the names of all registered drivers.

### Mail channel

Notifications implementing `MailNotification` (have a `ToMail` method)
build a `*MailMessage` and send it through the `mail` package.

Message builder covers the common shape - greeting, body lines,
call-to-action button, outro - plus full HTML/text body override when
you need custom templates:

```go
return notification.NewMailMessage().
    From("no-reply@example.com", "Example").
    To(user.Email).
    Subject("Welcome").
    Greeting("Hi "+user.Name).
    Line("Thanks for signing up.").
    Action("Get started", "https://example.com/onboard").
    Outro("Need help? Reply to this email.")
```

For complete control:

```go
return notification.NewMailMessage().
    To(user.Email).
    Subject("Receipt").
    HTMLBody(renderedHTML).
    TextBody(plainText).
    AttachData(pdfBytes, "receipt.pdf", "application/pdf")
```

### Database channel

Stores the notification as a row in a `notifications` table (or
whichever table your store implements). Use this for in-app
notification inboxes.

```go
return notification.NewDatabaseMessage("billing.invoice.paid").
    Set("invoice_id", inv.ID).
    Set("amount", inv.Total)
```

The `Type` field is a logical name; `Data` is serialized as JSON.

### Broadcast channel

Delivers to real-time WebSocket subscribers via the `broadcast`
package. Set the target channels explicitly with `On(...)`. When `On(...)`
is omitted, the channel falls back to the notifiable's
`NotificationRoute("broadcast")` value and prefixes it with `private-`
(so a route of `42` broadcasts on `private-42`); pass a bare identifier
there, not an already-prefixed channel name.

```go
return notification.NewBroadcastMessage("order.shipped").
    On("private-user."+strconv.Itoa(n.UserID)).
    Set("order_id", n.OrderID).
    Set("track_url", n.TrackURL)
```

### Slack channel

Posts to a Slack webhook URL returned by the notifiable:

```go
return notification.NewSlackMessage().
    Content("New signup: "+user.Email).
    AsUser("Signups Bot").
    WithIcon(":wave:").
    Attachment(func(a *notification.SlackAttachment) {
        a.Color = "good"
        a.Title = user.Name
        a.Field("Plan", user.Plan, true)
        a.Field("Trial ends", user.TrialEnd.Format("2006-01-02"), true)
    })
```

## Events

Every send emits one of two events:

- `*notification.NotificationSent` - on successful delivery
- `*notification.NotificationFailed` - on delivery error

Wire them up via the manager:

```go
mgr.SetEventDispatcher(func(ctx context.Context, event any) error {
    return v.Events.Dispatch(ctx, event)
})
```

Useful for delivery metrics, retry workers, or audit logs.

## Custom channels

Implement the `Channel` interface and register it:

```go
type PushChannel struct { /* APNs/FCM client */ }

func (c *PushChannel) Send(ctx context.Context, notifiable any, n notification.Notification) error {
    // 1. Assert n implements your channel-specific interface (e.g. PushNotification)
    // 2. Use notifiable.(notification.Notifiable).NotificationRoute("push") for the token
    // 3. Send it
    return nil
}

func init() {
    notification.Drivers().Register("push", func(_ context.Context, _ notification.ChannelConfig) (notification.Channel, error) {
        return &PushChannel{/* ... */}, nil
    })
}
```

From then on, any notification listing `"push"` in `Via()` goes through
your channel.

## Related

- [Events](/docs/advanced/events/) - emit a domain event and let a listener fan out the notification
- [Queue](/docs/advanced/queue/) - dispatch notifications through queue jobs so request handlers stay snappy
- [Mail](/docs/advanced/mail/) - the underlying transport for the email channel

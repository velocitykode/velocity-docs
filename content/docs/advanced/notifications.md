---
title: Notifications
description: Send notifications across mail, database, broadcast, and Slack from a single definition.
weight: 55
---

The `notification` package lets you define a single notification and
deliver it over any combination of channels — mail, database,
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

```go
type User struct {
    ID    int
    Email string
}

func (u *User) NotificationRoute(channel string) string {
    switch channel {
    case "mail":
        return u.Email
    case "database":
        return strconv.Itoa(u.ID)
    case "slack":
        return u.SlackWebhookURL
    }
    return ""
}
```

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

`SendMany` accumulates errors — one failed recipient doesn't prevent
the others from receiving the notification.

## Channels

The package ships four built-in channels. Register the ones you need:

```go
import "github.com/velocitykode/velocity/notification/allchannels"

allchannels.Register()  // registers mail, database, broadcast, slack
```

Or cherry-pick:

```go
notification.RegisterChannel("mail", func() (notification.Channel, error) {
    return channels.NewMailChannel(), nil
})
```

After registration, `mgr.Channel("mail")` returns the driver; the
manager uses this internally when a notification lists `"mail"` in
`Via()`.

### Mail channel

Notifications implementing `MailNotification` (have a `ToMail` method)
build a `*MailMessage` and send it through the `mail` package.

Message builder covers the common shape — greeting, body lines,
call-to-action button, outro — plus full HTML/text body override when
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
package. The notifiable's route should be a channel name
(`"private-user.42"`, `"orders"`).

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

- `*notification.NotificationSent` — on successful delivery
- `*notification.NotificationFailed` — on delivery error

Wire them up via the manager:

```go
mgr.SetEventDispatcher(func(event any) error {
    return v.Events.Dispatch(event)
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

notification.RegisterChannel("push", func() (notification.Channel, error) {
    return &PushChannel{/* ... */}, nil
})
```

From then on, any notification listing `"push"` in `Via()` goes through
your channel.

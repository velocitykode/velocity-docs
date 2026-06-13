---
title: "Mail"
description: Send emails with Velocity's driver-based mail system supporting SMTP/sendmail, Mailgun, Postmark, and a development log driver.
weight: 40
---

Velocity provides a driver-based email system that supports multiple mail services through a unified, fluent message builder. Messages are built with `mail.NewMessage()` and delivered through a `Mailer` (the `app.Mail` configured at boot) or a `Manager` that routes to named channels.

## Quick Start

{{% callout type="info" %}}
**Configured at boot**: When you build messages and send through `app.Mail`, the mailer is constructed from your `.env` (see [Configuration](#configuration)). The driver factories are wired by blank-importing `github.com/velocitykode/velocity/mail/standard`.
{{% /callout %}}

{{< tabs items="Simple Email,HTML Email,With Attachments" >}}

{{< tab >}}
```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

func send(mailer mail.Mailer) error {
    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Welcome to Velocity").
        Body("Thanks for signing up!")

    return mailer.Send(context.Background(), msg)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

func send(mailer mail.Mailer) error {
    html := `
        <h1>Welcome to Velocity</h1>
        <p>Thanks for signing up!</p>
    `

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Welcome").
        HTMLBody(html).
        TextBody("Thanks for signing up!")

    return mailer.Send(context.Background(), msg)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "context"
    "os"

    "github.com/velocitykode/velocity/mail"
)

func send(mailer mail.Mailer) error {
    // AttachFile resolves paths against a registered attachment root.
    root, err := os.OpenRoot("/srv/app/attachments")
    if err != nil {
        return err
    }
    defer root.Close()

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Your Invoice").
        Body("Please find your invoice attached.").
        WithAttachmentRoot(root)

    // AttachFile returns (*Message, error) and breaks the fluent chain.
    if _, err := msg.AttachFile("invoice.pdf"); err != nil {
        return err
    }

    return mailer.Send(context.Background(), msg)
}
```
{{< /tab >}}

{{< /tabs >}}

{{% callout type="info" %}}
`mail.Mailer` is `app.Mail`, constructed from `mail.NewMailer(config)` during boot. It exposes a single method: `Send(ctx context.Context, msg *mail.Message) error`. There is no global `mail.Send()` and no `Message.Send()`: sending always goes through a `Mailer` (or a [`Manager`](#multiple-channels)).
{{% /callout %}}

## Configuration

Configure email sending through environment variables in your `.env` file:

### Log Driver (Development)

The log driver writes email details to the log instead of sending them - perfect for development:

```env
MAIL_DRIVER=log
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"
```

### Local SMTP Driver

Send emails via a local SMTP server or sendmail:

```env
MAIL_DRIVER=local
MAIL_HOST=localhost
MAIL_PORT=587                # Defaults to 587 when unset
MAIL_USERNAME=your-username
MAIL_PASSWORD=your-password
MAIL_ENCRYPTION=tls          # tls/ssl use implicit TLS; any other value uses STARTTLS
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"

# Or use sendmail instead of SMTP
MAIL_SENDMAIL_PATH=/usr/sbin/sendmail
```

When a username is set, `MAIL_ENCRYPTION=tls` or `ssl` opens an implicit-TLS (SMTPS) connection; any other value (or unset) dials plaintext and requires the server to advertise STARTTLS before credentials are offered. With no username, mail is sent anonymously.

### Postmark Driver

Send transactional emails via Postmark:

```env
MAIL_DRIVER=postmark
MAIL_POSTMARK_TOKEN=your-server-token
MAIL_POSTMARK_MESSAGE_STREAM=outbound  # Defaults to "outbound" when unset
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"
```

The message stream is validated against an allowlist (`outbound`, `broadcast`, `transactional`, `inbound` by default). Use `mail.ConfigureAllowedPostmarkStreams([]string{...})` to register custom streams.

### Mailgun Driver

Send emails via the Mailgun API:

```env
MAIL_DRIVER=mailgun
MAIL_MAILGUN_DOMAIN=mg.yourdomain.com
MAIL_MAILGUN_SECRET=your-api-key
MAIL_MAILGUN_ENDPOINT=https://api.mailgun.net/v3  # Optional, defaults to the US region
MAIL_MAILGUN_WEBHOOK_SIGNING_KEY=your-webhook-key # Optional, for verifying Mailgun webhooks
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"
```

The Mailgun endpoint must use `https`; an `http://` endpoint is rejected so credentials are never sent over cleartext.

{{% callout type="info" %}}
You can also cap attachment sizes globally with `MAIL_MAX_ATTACHMENT_SIZE` (bytes). It defaults to 25 MiB (`mail.DefaultMaxAttachmentSize`).
{{% /callout %}}

## Building Messages

### Fluent API

The `Message` type provides a fluent, chainable builder. The address and content
setters return `*Message`, so they chain. Once built, pass the message to a
`Mailer`:

```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

msg := mail.NewMessage().
    From("sender@example.com", "Sender Name").
    To("recipient@example.com", "Recipient Name").
    CC("manager@example.com").
    BCC("admin@example.com").
    ReplyTo("support@example.com").
    Subject("Important Update").
    TextBody("Plain text content").
    HTMLBody("<h1>HTML content</h1>").
    Priority(mail.HighPriority)

mailer.Send(context.Background(), msg)
```

{{% callout type="info" %}}
The address setters (`From`/`To`/`CC`/`BCC`/`ReplyTo`), `Subject`, and `Header`
validate their input and reject CR/LF header-injection payloads, recipient lists
smuggled into a single address, and embedded display names. A rejected value is
stored as a deferred error on the message; `Send` returns it before any driver
sees the message. Call `msg.Err()` to inspect it early.
{{% /callout %}}

### Multiple Recipients

```go
msg := mail.NewMessage().
    To("user1@example.com").
    To("user2@example.com").
    To("user3@example.com", "User Three").
    Subject("Newsletter").
    Body("Monthly newsletter content")

mailer.Send(context.Background(), msg)
```

### Custom Headers

```go
msg := mail.NewMessage().
    To("user@example.com").
    Subject("Custom Headers").
    Body("Content").
    Header("X-Custom-ID", "12345").
    Header("X-Campaign", "summer-sale")

mailer.Send(context.Background(), msg)
```

## Templates

Render an HTML template into the message's HTML body. Templates are parsed with
Go's `html/template` and live under `resources/views/emails` by default; the
template name is the file name without the `.html` extension. Change the
directory with `mail.SetTemplatePath`.

`Template` returns `(*Message, error)` (it can fail to find or render the file),
so it breaks the fluent chain:

```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

func send(mailer mail.Mailer) error {
    // Renders resources/views/emails/welcome.html
    data := map[string]any{
        "Name": "John Doe",
        "URL":  "https://example.com/verify",
    }

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Welcome!")

    if _, err := msg.Template("welcome", data); err != nil {
        return err
    }

    return mailer.Send(context.Background(), msg)
}
```

Template names containing path separators or `..` traversal sequences are
rejected.

Example template (`resources/views/emails/welcome.html`):

```html
<!DOCTYPE html>
<html>
<head>
    <title>Welcome</title>
</head>
<body>
    <h1>Welcome, {{.Name}}!</h1>
    <p>Click here to verify your account:</p>
    <a href="{{.URL}}">Verify Account</a>
</body>
</html>
```

## Attachments

### From File System

`AttachFile` resolves its argument **relative to a registered attachment root**.
A root must be configured first, either per-message via `WithAttachmentRoot` or
process-wide via `mail.SetDefaultAttachmentRoot`. Without one, `AttachFile`
returns `mail.ErrAttachmentRootRequired`. Absolute paths and paths that escape
the root (via `..` or symlinks) are rejected with
`mail.ErrAttachmentPathOutsideRoot`. `AttachFile` returns `(*Message, error)`.

```go
import (
    "context"
    "os"

    "github.com/velocitykode/velocity/mail"
)

func send(mailer mail.Mailer) error {
    root, err := os.OpenRoot("/srv/app/attachments")
    if err != nil {
        return err
    }
    defer root.Close()

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Documents").
        Body("Please find the documents attached.").
        WithAttachmentRoot(root)

    if _, err := msg.AttachFile("document.pdf"); err != nil {
        return err
    }
    if _, err := msg.AttachFile("image.jpg"); err != nil {
        return err
    }

    return mailer.Send(context.Background(), msg)
}
```

Configure a process-wide root once at boot to avoid passing it to every message:

```go
root, _ := os.OpenRoot("/srv/app/attachments")
mail.SetDefaultAttachmentRoot(root) // caller owns root and closes it at shutdown
```

### From Memory

`AttachData` does not need a root and stays in the fluent chain (it records a
deferred error if the data exceeds the limit):

```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

func send(mailer mail.Mailer) error {
    // Generate PDF or other data
    pdfData := generateInvoicePDF()

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Your Invoice").
        Body("Invoice attached.").
        AttachData(pdfData, "invoice.pdf", "application/pdf")

    return mailer.Send(context.Background(), msg)
}
```

### Attachment Size Limits

Each attachment is capped at `mail.GetDefaultMaxAttachmentSize()` (25 MiB by
default, or the value of `MAIL_MAX_ATTACHMENT_SIZE`). Exceeding it yields
`mail.ErrAttachmentTooLarge`. Override the limit per message with
`msg.WithMaxAttachmentSize(n)` (call it before attaching).

## Advanced Usage

### Using Context

`Mailer.Send` takes a `context.Context`, so timeouts and cancellation propagate
to the driver's network I/O:

```go
import (
    "context"
    "time"

    "github.com/velocitykode/velocity/mail"
)

func sendEmail(mailer mail.Mailer) error {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Hello").
        Body("Content")

    return mailer.Send(ctx, msg)
}
```

### Priority Levels

```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

// High priority (urgent)
high := mail.NewMessage().
    To("admin@example.com").
    Subject("URGENT: Server Down").
    Body("Server is down!").
    Priority(mail.HighPriority)
mailer.Send(context.Background(), high)

// Normal priority (default)
normal := mail.NewMessage().
    To("user@example.com").
    Subject("Update").
    Body("Regular update").
    Priority(mail.NormalPriority)
mailer.Send(context.Background(), normal)

// Low priority
low := mail.NewMessage().
    To("user@example.com").
    Subject("Newsletter").
    Body("Monthly newsletter").
    Priority(mail.LowPriority)
mailer.Send(context.Background(), low)
```

### Constructing a Mailer

Build a `Mailer` directly from a `MailConfig`. Blank-import `mail/standard` (or a
specific leaf driver) so the driver factories are registered before
`NewMailer` resolves them:

```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
    _ "github.com/velocitykode/velocity/mail/standard" // registers log/local/mailgun/postmark
)

mailer, err := mail.NewMailer(mail.MailConfig{
    Driver:      "postmark",
    FromAddress: "noreply@example.com",
    FromName:    "My Application",
    Postmark: mail.PostmarkConfig{
        Token:         "your-server-token",
        MessageStream: "outbound",
    },
})
if err != nil {
    // handle misconfiguration
}

msg := mail.NewMessage().
    To("user@example.com").
    Subject("Test").
    Body("Content")

mailer.Send(context.Background(), msg)
```

When you only need an in-process recorder for development, the log driver is
available directly:

```go
mailer := mail.NewLogDriver()
```

### Multiple Channels

A `Manager` routes a message through one of several named channels (for example
a transactional channel and a marketing channel) and can broadcast to several at
once. It also dispatches `MailSent` / `MailFailed` events when an event
dispatcher is wired in:

```go
import (
    "context"

    "github.com/velocitykode/velocity/mail"
)

manager := mail.NewManager()

transactional, _ := mail.NewMailer(mail.MailConfig{Driver: "postmark" /* ... */})
marketing, _ := mail.NewMailer(mail.MailConfig{Driver: "mailgun" /* ... */})

manager.SetChannel("transactional", transactional)
manager.SetChannel("marketing", marketing)

msg := mail.NewMessage().
    To("user@example.com").
    Subject("Receipt").
    Body("Thanks for your order")

// Send via one channel.
if err := manager.Send(context.Background(), "transactional", msg); err != nil {
    // handle error
}

// Or deliver the same message through several channels concurrently.
manager.Broadcast(context.Background(), []string{"transactional", "marketing"}, msg)
```

## API Reference

### Package Functions

```go
// Create a new message
func NewMessage() *Message

// Construct a mailer from configuration (drivers must be registered first)
func NewMailer(config MailConfig) (Mailer, error)
func NewMailerWithContext(ctx context.Context, config MailConfig) (Mailer, error)

// The built-in development log driver
func NewLogDriver() *LogDriver

// Multi-channel routing
func NewManager() *Manager

// Driver registry (driver packages register factories into it)
func Drivers() *driverregistry.Registry[Mailer, MailConfig]

// Templates
func SetTemplatePath(path string)

// Attachment containment root and size limits
func SetDefaultAttachmentRoot(root *os.Root)
func GetDefaultAttachmentRoot() *os.Root
func SetDefaultMaxAttachmentSize(n int64)
func GetDefaultMaxAttachmentSize() int64

// Postmark stream allowlist
func ConfigureAllowedPostmarkStreams(streams []string)
func IsAllowedPostmarkStream(name string) bool

// Error helpers
func IsErrAttachmentTooLarge(err error) bool
func IsErrInvalidHeader(err error) bool
```

### Mailer and Manager

```go
// Every driver implements this single-method interface
type Mailer interface {
    Send(ctx context.Context, msg *Message) error
}

// Manager methods
func (m *Manager) SetChannel(name string, mailer Mailer)
func (m *Manager) Channel(name string) (Mailer, error)
func (m *Manager) HasChannel(name string) bool
func (m *Manager) GetChannels() []string
func (m *Manager) RemoveChannel(name string)
func (m *Manager) ClearChannels()
func (m *Manager) Send(ctx context.Context, channel string, msg *Message) error
func (m *Manager) Broadcast(ctx context.Context, channels []string, msg *Message) error
func (m *Manager) Shutdown(ctx context.Context) error
```

### Message Methods

```go
// Recipients (chainable; record a deferred error on invalid input)
func (m *Message) From(email string, name ...string) *Message
func (m *Message) To(email string, name ...string) *Message
func (m *Message) CC(email string, name ...string) *Message
func (m *Message) BCC(email string, name ...string) *Message
func (m *Message) ReplyTo(email string, name ...string) *Message

// Content
func (m *Message) Subject(subject string) *Message
func (m *Message) Body(body string) *Message            // Convenience for TextBody
func (m *Message) TextBody(body string) *Message
func (m *Message) HTMLBody(body string) *Message
func (m *Message) Template(name string, data interface{}) (*Message, error)

// Attachments
func (m *Message) WithAttachmentRoot(root *os.Root) *Message
func (m *Message) WithMaxAttachmentSize(n int64) *Message
func (m *Message) AttachFile(path string) (*Message, error)
func (m *Message) AttachData(data []byte, name, contentType string) *Message

// Metadata
func (m *Message) Header(key, value string) *Message
func (m *Message) Priority(priority Priority) *Message

// Inspect the first deferred setter error (Send returns it too)
func (m *Message) Err() error
```

### Priority Constants

```go
const (
    LowPriority Priority = iota
    NormalPriority
    HighPriority
)
```

## Best Practices

1. **Use the Log Driver in Development**: Set `MAIL_DRIVER=log` to avoid sending real emails during development

2. **Always Set From Address**: Configure `MAIL_FROM_ADDRESS` in your `.env` to ensure all emails have a valid sender

3. **Provide Both Text and HTML**: Include both `TextBody()` and `HTMLBody()` for better email client compatibility:
   ```go
   msg.TextBody("Plain text version").
       HTMLBody("<h1>HTML version</h1>")
   ```

4. **Use Templates for Complex Emails**: Don't build HTML in code - use the `Template()` method

5. **Handle Errors Properly**: Always check the error returned from `Send()`:
   ```go
   if err := mailer.Send(ctx, msg); err != nil {
       log.Error("Failed to send email", "error", err)
       return err
   }
   ```

6. **Use Context for Timeouts**: When sending emails in HTTP handlers, use a context with a timeout:
   ```go
   ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
   defer cancel()
   mailer.Send(ctx, msg)
   ```

7. **Validate Email Addresses**: Validate user-provided email addresses before attempting to send

8. **Use Appropriate Drivers**:
   - Development: `log` driver
   - Staging: `local` SMTP or test Postmark account
   - Production: `postmark` or `mailgun` for reliability

## Testing

### Using the Log Driver

The log driver records messages in-process instead of delivering them, which
makes it convenient for tests:

```go
import (
    "context"
    "testing"

    "github.com/velocitykode/velocity/mail"
)

func TestEmailSending(t *testing.T) {
    mailer := mail.NewLogDriver()

    msg := mail.NewMessage().
        To("test@example.com").
        Subject("Test").
        Body("Test email")

    if err := mailer.Send(context.Background(), msg); err != nil {
        t.Fatalf("send failed: %v", err)
    }
}
```

### Using the Fake Mailer

The `mailtest` package provides `FakeMailer`, a recorder that satisfies
`mail.Mailer` and ships with assertion helpers. Inject it anywhere a `Mailer`
is expected:

```go
import (
    "testing"

    "github.com/velocitykode/velocity/mail"
    "github.com/velocitykode/velocity/mail/mailtest"
)

func TestUserRegistration(t *testing.T) {
    fake := mailtest.NewFakeMailer()

    // Test your code, passing fake wherever a mail.Mailer is needed.
    RegisterUser(fake, "test@example.com")

    // Assert exactly one welcome email went to the new user.
    fake.AssertSentTimes(t, 1, func(m *mail.Message) bool {
        return len(m.GetTo()) > 0 && m.GetTo()[0].Email == "test@example.com"
    })
}
```

`FakeMailer` also exposes `GetSent()`, `AssertSent`, `AssertNotSent`, and
`AssertNothingSent`.

## Examples

### Welcome Email

```go
func SendWelcomeEmail(mailer mail.Mailer, user User) error {
    msg := mail.NewMessage().
        To(user.Email, user.Name).
        Subject("Welcome to Our Platform")

    if _, err := msg.Template("welcome", map[string]any{
        "Name":      user.Name,
        "VerifyURL": generateVerificationURL(user),
    }); err != nil {
        return err
    }

    return mailer.Send(context.Background(), msg)
}
```

### Password Reset

```go
func SendPasswordResetEmail(mailer mail.Mailer, email, token string) error {
    resetURL := fmt.Sprintf("https://example.com/reset?token=%s", token)

    msg := mail.NewMessage().
        To(email).
        Subject("Password Reset Request")

    if _, err := msg.Template("password-reset", map[string]any{
        "ResetURL":  resetURL,
        "ExpiresIn": "24 hours",
    }); err != nil {
        return err
    }

    return mailer.Send(context.Background(), msg)
}
```

### Invoice with PDF

```go
func SendInvoice(mailer mail.Mailer, customer Customer, invoice Invoice) error {
    pdfData := generateInvoicePDF(invoice)

    msg := mail.NewMessage().
        To(customer.Email, customer.Name).
        Subject(fmt.Sprintf("Invoice #%s", invoice.Number)).
        AttachData(pdfData, "invoice.pdf", "application/pdf")

    if _, err := msg.Template("invoice", map[string]any{
        "Invoice":  invoice,
        "Customer": customer,
    }); err != nil {
        return err
    }

    return mailer.Send(context.Background(), msg)
}
```

### Notification with Priority

```go
func SendAlertEmail(mailer mail.Mailer, admins []string, alert Alert) error {
    msg := mail.NewMessage().
        Subject(fmt.Sprintf("ALERT: %s", alert.Title)).
        Body(alert.Message).
        Priority(mail.HighPriority)

    for _, email := range admins {
        msg.To(email)
    }

    return mailer.Send(context.Background(), msg)
}
```

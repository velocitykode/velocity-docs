---
title: "Mail"
weight: 40
---

Velocity provides a powerful, driver-based email system that supports multiple mail services with a unified, fluent API.

## Quick Start

{{% callout type="info" %}}
**Zero Configuration**: The mail package automatically initializes from your `.env` file. No setup required!
{{% /callout %}}

{{< tabs items="Simple Email,HTML Email,With Attachments" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/mail"

func main() {
    // Mail auto-initializes from .env
    mail.NewMessage().
        To("user@example.com").
        Subject("Welcome to Velocity").
        Body("Thanks for signing up!").
        Send()
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/mail"

func main() {
    html := `
        <h1>Welcome to Velocity</h1>
        <p>Thanks for signing up!</p>
    `

    mail.NewMessage().
        To("user@example.com").
        Subject("Welcome").
        HTMLBody(html).
        TextBody("Thanks for signing up!").
        Send()
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/mail"

func main() {
    mail.NewMessage().
        To("user@example.com").
        Subject("Your Invoice").
        Body("Please find your invoice attached.").
        AttachFile("/path/to/invoice.pdf").
        Send()
}
```
{{< /tab >}}

{{< /tabs >}}

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

Send emails via local SMTP server or sendmail:

```env
MAIL_DRIVER=local
MAIL_HOST=localhost
MAIL_PORT=587
MAIL_USERNAME=your-username
MAIL_PASSWORD=your-password
MAIL_ENCRYPTION=tls          # Options: tls, ssl, none
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"

# Or use sendmail instead of SMTP
MAIL_SENDMAIL_PATH=/usr/sbin/sendmail
```

### Postmark Driver

Send transactional emails via Postmark:

```env
MAIL_DRIVER=postmark
POSTMARK_TOKEN=your-server-token
POSTMARK_MESSAGE_STREAM=outbound  # Options: outbound, broadcast
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"
```

### Mailgun Driver

Send emails via Mailgun API:

```env
MAIL_DRIVER=mailgun
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_SECRET=your-api-key
MAILGUN_ENDPOINT=https://api.mailgun.net/v3  # Optional, defaults to US region
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="My Application"
```

## Building Messages

### Fluent API

The `Message` type provides a fluent, chainable API:

```go
import "github.com/velocitykode/velocity/pkg/mail"

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

msg.Send()
```

### Multiple Recipients

```go
mail.NewMessage().
    To("user1@example.com").
    To("user2@example.com").
    To("user3@example.com", "User Three").
    Subject("Newsletter").
    Body("Monthly newsletter content").
    Send()
```

### Custom Headers

```go
mail.NewMessage().
    To("user@example.com").
    Subject("Custom Headers").
    Body("Content").
    Header("X-Custom-ID", "12345").
    Header("X-Campaign", "summer-sale").
    Send()
```

## Templates

Render HTML templates for emails:

```go
import (
    "github.com/velocitykode/velocity/pkg/mail"
)

// Create template file: templates/welcome.html
data := map[string]interface{}{
    "Name": "John Doe",
    "URL":  "https://example.com/verify",
}

mail.NewMessage().
    To("user@example.com").
    Subject("Welcome!").
    Template("welcome", data).
    Send()
```

Example template (`templates/welcome.html`):

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

```go
mail.NewMessage().
    To("user@example.com").
    Subject("Documents").
    Body("Please find the documents attached.").
    AttachFile("/path/to/document.pdf").
    AttachFile("/path/to/image.jpg").
    Send()
```

### From Memory

```go
import "github.com/velocitykode/velocity/pkg/mail"

// Generate PDF or other data
pdfData := generateInvoicePDF()

mail.NewMessage().
    To("user@example.com").
    Subject("Your Invoice").
    Body("Invoice attached.").
    AttachData(pdfData, "invoice.pdf", "application/pdf").
    Send()
```

## Advanced Usage

### Using Context

For timeout control and cancellation:

```go
import (
    "context"
    "time"
    "github.com/velocitykode/velocity/pkg/mail"
)

func sendEmail() error {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    msg := mail.NewMessage().
        To("user@example.com").
        Subject("Hello").
        Body("Content")

    return mail.Send(ctx, msg)
}
```

### Priority Levels

```go
import "github.com/velocitykode/velocity/pkg/mail"

// High priority (urgent)
mail.NewMessage().
    To("admin@example.com").
    Subject("URGENT: Server Down").
    Body("Server is down!").
    Priority(mail.HighPriority).
    Send()

// Normal priority (default)
mail.NewMessage().
    To("user@example.com").
    Subject("Update").
    Body("Regular update").
    Priority(mail.NormalPriority).
    Send()

// Low priority
mail.NewMessage().
    To("user@example.com").
    Subject("Newsletter").
    Body("Monthly newsletter").
    Priority(mail.LowPriority).
    Send()
```

### Custom Mailer Instance

For advanced use cases, create and manage your own mailer:

```go
import (
    "github.com/velocitykode/velocity/pkg/mail"
    "github.com/velocitykode/velocity/pkg/mail/drivers"
)

// Create custom mailer
mailer := drivers.NewLogDriver()
mail.SetDefaultMailer(mailer)

// Or use directly
msg := mail.NewMessage().
    To("user@example.com").
    Subject("Test").
    Body("Content")

mailer.Send(context.Background(), msg)
```

## API Reference

### Global Functions

```go
// Send an email using the default mailer
func Send(ctx context.Context, msg *Message) error

// Create a new message
func NewMessage() *Message

// Set the default mailer
func SetDefaultMailer(mailer Mailer)

// Reinitialize the mail driver
func Reinitialize() error
func ReinitializeWithDriver(driver string) error
```

### Message Methods

```go
// Recipients
msg.From(email string, name ...string) *Message
msg.To(email string, name ...string) *Message
msg.CC(email string, name ...string) *Message
msg.BCC(email string, name ...string) *Message
msg.ReplyTo(email string, name ...string) *Message

// Content
msg.Subject(subject string) *Message
msg.Body(text string) *Message            // Convenience for TextBody
msg.TextBody(text string) *Message
msg.HTMLBody(html string) *Message
msg.Template(name string, data interface{}) *Message

// Attachments
msg.AttachFile(path string) *Message
msg.AttachData(data []byte, name, contentType string) *Message

// Metadata
msg.Header(key, value string) *Message
msg.Priority(priority Priority) *Message

// Sending
msg.Send() error
msg.SendWithContext(ctx context.Context) error
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
   if err := msg.Send(); err != nil {
       log.Error("Failed to send email", "error", err)
       return err
   }
   ```

6. **Use Context for Timeouts**: When sending emails in HTTP handlers, use context with timeout:
   ```go
   ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
   defer cancel()
   mail.Send(ctx, msg)
   ```

7. **Validate Email Addresses**: Validate user-provided email addresses before attempting to send

8. **Use Appropriate Drivers**:
   - Development: `log` driver
   - Staging: `local` SMTP or test Postmark account
   - Production: `postmark` or `mailgun` for reliability

## Testing

### Using the Log Driver

```go
func TestEmailSending(t *testing.T) {
    // Set log driver for testing
    mail.ReinitializeWithDriver("log")

    err := mail.NewMessage().
        To("test@example.com").
        Subject("Test").
        Body("Test email").
        Send()

    assert.NoError(t, err)
}
```

### Mocking the Mailer

```go
type MockMailer struct {
    SentMessages []*mail.Message
}

func (m *MockMailer) Send(ctx context.Context, msg *mail.Message) error {
    m.SentMessages = append(m.SentMessages, msg)
    return nil
}

func TestUserRegistration(t *testing.T) {
    mock := &MockMailer{}
    mail.SetDefaultMailer(mock)

    // Test your code that sends emails
    RegisterUser("test@example.com")

    // Verify email was sent
    assert.Equal(t, 1, len(mock.SentMessages))
    assert.Equal(t, "test@example.com", mock.SentMessages[0].GetTo()[0].Email)
}
```

## Examples

### Welcome Email

```go
func SendWelcomeEmail(user User) error {
    return mail.NewMessage().
        To(user.Email, user.Name).
        Subject("Welcome to Our Platform").
        Template("welcome", map[string]interface{}{
            "Name": user.Name,
            "VerifyURL": generateVerificationURL(user),
        }).
        Send()
}
```

### Password Reset

```go
func SendPasswordResetEmail(email, token string) error {
    resetURL := fmt.Sprintf("https://example.com/reset?token=%s", token)

    return mail.NewMessage().
        To(email).
        Subject("Password Reset Request").
        Template("password-reset", map[string]interface{}{
            "ResetURL": resetURL,
            "ExpiresIn": "24 hours",
        }).
        Send()
}
```

### Invoice with PDF

```go
func SendInvoice(customer Customer, invoice Invoice) error {
    pdfData := generateInvoicePDF(invoice)

    return mail.NewMessage().
        To(customer.Email, customer.Name).
        Subject(fmt.Sprintf("Invoice #%s", invoice.Number)).
        Template("invoice", map[string]interface{}{
            "Invoice": invoice,
            "Customer": customer,
        }).
        AttachData(pdfData, "invoice.pdf", "application/pdf").
        Send()
}
```

### Notification with Priority

```go
func SendAlertEmail(admins []string, alert Alert) error {
    msg := mail.NewMessage().
        Subject(fmt.Sprintf("ALERT: %s", alert.Title)).
        Body(alert.Message).
        Priority(mail.HighPriority)

    for _, email := range admins {
        msg.To(email)
    }

    return msg.Send()
}
```

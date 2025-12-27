---
title: "Validation"
weight: 50
---

Velocity provides a flexible, extensible validation system for validating HTTP requests, form data, and general data structures. The validation package uses a declarative, rule-based approach similar to Laravel but designed for Go's type system.

## Quick Start

{{% callout type="info" %}}
**Simple and Declarative**: Define validation rules as strings and let Velocity handle the rest.
{{% /callout %}}

{{< tabs items="Basic Validation,HTTP Request Validation,Custom Messages" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/validation"

func validateUser(data map[string]interface{}) error {
    rules := validation.Rules{
        "email":    "required|email",
        "password": "required|min:8",
        "age":      "required|numeric|min:18",
        "username": "required|alpha_num",
    }

    validated, err := validation.Validate(data, rules)
    if err != nil {
        // Handle validation errors
        validationErr := err.(validation.ValidationErrors)
        fmt.Println("Validation failed:", validationErr.Error())
        return err
    }

    // Use validated data
    email := validated.GetString("email")
    age := validated.GetInt("age")

    return nil
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/pkg/http"
    "github.com/velocitykode/velocity/pkg/validation"
)

func RegisterUser(c *http.Context) error {
    // Validate HTTP request
    rules := validation.Rules{
        "name":     "required|string",
        "email":    "required|email",
        "password": "required|min:8|confirmed",
        "age":      "required|numeric|min:18",
        "terms":    "required|accepted",
    }

    validated, err := validation.ValidateRequest(c.Request, rules)
    if err != nil {
        return c.JSON(422, map[string]interface{}{
            "errors": err.(validation.ValidationErrors).All(),
        })
    }

    // Create user with validated data
    user := &User{
        Name:     validated.GetString("name"),
        Email:    validated.GetString("email"),
        Password: validated.GetString("password"),
        Age:      validated.GetInt("age"),
    }

    return c.JSON(200, user)
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/validation"

func validateWithCustomMessages(data map[string]interface{}) error {
    rules := validation.Rules{
        "email":    "required|email",
        "password": "required|min:8",
    }

    // Set custom error messages
    validator := validation.Get()
    validator.SetMessages(validation.Messages{
        "email.required":    "Please provide your email address",
        "email.email":       "Please enter a valid email address",
        "password.required": "Password is required",
        "password.min":      "Password must be at least 8 characters",
    })

    validated, err := validator.Validate(data, rules)
    if err != nil {
        return err
    }

    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

The validation package works out of the box with no configuration required. However, you can customize behavior through environment variables:

```env
# Stop validation on first error (default: false)
VALIDATION_STOP_ON_FIRST=false

# Default locale for error messages
VALIDATION_DEFAULT_LOCALE=en

# Bail on first rule failure per field (default: true)
VALIDATION_BAIL_ON_ERROR=true
```

## Available Rules

### Presence Rules

#### required

Field must be present and not empty:

```go
rules := validation.Rules{
    "name": "required",
}
// ✓ "John"
// ✗ "" (empty string)
// ✗ nil
```

#### nullable

Field can be null or empty:

```go
rules := validation.Rules{
    "middle_name": "nullable|string",
}
// ✓ "Smith"
// ✓ ""
// ✓ nil
```

#### filled

If field is present, it must not be empty:

```go
rules := validation.Rules{
    "bio": "filled",
}
// ✓ "Hello world"
// ✓ (field not present)
// ✗ "" (empty when present)
```

#### present

Field must be present (but can be empty):

```go
rules := validation.Rules{
    "accept_terms": "present",
}
// ✓ "" (present but empty)
// ✓ "yes"
// ✗ (field not in data)
```

### Type Rules

#### string

Value must be a string:

```go
rules := validation.Rules{
    "name": "string",
}
// ✓ "John"
// ✗ 123
```

#### integer

Value must be an integer:

```go
rules := validation.Rules{
    "age": "integer",
}
// ✓ 25
// ✗ "25"
// ✗ 25.5
```

#### numeric

Value must be numeric (integer or float):

```go
rules := validation.Rules{
    "price": "numeric",
}
// ✓ 99
// ✓ 99.99
// ✗ "99.99"
```

#### boolean

Value must be boolean:

```go
rules := validation.Rules{
    "active": "boolean",
}
// ✓ true
// ✓ false
// ✗ "true"
```

#### array

Value must be an array:

```go
rules := validation.Rules{
    "tags": "array",
}
// ✓ []string{"go", "web"}
// ✗ "go,web"
```

### String Rules

#### email

Value must be a valid email address:

```go
rules := validation.Rules{
    "email": "email",
}
// ✓ "user@example.com"
// ✗ "invalid-email"
```

#### url

Value must be a valid URL:

```go
rules := validation.Rules{
    "website": "url",
}
// ✓ "https://example.com"
// ✗ "not-a-url"
```

#### alpha

Value must contain only alphabetic characters:

```go
rules := validation.Rules{
    "name": "alpha",
}
// ✓ "John"
// ✗ "John123"
```

#### alpha_num

Value must contain only alphanumeric characters:

```go
rules := validation.Rules{
    "username": "alpha_num",
}
// ✓ "user123"
// ✗ "user_123"
```

#### alpha_dash

Value must contain only alphanumeric characters, dashes, and underscores:

```go
rules := validation.Rules{
    "slug": "alpha_dash",
}
// ✓ "my-post_title"
// ✗ "my post!"
```

### Size Rules

#### min

Minimum value or length:

```go
rules := validation.Rules{
    "password": "min:8",      // String: min 8 characters
    "age":      "numeric|min:18",  // Number: min value 18
    "tags":     "array|min:2",     // Array: min 2 elements
}
```

#### max

Maximum value or length:

```go
rules := validation.Rules{
    "bio":   "max:500",       // String: max 500 characters
    "age":   "numeric|max:120",    // Number: max value 120
    "tags":  "array|max:10",       // Array: max 10 elements
}
```

#### size

Exact value or length:

```go
rules := validation.Rules{
    "zip_code": "size:5",     // String: exactly 5 characters
    "rating":   "numeric|size:5",  // Number: exactly 5
    "choices":  "array|size:3",    // Array: exactly 3 elements
}
```

#### between

Value must be between two values:

```go
rules := validation.Rules{
    "age":      "numeric|between:18,65",
    "username": "between:3,20",
}
```

### Comparison Rules

#### same

Field must have the same value as another field:

```go
rules := validation.Rules{
    "password":         "required",
    "password_confirm": "same:password",
}
```

#### different

Field must have a different value from another field:

```go
rules := validation.Rules{
    "email":     "required|email",
    "alt_email": "different:email",
}
```

#### confirmed

Field must have a matching confirmation field:

```go
rules := validation.Rules{
    "password": "confirmed",  // Looks for "password_confirmation"
}

// Form data must include both:
// password: "secret123"
// password_confirmation: "secret123"
```

#### in

Value must be in a list of values:

```go
rules := validation.Rules{
    "role": "in:admin,user,moderator",
}
// ✓ "admin"
// ✗ "superadmin"
```

#### not_in

Value must not be in a list of values:

```go
rules := validation.Rules{
    "username": "not_in:admin,root,system",
}
// ✓ "john"
// ✗ "admin"
```

#### accepted

Field must be yes, on, 1, or true (useful for terms of service):

```go
rules := validation.Rules{
    "terms": "accepted",
}
// ✓ "yes", "on", "1", true
// ✗ "no", "off", "0", false
```

## API Reference

### Global Functions

#### Validate

Validate data against rules:

```go
data := map[string]interface{}{
    "email": "user@example.com",
    "age":   25,
}

rules := validation.Rules{
    "email": "required|email",
    "age":   "required|numeric|min:18",
}

validated, err := validation.Validate(data, rules)
if err != nil {
    // Handle validation errors
    validationErr := err.(validation.ValidationErrors)
    for field, messages := range validationErr.All() {
        fmt.Printf("%s: %v\n", field, messages)
    }
    return err
}

// Access validated data
email := validated.GetString("email")
age := validated.GetInt("age")
```

#### ValidateRequest

Validate HTTP request:

```go
func handler(c *http.Context) error {
    rules := validation.Rules{
        "email": "required|email",
        "name":  "required|string",
    }

    validated, err := validation.ValidateRequest(c.Request, rules)
    if err != nil {
        return c.JSON(422, map[string]interface{}{
            "errors": err.(validation.ValidationErrors).All(),
        })
    }

    return c.JSON(200, validated.All())
}
```

#### ValidateValue

Validate a single value:

```go
email := "user@example.com"
err := validation.ValidateValue(email, "required|email")
if err != nil {
    fmt.Println("Invalid email:", err)
}
```

### ValidatedData Methods

#### Get

Get any value:

```go
value := validated.Get("field_name")
```

#### GetString

Get a string value:

```go
name := validated.GetString("name")
```

#### GetInt

Get an integer value:

```go
age := validated.GetInt("age")
```

#### GetBool

Get a boolean value:

```go
active := validated.GetBool("active")
```

#### All

Get all validated data:

```go
data := validated.All()
```

#### HasErrors

Check if validation failed:

```go
if validated.HasErrors() {
    // Handle errors
}
```

#### Errors

Get validation errors:

```go
errors := validated.Errors()
```

### ValidationErrors Methods

#### Error

Get error message as string:

```go
err := validation.Validate(data, rules)
if err != nil {
    fmt.Println(err.Error())
    // Output: "validation failed: email: email is required; age: age must be numeric"
}
```

#### HasError

Check if a field has errors:

```go
if errors.HasError("email") {
    // Email field has validation errors
}
```

#### First

Get the first error for a field:

```go
emailError := errors.First("email")
fmt.Println(emailError)
```

#### All

Get all errors:

```go
allErrors := errors.All()
for field, messages := range allErrors {
    fmt.Printf("%s: %v\n", field, messages)
}
```

#### Count

Get total error count:

```go
count := errors.Count()
fmt.Printf("Total validation errors: %d\n", count)
```

#### IsEmpty

Check if there are no errors:

```go
if errors.IsEmpty() {
    // No validation errors
}
```

## Custom Validation Rules

You can register custom validation rules:

```go
import "github.com/velocitykode/velocity/pkg/validation"

func init() {
    // Register a custom "strong_password" rule
    validation.RegisterRule("strong_password", func(
        field string,
        value interface{},
        params []string,
        data map[string]interface{},
    ) error {
        password, ok := value.(string)
        if !ok {
            return fmt.Errorf("%s must be a string", field)
        }

        // Check password strength
        hasUpper := false
        hasLower := false
        hasNumber := false
        hasSpecial := false

        for _, char := range password {
            switch {
            case unicode.IsUpper(char):
                hasUpper = true
            case unicode.IsLower(char):
                hasLower = true
            case unicode.IsNumber(char):
                hasNumber = true
            case unicode.IsPunct(char) || unicode.IsSymbol(char):
                hasSpecial = true
            }
        }

        if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
            return fmt.Errorf(
                "%s must contain uppercase, lowercase, number, and special character",
                field,
            )
        }

        return nil
    })
}

// Usage
rules := validation.Rules{
    "password": "required|min:8|strong_password",
}
```

## Custom Error Messages

### Per-Validator Messages

```go
validator := validation.Get()
validator.SetMessages(validation.Messages{
    "email.required": "We need your email address",
    "email.email":    "That doesn't look like a valid email",
    "password.min":   "Password should be at least 8 characters",
})
```

### Inline Messages

```go
func validateWithMessages(data map[string]interface{}) error {
    rules := validation.Rules{
        "email":    "required|email",
        "password": "required|min:8",
    }

    messages := validation.Messages{
        "email.required":    "Email is required",
        "email.email":       "Invalid email format",
        "password.required": "Password is required",
        "password.min":      "Password must be at least 8 characters",
    }

    validator := validation.Get()
    validator.SetMessages(messages)

    return validator.Validate(data, rules)
}
```

## Best Practices

### 1. Validate Early

Validate input as soon as it enters your application:

```go
func CreateUser(c *http.Context) error {
    // Validate first, before any business logic
    validated, err := validation.ValidateRequest(c.Request, validation.Rules{
        "email": "required|email",
        "name":  "required|string",
    })
    if err != nil {
        return c.JSON(422, map[string]interface{}{
            "errors": err.(validation.ValidationErrors).All(),
        })
    }

    // Now proceed with business logic
    user := createUserFromValidatedData(validated)
    return c.JSON(201, user)
}
```

### 2. Use Type-Safe Getters

Use the typed getters to avoid type assertions:

```go
// Good: Type-safe
age := validated.GetInt("age")
email := validated.GetString("email")
active := validated.GetBool("active")

// Avoid: Manual type assertion
age := validated.Get("age").(int)  // Can panic!
```

### 3. Provide Clear Error Messages

Use custom messages to improve user experience:

```go
messages := validation.Messages{
    "email.email":      "Please enter a valid email address",
    "password.min":     "Your password needs to be at least 8 characters",
    "terms.accepted":   "You must accept the terms of service",
}
```

### 4. Combine Rules Appropriately

Order rules from general to specific:

```go
rules := validation.Rules{
    // Good: required first, then type, then constraints
    "age": "required|numeric|min:18|max:120",

    // Less clear
    "age": "min:18|max:120|required|numeric",
}
```

### 5. Create Reusable Rule Sets

```go
var (
    EmailRules    = "required|email"
    PasswordRules = "required|min:8|strong_password"
    PhoneRules    = "required|numeric|size:10"
)

rules := validation.Rules{
    "email":    EmailRules,
    "password": PasswordRules,
    "phone":    PhoneRules,
}
```

## Complete Example

Here's a complete example of a user registration endpoint with validation:

```go
package controllers

import (
    "github.com/velocitykode/velocity/pkg/http"
    "github.com/velocitykode/velocity/pkg/validation"
)

type UserController struct{}

func (uc *UserController) Register(c *http.Context) error {
    // Define validation rules
    rules := validation.Rules{
        "name":                 "required|string|min:2|max:100",
        "email":                "required|email",
        "password":             "required|min:8|confirmed",
        "password_confirmation": "required",
        "age":                  "required|numeric|min:18",
        "terms":                "required|accepted",
        "newsletter":           "nullable|boolean",
    }

    // Custom error messages
    messages := validation.Messages{
        "name.required":     "Please tell us your name",
        "name.min":          "Name must be at least 2 characters",
        "email.required":    "We need your email address",
        "email.email":       "Please enter a valid email address",
        "password.required": "Password is required",
        "password.min":      "Password must be at least 8 characters",
        "password.confirmed": "Passwords do not match",
        "age.required":      "Please provide your age",
        "age.min":           "You must be at least 18 years old",
        "terms.accepted":    "You must accept the terms of service",
    }

    // Set custom messages
    validator := validation.Get()
    validator.SetMessages(messages)

    // Validate request
    validated, err := validator.ValidateRequest(c.Request, rules)
    if err != nil {
        // Return validation errors
        validationErr := err.(validation.ValidationErrors)
        return c.JSON(422, map[string]interface{}{
            "message": "Validation failed",
            "errors":  validationErr.All(),
        })
    }

    // Create user from validated data
    user := &User{
        Name:           validated.GetString("name"),
        Email:          validated.GetString("email"),
        Password:       hashPassword(validated.GetString("password")),
        Age:            validated.GetInt("age"),
        NewsletterOptIn: validated.GetBool("newsletter"),
    }

    // Save user to database
    if err := user.Save(); err != nil {
        return c.JSON(500, map[string]string{
            "error": "Failed to create user",
        })
    }

    return c.JSON(201, map[string]interface{}{
        "message": "Registration successful",
        "user":    user,
    })
}

func (uc *UserController) UpdateProfile(c *http.Context) error {
    userID := c.Param("id")

    rules := validation.Rules{
        "name":  "nullable|string|min:2|max:100",
        "email": "nullable|email",
        "bio":   "nullable|string|max:500",
        "age":   "nullable|numeric|min:18",
    }

    validated, err := validation.ValidateRequest(c.Request, rules)
    if err != nil {
        return c.JSON(422, map[string]interface{}{
            "errors": err.(validation.ValidationErrors).All(),
        })
    }

    // Update user with validated data
    user := FindUserByID(userID)
    if user == nil {
        return c.JSON(404, map[string]string{
            "error": "User not found",
        })
    }

    // Only update fields that were provided
    for field, value := range validated.All() {
        switch field {
        case "name":
            user.Name = value.(string)
        case "email":
            user.Email = value.(string)
        case "bio":
            user.Bio = value.(string)
        case "age":
            user.Age = validated.GetInt("age")
        }
    }

    user.Save()

    return c.JSON(200, map[string]interface{}{
        "message": "Profile updated successfully",
        "user":    user,
    })
}
```

## Testing

```go
func TestValidation(t *testing.T) {
    data := map[string]interface{}{
        "email":    "user@example.com",
        "password": "secret123",
        "age":      25,
    }

    rules := validation.Rules{
        "email":    "required|email",
        "password": "required|min:8",
        "age":      "required|numeric|min:18",
    }

    validated, err := validation.Validate(data, rules)
    assert.NoError(t, err)
    assert.Equal(t, "user@example.com", validated.GetString("email"))
    assert.Equal(t, 25, validated.GetInt("age"))
}

func TestValidationErrors(t *testing.T) {
    data := map[string]interface{}{
        "email": "invalid-email",
        "age":   "not-a-number",
    }

    rules := validation.Rules{
        "email": "required|email",
        "age":   "required|numeric",
    }

    _, err := validation.Validate(data, rules)
    assert.Error(t, err)

    validationErr := err.(validation.ValidationErrors)
    assert.True(t, validationErr.HasError("email"))
    assert.True(t, validationErr.HasError("age"))
    assert.Equal(t, 2, validationErr.Count())
}
```

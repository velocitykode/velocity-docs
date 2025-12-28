---
title: String Utilities
description: Manipulate strings with Velocity's fluent string utilities for slugs, cases, truncation, and more.
weight: 60
---

Velocity provides a comprehensive string utilities package with powerful text manipulation functions inspired by popular web frameworks, offering fluent interfaces and lazy loading for optimal performance.

## Quick Start

{{% callout type="info" %}}
**Two Ways to Use**: String utilities work with both static functions and a fluent interface for method chaining.
{{% /callout %}}

{{< tabs items="Static Functions,Fluent Interface" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/str"

func main() {
    // Static functions - simple and direct
    result := str.Snake("HelloWorldExample")
    // Returns: "hello_world_example"

    // Case conversions
    camel := str.Camel("hello_world_example")    // "helloWorldExample"
    kebab := str.Kebab("HelloWorldExample")      // "hello-world-example"
    studly := str.Studly("hello_world_example")  // "HelloWorldExample"

    // String manipulation
    after := str.After("user@example.com", "@")  // "example.com"
    before := str.Before("user@example.com", "@") // "user"
    contains := str.Contains("Hello World", "World") // true
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/str"

func main() {
    // Fluent interface - chain multiple operations
    result := str.Of("  Hello World Example  ").
        Trim().                    // Remove whitespace
        Snake().                   // Convert to snake_case
        Upper().                   // Convert to uppercase
        String()                   // Get final string

    // Result: "HELLO_WORLD_EXAMPLE"

    // Complex transformation
    username := str.Of("  John Doe  ").
        Trim().
        Lower().
        Replace(" ", "_").
        String()
    // Result: "john_doe"
}
```
{{< /tab >}}

{{< /tabs >}}

## Case Conversion Functions

{{< tabs items="Snake Case,Camel Case,Kebab Case,Studly Case" >}}

{{< tab >}}
**Snake Case**: Convert strings to snake_case (lowercase with underscores)

```go
str.Snake("HelloWorldExample")    // "hello_world_example"
str.Snake("camelCaseString")      // "camel_case_string"
str.Snake("kebab-case-string")    // "kebab_case_string"
str.Snake("Mixed String Types")   // "mixed_string_types"
```

{{% callout type="note" %}}
Snake case is commonly used for variable names, database column names, and file names.
{{% /callout %}}
{{< /tab >}}

{{< tab >}}
**Camel Case**: Convert strings to camelCase (first letter lowercase, subsequent words capitalized)

```go
str.Camel("hello_world_example")  // "helloWorldExample"
str.Camel("kebab-case-string")    // "kebabCaseString"
str.Camel("Mixed String Types")   // "mixedStringTypes"
```

{{% callout type="note" %}}
Camel case is the standard for JavaScript variables and Go field names when exported.
{{% /callout %}}
{{< /tab >}}

{{< tab >}}
**Kebab Case**: Convert strings to kebab-case (lowercase with hyphens)

```go
str.Kebab("HelloWorldExample")    // "hello-world-example"
str.Kebab("camelCaseString")      // "camel-case-string"
str.Kebab("hello_world_example")  // "hello-world-example"
```

{{% callout type="note" %}}
Kebab case is commonly used for URL slugs, CSS class names, and HTML attributes.
{{% /callout %}}
{{< /tab >}}

{{< tab >}}
**Studly Case**: Convert strings to StudlyCase/PascalCase (all words capitalized)

```go
str.Studly("hello_world_example") // "HelloWorldExample"
str.Studly("camelCaseString")     // "CamelCaseString"
str.Studly("kebab-case-string")   // "KebabCaseString"
```

{{% callout type="note" %}}
Studly case is used for Go struct names, class names, and other type definitions.
{{% /callout %}}
{{< /tab >}}

{{< /tabs >}}

## String Manipulation Functions

### Extract Substrings

```go
// Get text after a substring
str.After("user@example.com", "@")          // "example.com"
str.After("app/controllers/UserController", "/") // "controllers/UserController"

// Get text before a substring
str.Before("user@example.com", "@")         // "user"
str.Before("path/to/file.txt", ".")         // "path/to/file"

// Get text between two substrings
str.Between("Hello [World] Test", "[", "]") // "World"
str.Between("<div>Content</div>", ">", "<") // "Content"
```

### String Checks

```go
// Check if string contains substring
str.Contains("Hello World", "World")        // true
str.Contains("Hello World", "world")        // false (case-sensitive)

// Check if string starts with substring
str.StartsWith("Hello World", "Hello")      // true
str.StartsWith("Hello World", "World")      // false

// Check if string ends with substring
str.EndsWith("Hello World", "World")        // true
str.EndsWith("Hello World", "Hello")        // false

// Check if string is empty
str.IsEmpty("")                             // true
str.IsEmpty("   ")                          // false (whitespace counts)
```

### String Transformations

```go
// Limit string to specified length
str.Limit("This is a long string", 10)      // "This is a..."
str.Limit("Short", 10)                      // "Short"

// Generate random string
str.Random(8)                               // "aB3kL9mP" (random)
str.Random(16)                              // 16 character random string

// Repeat string
str.Repeat("Hello", 3)                      // "HelloHelloHello"
str.Repeat("-=", 5)                         // "-=-=-=-=-="

// Replace all occurrences
str.Replace("Hello World World", "World", "Go") // "Hello Go Go"

// Reverse string
str.Reverse("Hello")                        // "olleH"
str.Reverse("12345")                        // "54321"
```

## Fluent Interface (Stringable)

For method chaining, use the fluent interface:

```go
import "github.com/velocitykode/velocity/pkg/str"

result := str.Of("  Hello World Example  ").
    Trim().                    // Remove whitespace
    Snake().                   // Convert to snake_case
    Upper().                   // Convert to uppercase
    String()                   // Get final string

// Result: "HELLO_WORLD_EXAMPLE"
```

### Available Fluent Methods

```go
s := str.Of("Hello World")

// Case conversions
s.Snake()                     // Chain snake_case conversion
s.Camel()                     // Chain camelCase conversion
s.Kebab()                     // Chain kebab-case conversion
s.Studly()                    // Chain StudlyCase conversion
s.Upper()                     // Chain uppercase conversion
s.Lower()                     // Chain lowercase conversion

// String manipulations
s.Trim()                      // Chain whitespace trimming
s.Replace("World", "Go")      // Chain replacement
s.After("@")                  // Chain after extraction
s.Before("@")                 // Chain before extraction
s.Limit(10)                   // Chain length limiting

// Get final result
finalString := s.String()     // Convert back to string
```

## Lazy Loading & Performance

{{% callout type="warning" %}}
**Important**: Only the functions you actually use are compiled into your binary, keeping it lightweight and fast.
{{% /callout %}}

The string utilities package uses lazy loading to ensure optimal performance:

```go
// Only the Snake function is compiled into your binary
result := str.Snake("HelloWorldExample")
```

{{% callout type="tip" %}}
**Performance Benefits:**
- **Reduced Binary Size**: Only used functions are included
- **Fast Compilation**: Unused code is eliminated
- **Optimal Performance**: No overhead from unused features
- **Memory Efficient**: Minimal memory footprint
{{% /callout %}}

## Advanced Usage

### Custom Delimiters

```go
// Using custom separators in case conversion
str.ToDelimited("HelloWorldExample", "_")  // "hello_world_example"
str.ToDelimited("HelloWorldExample", "-")  // "hello-world-example"
str.ToDelimited("HelloWorldExample", ".")  // "hello.world.example"
```

### Regex Pattern Caching

The package automatically caches compiled regex patterns for better performance:

```go
// First call compiles and caches the regex
str.Snake("FirstString")

// Subsequent calls reuse the cached regex
str.Snake("SecondString")  // Faster execution
str.Snake("ThirdString")   // Even faster
```

## Testing String Functions

```go
func TestStringUtilities(t *testing.T) {
    // Test case conversions
    assert.Equal(t, "hello_world", str.Snake("HelloWorld"))
    assert.Equal(t, "helloWorld", str.Camel("hello_world"))
    assert.Equal(t, "hello-world", str.Kebab("HelloWorld"))

    // Test string manipulation
    assert.Equal(t, "example.com", str.After("user@example.com", "@"))
    assert.Equal(t, "user", str.Before("user@example.com", "@"))
    assert.True(t, str.Contains("Hello World", "World"))

    // Test fluent interface
    result := str.Of("  Hello World  ").Trim().Snake().String()
    assert.Equal(t, "hello_world", result)
}
```

## Configuration

String utilities work without configuration, but you can customize behavior:

```env
# Enable debug mode for string operations (optional)
STR_DEBUG=false

# Cache regex patterns (enabled by default)
STR_CACHE_REGEX=true
```

## Best Practices

1. **Use Static Functions**: For simple operations, use static functions like `str.Snake()`
2. **Use Fluent Interface**: For complex transformations, chain operations with `str.Of()`
3. **Cache Results**: Store frequently used transformations in variables
4. **Validate Input**: Check for empty strings before processing
5. **Consider Unicode**: The package handles UTF-8 correctly for international text

## Examples

{{< tabs items="User Registration,API Endpoints,File Processing" >}}

{{< tab >}}
**Processing user input for registration:**

```go
func processUsername(input string) string {
    return str.Of(input).
        Trim().                    // Remove whitespace
        Lower().                   // Normalize case
        Replace(" ", "_").         // Replace spaces
        Limit(20).                 // Limit length
        String()
}

username := processUsername("  John Doe  ")
// Result: "john_doe"
```

{{% callout type="info" %}}
Perfect for cleaning user input while maintaining readability and enforcing length limits.
{{% /callout %}}
{{< /tab >}}

{{< tab >}}
**Generating API endpoints from model names:**

```go
func generateEndpoint(modelName string) string {
    return "/api/" + str.Snake(modelName)
}

endpoint := generateEndpoint("UserController")
// Result: "/api/user_controller"

// Multiple endpoints
endpoints := []string{
    generateEndpoint("ProductController"),  // "/api/product_controller"
    generateEndpoint("OrderController"),    // "/api/order_controller"
    generateEndpoint("CustomerController"), // "/api/customer_controller"
}
```

{{% callout type="tip" %}}
Automatically converts Go struct names to REST API conventions.
{{% /callout %}}
{{< /tab >}}

{{< tab >}}
**Sanitizing file names for safe storage:**

```go
func sanitizeFileName(name string) string {
    return str.Of(name).
        Replace(" ", "_").         // Replace spaces
        Snake().                   // Convert to snake_case
        Lower().                   // Lowercase
        String()
}

fileName := sanitizeFileName("My Important Document")
// Result: "my_important_document"

// Batch processing
files := []string{
    "User Profile Picture",
    "Invoice 2024-01",
    "Meeting Notes",
}

for _, file := range files {
    safe := sanitizeFileName(file)
    fmt.Printf("%s -> %s\n", file, safe)
}
```

{{% callout type="note" %}}
Ensures file names are safe across different operating systems and file systems.
{{% /callout %}}
{{< /tab >}}

{{< /tabs >}}


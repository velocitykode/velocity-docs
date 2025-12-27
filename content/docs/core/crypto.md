---
title: Cryptography
weight: 50
---

Velocity provides robust encryption utilities for securing sensitive data with support for multiple AES cipher modes, automatic key rotation, and Laravel-compatible encryption.

## Quick Start

{{% callout type="info" %}}
**Auto-initialization**: The crypto package automatically initializes from your `.env` file when `CRYPTO_KEY` or `APP_KEY` is set.
{{% /callout %}}

{{< tabs items="Basic Encryption,Encrypting Objects,Key Generation" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/crypto"

func main() {
    // Encrypt data (auto-initialized from .env)
    encrypted, err := crypto.Encrypt("sensitive data")
    if err != nil {
        log.Error("Encryption failed", "error", err)
        return
    }

    // Decrypt data
    plaintext, err := crypto.Decrypt(encrypted)
    if err != nil {
        log.Error("Decryption failed", "error", err)
        return
    }

    fmt.Println(plaintext) // Output: sensitive data
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "encoding/json"
    "github.com/velocitykode/velocity/pkg/crypto"
)

func encryptUserData(user User) (string, error) {
    // Serialize data to JSON
    data, err := json.Marshal(user)
    if err != nil {
        return "", err
    }

    // Encrypt the JSON bytes
    return crypto.EncryptBytes(data)
}

func decryptUserData(encrypted string) (*User, error) {
    // Decrypt to bytes
    data, err := crypto.DecryptBytes(encrypted)
    if err != nil {
        return nil, err
    }

    // Deserialize from JSON
    var user User
    if err := json.Unmarshal(data, &user); err != nil {
        return nil, err
    }

    return &user, nil
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/crypto"

func generateNewKey() error {
    // Generate a new encryption key
    key, err := crypto.GenerateKey()
    if err != nil {
        return err
    }

    // Key is base64 encoded and ready to use
    fmt.Printf("Add this to your .env file:\n")
    fmt.Printf("CRYPTO_KEY=%s\n", key)

    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

Configure encryption through environment variables in your `.env` file:

```env
# Encryption key (required)
CRYPTO_KEY=base64:your-base64-encoded-key-here

# Alternative: Laravel compatibility
APP_KEY=base64:your-base64-encoded-key-here

# Cipher algorithm (optional, defaults to AES-256-CBC)
CRYPTO_CIPHER=AES-256-CBC

# Previous keys for rotation (optional, comma-separated)
CRYPTO_OLD_KEYS=base64:old-key-1,base64:old-key-2
```

### Cipher Options

Velocity supports multiple AES cipher modes:

| Cipher | Key Size | Mode | Authentication |
|--------|----------|------|----------------|
| `AES-128-CBC` | 16 bytes | CBC | HMAC-SHA256 |
| `AES-256-CBC` | 32 bytes | CBC | HMAC-SHA256 |
| `AES-128-GCM` | 16 bytes | GCM | Built-in |
| `AES-256-GCM` | 32 bytes | GCM | Built-in |

**Recommended**: `AES-256-CBC` for Laravel compatibility or `AES-256-GCM` for maximum security.

## API Reference

### Global Functions

```go
// Encrypt encrypts plaintext using the global encryptor
func Encrypt(plaintext string) (string, error)

// EncryptBytes encrypts bytes using the global encryptor
func EncryptBytes(plaintext []byte) (string, error)

// Decrypt decrypts a payload using the global encryptor
func Decrypt(payload string) (string, error)

// DecryptBytes decrypts a payload to bytes using the global encryptor
func DecryptBytes(payload string) ([]byte, error)

// GenerateKey generates a new encryption key for the current cipher
func GenerateKey() (string, error)

// Init initializes the global encryptor with custom configuration
func Init(config Config) error
```

### Custom Encryptor Instances

```go
import "github.com/velocitykode/velocity/pkg/crypto"

func createCustomEncryptor() {
    // Create encryptor with custom configuration
    config := crypto.Config{
        Key:    "base64:your-key-here",
        Cipher: "AES-256-GCM",
        PreviousKeys: []string{
            "base64:old-key-1",
            "base64:old-key-2",
        },
    }

    encryptor, err := crypto.NewEncryptor(config)
    if err != nil {
        log.Error("Failed to create encryptor", "error", err)
        return
    }

    // Use the custom encryptor
    encrypted, _ := encryptor.Encrypt("secret data")
    plaintext, _ := encryptor.Decrypt(encrypted)
}
```

## Key Rotation

Velocity supports seamless key rotation for enhanced security:

```go
// Step 1: Generate a new key
newKey, _ := crypto.GenerateKey()

// Step 2: Update your .env file
// Move current CRYPTO_KEY to CRYPTO_OLD_KEYS
// Set new key as CRYPTO_KEY
```

**Example `.env` after rotation:**
```env
# New key (used for encryption)
CRYPTO_KEY=base64:new-key-here

# Old keys (used for decryption only)
CRYPTO_OLD_KEYS=base64:old-key-1,base64:old-key-2
```

The crypto package will:
1. Always encrypt with the current `CRYPTO_KEY`
2. Attempt decryption with current key first
3. Fall back to previous keys if current key fails
4. Return error if all keys fail

### Re-encrypting Data

```go
func reencryptUserTokens() error {
    // Fetch all encrypted tokens
    var tokens []EncryptedToken
    db.Find(&tokens)

    for _, token := range tokens {
        // Decrypt with old key (automatic fallback)
        plaintext, err := crypto.Decrypt(token.Value)
        if err != nil {
            log.Error("Failed to decrypt", "id", token.ID, "error", err)
            continue
        }

        // Re-encrypt with new key
        newEncrypted, err := crypto.Encrypt(plaintext)
        if err != nil {
            log.Error("Failed to encrypt", "id", token.ID, "error", err)
            continue
        }

        // Update database
        token.Value = newEncrypted
        db.Save(&token)
    }

    return nil
}
```

## Payload Format

Encrypted data uses a structured JSON payload:

### CBC Mode Payload
```json
{
  "iv": "base64-encoded-initialization-vector",
  "value": "base64-encoded-ciphertext",
  "mac": "base64-encoded-hmac-sha256"
}
```

### GCM Mode Payload
```json
{
  "iv": "base64-encoded-nonce",
  "value": "base64-encoded-ciphertext",
  "tag": "base64-encoded-auth-tag"
}
```

The entire payload is base64-URL-encoded for safe storage and transmission.

## Common Use Cases

### Encrypting Sensitive Database Fields

```go
type User struct {
    ID              uint
    Email           string
    EncryptedAPIKey string `orm:"column:api_key"`
}

func (u *User) SetAPIKey(key string) error {
    encrypted, err := crypto.Encrypt(key)
    if err != nil {
        return err
    }
    u.EncryptedAPIKey = encrypted
    return nil
}

func (u *User) GetAPIKey() (string, error) {
    return crypto.Decrypt(u.EncryptedAPIKey)
}
```

### Encrypting Session Data

```go
func encryptSession(data map[string]interface{}) (string, error) {
    // Serialize to JSON
    jsonData, err := json.Marshal(data)
    if err != nil {
        return "", err
    }

    // Encrypt
    return crypto.EncryptBytes(jsonData)
}

func decryptSession(encrypted string) (map[string]interface{}, error) {
    // Decrypt
    jsonData, err := crypto.DecryptBytes(encrypted)
    if err != nil {
        return nil, err
    }

    // Deserialize from JSON
    var data map[string]interface{}
    if err := json.Unmarshal(jsonData, &data); err != nil {
        return nil, err
    }

    return data, nil
}
```

### Encrypting File Contents

```go
func encryptFile(inputPath, outputPath string) error {
    // Read file
    data, err := os.ReadFile(inputPath)
    if err != nil {
        return err
    }

    // Encrypt
    encrypted, err := crypto.EncryptBytes(data)
    if err != nil {
        return err
    }

    // Write encrypted data
    return os.WriteFile(outputPath, []byte(encrypted), 0644)
}

func decryptFile(inputPath, outputPath string) error {
    // Read encrypted file
    encrypted, err := os.ReadFile(inputPath)
    if err != nil {
        return err
    }

    // Decrypt
    data, err := crypto.DecryptBytes(string(encrypted))
    if err != nil {
        return err
    }

    // Write decrypted data
    return os.WriteFile(outputPath, data, 0644)
}
```

## Laravel Compatibility

Velocity's crypto package is fully compatible with Laravel's encryption:

```php
// Laravel (PHP)
$encrypted = encrypt('sensitive data');
```

```go
// Velocity (Go)
encrypted, _ := crypto.Encrypt("sensitive data")
```

Both use the same format and can decrypt each other's payloads when using the same key and cipher.

## Security Best Practices

1. **Use Strong Keys**: Always use `crypto.GenerateKey()` to generate cryptographically secure keys
2. **Rotate Keys Regularly**: Implement periodic key rotation (e.g., every 90 days)
3. **Use GCM for New Projects**: GCM mode provides authenticated encryption
4. **Protect Your Keys**: Never commit `.env` files to version control
5. **Use HTTPS**: Always transmit encrypted data over secure connections
6. **Validate Before Decrypt**: Check data integrity before decryption
7. **Log Failures Carefully**: Don't log plaintext or keys in error messages

## Error Handling

```go
func handleEncryption() {
    encrypted, err := crypto.Encrypt("data")
    if err != nil {
        switch err {
        case crypto.ErrNotInitialized:
            log.Error("Crypto not initialized - check CRYPTO_KEY in .env")
        case crypto.ErrInvalidKey:
            log.Error("Invalid encryption key")
        default:
            log.Error("Encryption failed", "error", err)
        }
        return
    }

    plaintext, err := crypto.Decrypt(encrypted)
    if err != nil {
        switch err {
        case crypto.ErrInvalidPayload:
            log.Error("Invalid encrypted payload format")
        case crypto.ErrDecryptionFailed:
            log.Error("Decryption failed - wrong key or corrupted data")
        default:
            log.Error("Decryption failed", "error", err)
        }
        return
    }

    fmt.Println(plaintext)
}
```

## Testing

```go
func TestEncryption(t *testing.T) {
    // Initialize with test key
    testKey := "base64:" + base64.StdEncoding.EncodeToString(make([]byte, 32))
    crypto.Init(crypto.Config{
        Key:    testKey,
        Cipher: "AES-256-CBC",
    })

    // Test encryption/decryption
    plaintext := "test data"
    encrypted, err := crypto.Encrypt(plaintext)
    assert.NoError(t, err)
    assert.NotEqual(t, plaintext, encrypted)

    decrypted, err := crypto.Decrypt(encrypted)
    assert.NoError(t, err)
    assert.Equal(t, plaintext, decrypted)

    // Test bytes encryption
    data := []byte("binary data")
    encryptedBytes, err := crypto.EncryptBytes(data)
    assert.NoError(t, err)

    decryptedBytes, err := crypto.DecryptBytes(encryptedBytes)
    assert.NoError(t, err)
    assert.Equal(t, data, decryptedBytes)
}
```

## Performance Considerations

- **AES-GCM is faster**: GCM mode typically performs better than CBC
- **Encrypt once**: Cache encrypted values when possible
- **Batch operations**: Group encryption operations to amortize overhead
- **Key size impact**: AES-256 is slightly slower than AES-128 but more secure

### Benchmarks

```
BenchmarkEncrypt-8         50000    25847 ns/op    2048 B/op    12 allocs/op
BenchmarkDecrypt-8         50000    27234 ns/op    2304 B/op    14 allocs/op
BenchmarkEncryptGCM-8      75000    18932 ns/op    1792 B/op    10 allocs/op
BenchmarkDecryptGCM-8      75000    19421 ns/op    1920 B/op    11 allocs/op
```

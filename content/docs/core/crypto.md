---
title: Cryptography
description: Encrypt and decrypt data with AES cipher modes, AAD binding, and key rotation in Velocity.
weight: 50
---

Velocity provides robust encryption utilities for securing sensitive data with support for multiple AES cipher modes, additional-authenticated-data (AAD) binding, and seamless key rotation.

The crypto package exposes an `Encryptor` interface. You construct an encryptor instance with `crypto.NewEncryptor(crypto.Config{...})` and call methods on it; there are no package-level encrypt/decrypt helpers. When you build an application with `velocity.New(...)`, the framework constructs an encryptor from your environment (see [Configuration](#configuration)) and wires it into the components that need it (sessions, cookies, CSRF, encrypted queue payloads).

## Quick Start

{{% callout type="info" %}}
**Construct once, reuse**: Build a single `crypto.Encryptor` with `crypto.NewEncryptor` and share it. The framework already does this for you from your `.env` when you boot an app; the examples below show how to build one yourself for standalone use.
{{% /callout %}}

{{< tabs items="Basic Encryption,Encrypting Objects,Key Generation" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/crypto"

func main() {
    enc, err := crypto.NewEncryptor(crypto.Config{
        Key:    "base64:your-base64-encoded-key-here",
        Cipher: "AES-256-GCM",
    })
    if err != nil {
        log.Error("Failed to build encryptor", "error", err)
        return
    }

    // Encrypt data
    encrypted, err := enc.Encrypt("sensitive data")
    if err != nil {
        log.Error("Encryption failed", "error", err)
        return
    }

    // Decrypt data
    plaintext, err := enc.Decrypt(encrypted)
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
    "github.com/velocitykode/velocity/crypto"
)

func encryptUserData(enc crypto.Encryptor, user User) (string, error) {
    // Serialize data to JSON
    data, err := json.Marshal(user)
    if err != nil {
        return "", err
    }

    // Encrypt the JSON bytes
    return enc.EncryptBytes(data)
}

func decryptUserData(enc crypto.Encryptor, encrypted string) (*User, error) {
    // Decrypt to bytes
    data, err := enc.DecryptBytes(encrypted)
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
import "github.com/velocitykode/velocity/crypto"

func generateNewKey(enc crypto.Encryptor) error {
    // Generate a new encryption key for the encryptor's cipher
    key, err := enc.GenerateKey()
    if err != nil {
        return err
    }

    // Key is base64 encoded ("base64:...") and ready to use
    fmt.Printf("Add this to your .env file:\n")
    fmt.Printf("CRYPTO_KEY=%s\n", key)

    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

{{% callout type="info" %}}
`GenerateKey` is a method on `Encryptor`: it returns a `base64:`-prefixed key sized for that encryptor's cipher (16/24/32 bytes for AES-128/192/256). To mint a key before you have an encryptor, build a throwaway one with the target cipher and call `GenerateKey` on it.
{{% /callout %}}

## Configuration

When you boot an app with `velocity.New(...)`, the framework reads these environment variables from your `.env` and builds the encryptor stored on the app config (`config.Crypto`):

```env
# Encryption key. CRYPTO_KEY takes precedence; if unset, APP_KEY is used.
CRYPTO_KEY=base64:your-base64-encoded-key-here

# Falls back to APP_KEY when CRYPTO_KEY is not set
APP_KEY=base64:your-base64-encoded-key-here

# Cipher algorithm (optional, defaults to AES-256-GCM)
CRYPTO_CIPHER=AES-256-GCM

# Previous keys for rotation (optional, comma-separated)
CRYPTO_OLD_KEYS=base64:old-key-1,base64:old-key-2
```

These map onto the `crypto.Config` fields: `CRYPTO_KEY`/`APP_KEY` to `Key`, `CRYPTO_CIPHER` to `Cipher`, and `CRYPTO_OLD_KEYS` (split on commas) to `PreviousKeys`. The crypto package itself does not read the environment; that wiring lives in the framework's config bootstrap, so a standalone encryptor is always built explicitly via `crypto.NewEncryptor`.

### Cipher Options

Velocity supports AES-128/192/256 in CBC and GCM modes:

| Cipher | Key Size | Mode | Authentication |
|--------|----------|------|----------------|
| `AES-128-CBC` | 16 bytes | CBC | HMAC-SHA256 (encrypt-then-MAC) |
| `AES-192-CBC` | 24 bytes | CBC | HMAC-SHA256 (encrypt-then-MAC) |
| `AES-256-CBC` | 32 bytes | CBC | HMAC-SHA256 (encrypt-then-MAC) |
| `AES-128-GCM` | 16 bytes | GCM | Built-in (AEAD) |
| `AES-192-GCM` | 24 bytes | GCM | Built-in (AEAD) |
| `AES-256-GCM` | 32 bytes | GCM | Built-in (AEAD) |

Cipher names are case-insensitive (upper-cased internally), and an empty `Cipher` defaults to `AES-256-GCM`. The supplied key must decode to exactly the cipher's required raw byte length; an undersized key is rejected with `ErrInvalidKeyLength` rather than stretched (keys are never padded or hashed up to size). Internally the master key is split into distinct encryption and HMAC subkeys via HKDF-SHA256.

**Recommended**: `AES-256-GCM` for new projects (authenticated encryption, the default). Use a CBC mode only if you need interop with existing systems using that cipher; CBC ciphers still authenticate via encrypt-then-MAC and support AAD binding.

## API Reference

### Constructor and config

```go
// NewEncryptor validates the config and returns an Encryptor. Missing keys,
// unsupported ciphers, wrong-length keys, and malformed previous keys are
// all rejected up-front.
func NewEncryptor(config Config) (Encryptor, error)

// Config holds encryption configuration.
type Config struct {
    Key          string   // Primary encryption key (raw or "base64:" encoded)
    PreviousKeys []string  // Previous keys for rotation
    Cipher       string    // Cipher algorithm (empty defaults to AES-256-GCM)
}

// Validate checks that the Config is structurally usable without building a
// driver. Returns ErrInvalidKey (empty key), ErrInvalidCipher (unsupported
// cipher), ErrInvalidKeyLength (wrong key length), or ErrInvalidPreviousKey
// (a malformed/wrong-length rotation key). Consistent with NewEncryptor.
func (c Config) Validate() error
```

### Encryptor interface

```go
type Encryptor interface {
    // Encrypt encrypts plaintext and returns a base64 encoded payload.
    Encrypt(plaintext string) (string, error)

    // EncryptBytes encrypts bytes and returns a base64 encoded payload.
    EncryptBytes(plaintext []byte) (string, error)

    // Decrypt decrypts a base64 encoded payload and returns plaintext.
    Decrypt(payload string) (string, error)

    // DecryptBytes decrypts a base64 encoded payload and returns bytes.
    DecryptBytes(payload string) ([]byte, error)

    // EncryptBytesWithAAD encrypts plaintext and binds aad into the
    // authentication check. GCM folds aad into the AEAD tag; CBC mixes it
    // into the encrypt-then-MAC HMAC under a dedicated domain prefix. aad is
    // NOT persisted; the caller supplies the same aad on decrypt. nil and
    // zero-length aad are equivalent to EncryptBytes.
    EncryptBytesWithAAD(plaintext, aad []byte) (string, error)

    // DecryptBytesWithAAD decrypts a payload produced by EncryptBytesWithAAD.
    // Returns ErrAADMismatch on any authentication failure under the supplied
    // aad (wrong key, wrong aad, tamper, and AAD-vs-no-AAD mixing all collapse
    // to this single error). Returns ErrInvalidPayload for structural defects
    // (empty input, legacy v0 envelope, undersized nonce/tag).
    DecryptBytesWithAAD(payload string, aad []byte) ([]byte, error)

    // GenerateKey generates a new base64-encoded key for the cipher.
    GenerateKey() (string, error)
}
```

### Payload helpers

```go
// Payload is the encrypted wire structure (aliases drivers.Payload).
type Payload = drivers.Payload

// SerializePayload converts a payload to base64url JSON.
func SerializePayload(p *Payload) (string, error)

// DeserializePayload parses a base64url JSON envelope, accepting both v1
// ("v1:"-prefixed) and legacy v0 (bare) envelopes.
func DeserializePayload(encoded string) (*Payload, error)
```

### Sentinel errors

```go
crypto.ErrInvalidKey            // empty key (malformed base64 keys surface the raw decode error)
crypto.ErrInvalidKeyLength      // key does not match the cipher's key size
crypto.ErrInvalidCipher         // unsupported cipher
crypto.ErrInvalidPreviousKey    // a malformed / wrong-length rotation key
crypto.ErrInvalidPayload        // structural envelope defect
crypto.ErrDecrypt               // generic decrypt failure (wrong key/MAC/padding)
crypto.ErrDecryptionFailed      // alias of ErrDecrypt (kept for compatibility)
crypto.ErrAADMismatch           // auth failure on the AAD decrypt path
crypto.ErrLegacyPayloadDisabled // v0 payload rejected when CRYPTO_DISABLE_V0=true
```

Use `errors.Is` against these sentinels; they are re-exported from
`crypto/drivers` (and some hoisted to the `contract` package) under the same
identity so wrapping is transparent. There is no `ErrNotInitialized`: an
encryptor is always built explicitly, so the "not initialized" state cannot
occur.

{{% callout type="info" %}}
**No oracle on the wire**: every cryptographic decrypt failure (wrong key, wrong MAC, bad padding, malformed IV) collapses to the single `ErrDecrypt` sentinel so callers cannot distinguish them via the error message (a padding-oracle precursor). Branch on `errors.Is` and never forward the underlying message to clients. Set `CRYPTO_DEBUG=true` to log the underlying stage server-side.
{{% /callout %}}

### Authenticating with Additional Authenticated Data (AAD)

All AES ciphers support binding extra context into the authentication check via
`EncryptBytesWithAAD` / `DecryptBytesWithAAD`. GCM folds the AAD into the AEAD
tag; CBC mixes it into the encrypt-then-MAC HMAC under a dedicated domain prefix
with an explicit length frame. The AAD is NOT persisted in the payload; the
caller supplies the same AAD on decrypt, and a mismatch fails the check. Pin
ciphertexts to row identity (`team_id|resource_type|resource_id`) so a row's
payload cannot be replayed against a different row even with a correct key.

```go
import "github.com/velocitykode/velocity/crypto"

func storeSecret(enc crypto.Encryptor, teamID, resourceID uint, plaintext []byte) (string, error) {
    aad := fmt.Appendf(nil, "team=%d|resource=secret|id=%d", teamID, resourceID)
    return enc.EncryptBytesWithAAD(plaintext, aad)
}

func loadSecret(enc crypto.Encryptor, teamID, resourceID uint, payload string) ([]byte, error) {
    aad := fmt.Appendf(nil, "team=%d|resource=secret|id=%d", teamID, resourceID)
    plaintext, err := enc.DecryptBytesWithAAD(payload, aad)
    if errors.Is(err, crypto.ErrAADMismatch) {
        // Wrong key, wrong AAD, AAD-vs-no-AAD payload mixing, or ciphertext
        // tamper. The auth check cannot tell them apart. Investigate key
        // rotation, ciphertext integrity, and aad construction together.
        return nil, fmt.Errorf("payload does not bind to (team=%d, secret=%d)", teamID, resourceID)
    }
    return plaintext, err
}
```

Contract:

- Available on all AES ciphers. GCM modes bind AAD into the AEAD tag; CBC
  modes bind it into the encrypt-then-MAC HMAC. There is no cipher that
  rejects the AAD methods (only third-party `Encryptor` implementations that
  cannot authenticate AAD would signal `crypto.ErrInvalidCipher`).
- `nil` AAD and zero-length AAD are equivalent (matching GCM's empty-AAD
  semantics), so an empty AAD produces the same result as `EncryptBytes`.
- Key rotation is honored: `DecryptBytesWithAAD` tries the active key first,
  then each entry in `Config.PreviousKeys` with the same AAD.
- `DecryptBytesWithAAD` accepts only v1 envelopes (payloads produced by
  `EncryptBytesWithAAD`). Legacy v0 payloads are rejected up-front with
  `crypto.ErrInvalidPayload` so a stray pre-v1 payload cannot surface as a
  fake AAD mismatch. Structural defects (undersized nonce or tag) also return
  `crypto.ErrInvalidPayload`.
- Any authentication failure on the AAD path collapses to
  `crypto.ErrAADMismatch` by design. The auth check cannot distinguish wrong
  key, wrong AAD, tamper, or AAD-vs-no-AAD payload mixing.
- AAD is never written to disk. Existing `Encrypt` / `Decrypt` callers are
  unaffected; the wire format for non-AAD payloads is unchanged.

### Custom Encryptor Instances

```go
import "github.com/velocitykode/velocity/crypto"

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
// Step 1: Generate a new key (uses the encryptor's cipher)
newKey, _ := enc.GenerateKey()

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

The encryptor will:
1. Always encrypt with the current key (`CRYPTO_KEY` / `Config.Key`)
2. Attempt decryption with the current key first
3. Fall back to previous keys (`CRYPTO_OLD_KEYS` / `Config.PreviousKeys`) in order
4. Return error if all keys fail

Previous keys are validated when the encryptor is built: a malformed or
wrong-length entry fails `NewEncryptor` with `ErrInvalidPreviousKey` rather
than being silently dropped, so a typo cannot quietly disable rotation.

### Re-encrypting Data

```go
func reencryptUserTokens(enc crypto.Encryptor) error {
    // Fetch all encrypted tokens
    var tokens []EncryptedToken
    db.Find(&tokens)

    for _, token := range tokens {
        // Decrypt with old key (automatic fallback)
        plaintext, err := enc.Decrypt(token.Value)
        if err != nil {
            log.Error("Failed to decrypt", "id", token.ID, "error", err)
            continue
        }

        // Re-encrypt with new key
        newEncrypted, err := enc.Encrypt(plaintext)
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

Every ciphertext is self-describing. The outer string is a version sentinel
followed by a base64url-encoded JSON envelope:

```
v1:<base64url(JSON)>
```

The `v1:` prefix marks the current wire format (the colon cannot appear in
base64 output, so it is unambiguous). The inner JSON fields are individually
base64-encoded:

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

You can inspect a stored ciphertext with `crypto.DeserializePayload`, which
returns the `crypto.Payload` struct and accepts both `v1:`-prefixed and legacy
bare (v0) envelopes.

{{% callout type="info" %}}
**Legacy v0 payloads**: bare (unprefixed) envelopes from before the versioned wire format are still accepted on decrypt for one release cycle (removed in v2.0). A successful v0 decrypt logs a one-shot warning and dispatches a `crypto.legacy_decrypt` event so you can track the rotation window. Set `CRYPTO_DISABLE_V0=true` to reject v0 outright (with `ErrLegacyPayloadDisabled`) once you have confirmed no v0 ciphertexts remain.
{{% /callout %}}

## Common Use Cases

### Encrypting Sensitive Database Fields

```go
type User struct {
    ID              uint
    Email           string
    EncryptedAPIKey string `orm:"column:api_key"`
}

func (u *User) SetAPIKey(enc crypto.Encryptor, key string) error {
    encrypted, err := enc.Encrypt(key)
    if err != nil {
        return err
    }
    u.EncryptedAPIKey = encrypted
    return nil
}

func (u *User) GetAPIKey(enc crypto.Encryptor) (string, error) {
    return enc.Decrypt(u.EncryptedAPIKey)
}
```

### Encrypting Session Data

```go
func encryptSession(enc crypto.Encryptor, data map[string]interface{}) (string, error) {
    // Serialize to JSON
    jsonData, err := json.Marshal(data)
    if err != nil {
        return "", err
    }

    // Encrypt
    return enc.EncryptBytes(jsonData)
}

func decryptSession(enc crypto.Encryptor, encrypted string) (map[string]interface{}, error) {
    // Decrypt
    jsonData, err := enc.DecryptBytes(encrypted)
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
func encryptFile(enc crypto.Encryptor, inputPath, outputPath string) error {
    // Read file
    data, err := os.ReadFile(inputPath)
    if err != nil {
        return err
    }

    // Encrypt
    encrypted, err := enc.EncryptBytes(data)
    if err != nil {
        return err
    }

    // Write encrypted data
    return os.WriteFile(outputPath, []byte(encrypted), 0644)
}

func decryptFile(enc crypto.Encryptor, inputPath, outputPath string) error {
    // Read encrypted file
    encrypted, err := os.ReadFile(inputPath)
    if err != nil {
        return err
    }

    // Decrypt
    data, err := enc.DecryptBytes(string(encrypted))
    if err != nil {
        return err
    }

    // Write decrypted data
    return os.WriteFile(outputPath, data, 0644)
}
```

## Security Best Practices

1. **Use Strong Keys**: Always use `enc.GenerateKey()` to generate cryptographically secure keys
2. **Rotate Keys Regularly**: Implement periodic key rotation (e.g., every 90 days)
3. **Use GCM for New Projects**: GCM mode provides authenticated encryption
4. **Protect Your Keys**: Never commit `.env` files to version control
5. **Use HTTPS**: Always transmit encrypted data over secure connections
6. **Validate Before Decrypt**: Check data integrity before decryption
7. **Log Failures Carefully**: Don't log plaintext or keys in error messages

## Error Handling

Validate configuration up-front when building an encryptor:

```go
func buildEncryptor(cfg crypto.Config) (crypto.Encryptor, error) {
    enc, err := crypto.NewEncryptor(cfg)
    if err != nil {
        switch {
        case errors.Is(err, crypto.ErrInvalidKey):
            log.Error("Missing or empty encryption key")
        case errors.Is(err, crypto.ErrInvalidKeyLength):
            log.Error("Key length does not match cipher")
        case errors.Is(err, crypto.ErrInvalidCipher):
            log.Error("Unsupported cipher")
        case errors.Is(err, crypto.ErrInvalidPreviousKey):
            log.Error("A previous (rotation) key is malformed")
        default:
            log.Error("Failed to build encryptor", "error", err)
        }
        return nil, err
    }
    return enc, nil
}
```

Branch on the sentinels when decrypting:

```go
func handleDecrypt(enc crypto.Encryptor, encrypted string) {
    plaintext, err := enc.Decrypt(encrypted)
    if err != nil {
        switch {
        case errors.Is(err, crypto.ErrInvalidPayload):
            log.Error("Invalid encrypted payload format")
        case errors.Is(err, crypto.ErrDecrypt): // ErrDecryptionFailed is an alias
            log.Error("Decryption failed - wrong key or corrupted data")
        case errors.Is(err, crypto.ErrLegacyPayloadDisabled):
            log.Error("Legacy v0 payload rejected - re-encrypt this value")
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
    // Build an encryptor with a test key
    testKey := "base64:" + base64.StdEncoding.EncodeToString(make([]byte, 32))
    enc, err := crypto.NewEncryptor(crypto.Config{
        Key:    testKey,
        Cipher: "AES-256-GCM",
    })
    assert.NoError(t, err)

    // Test encryption/decryption
    plaintext := "test data"
    encrypted, err := enc.Encrypt(plaintext)
    assert.NoError(t, err)
    assert.NotEqual(t, plaintext, encrypted)

    decrypted, err := enc.Decrypt(encrypted)
    assert.NoError(t, err)
    assert.Equal(t, plaintext, decrypted)

    // Test bytes encryption
    data := []byte("binary data")
    encryptedBytes, err := enc.EncryptBytes(data)
    assert.NoError(t, err)

    decryptedBytes, err := enc.DecryptBytes(encryptedBytes)
    assert.NoError(t, err)
    assert.Equal(t, data, decryptedBytes)
}
```

To verify a third-party `Encryptor` implementation satisfies the full
behavioral contract (round-trip, AAD binding, key rotation, tamper detection),
run it against the executable spec in the `cryptotest` package:

```go
import "github.com/velocitykode/velocity/crypto/cryptotest"

func TestMyEncryptor_Contract(t *testing.T) {
    cryptotest.RunEncryptorContractTests(t, func(t *testing.T) crypto.Encryptor {
        enc, err := crypto.NewEncryptor(crypto.Config{
            Key:    "base64:" + base64.StdEncoding.EncodeToString(make([]byte, 32)),
            Cipher: "AES-256-GCM",
        })
        if err != nil {
            t.Fatalf("NewEncryptor: %v", err)
        }
        return enc
    })
}
```

## Performance Considerations

- **AES-GCM is faster**: GCM mode typically performs better than CBC
- **Encrypt once**: Cache encrypted values when possible
- **Batch operations**: Group encryption operations to amortize overhead
- **Key size impact**: AES-256 is slightly slower than AES-128 but more secure
- **Reuse the encryptor**: subkey derivation (HKDF) happens once at construction, so build the `Encryptor` once and share it rather than per-operation

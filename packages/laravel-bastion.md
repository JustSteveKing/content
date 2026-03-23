---
name: juststeveking/laravel-bastion
description: Stripe-inspired API authentication with environment isolation, granular scopes, and built-in security.
packagist: "https://packagist.org/packages/juststeveking/laravel-bastion"
github: "https://github.com/JustSteveKing/laravel-bastion"
downloads: 45
monthlyDownloads: 4
stars: 107
version: dev-main
updatedAt: 2026-03-09
---

<p align="center">
  
</p>

# Laravel Bastion

<!-- BADGES_START -->
[![PHP Version][badge-php]][php]
[![Latest Version][badge-release]][packagist]
[](https://github.com/JustSteveKing/laravel-bastion/actions/workflows/tests.yml)
[](https://github.com/JustSteveKing/laravel-bastion/actions/workflows/formats.yml)
[](LICENSE)
[![Total Downloads][badge-downloads]][downloads]

[php]: https://php.net
[downloads]: https://packagist.org/packages/juststeveking/laravel-bastion
[packagist]: https://packagist.org/packages/juststeveking/laravel-bastion

[badge-release]: https://img.shields.io/packagist/v/juststeveking/laravel-bastion.svg?style=flat-square&label=release
[badge-php]: https://img.shields.io/packagist/php-v/juststeveking/laravel-bastion.svg?style=flat-square
[badge-downloads]: https://img.shields.io/packagist/dt/juststeveking/laravel-bastion.svg?style=flat-square&colorB=mediumvioletred
<!-- BADGES_END -->

Stripe-inspired API authentication with environment isolation, granular scopes, and built-in security.

## Features

- 🔐 **Stripe-style API Tokens** - Prefixed tokens with environment indicators (`app_test_pk_*`, `app_live_sk_*`)
- 🌍 **Environment Isolation** - Separate test and live environments with automatic validation
- 🎯 **Granular Scopes** - Fine-grained permission control with wildcard support
- 🔑 **Token Types** - Public, Secret, and Restricted keys with different access levels
- 📝 **Audit Logging** - Comprehensive activity tracking for compliance and debugging
- 🪝 **Webhook Support** - Built-in webhook endpoints with signature verification
- 🛡️ **Security First** - Expiration dates and secure token hashing
- ⚡ **Laravel Native** - Built with Laravel conventions and best practices

## Requirements

- PHP 8.4 or higher
- Laravel 12.x

## Installation

Install the package via Composer:

```bash
composer require juststeveking/laravel-bastion
```

Run the installation command:

```bash
php artisan bastion:install
```

This will:
1. Publish the configuration file to `config/bastion.php`
2. Publish the database migrations
3. Optionally run the migrations

### Add the Trait to Your User Model

```php
use JustSteveKing\Bastion\Concerns\HasBastionTokens;

class User extends Authenticatable
{
    use HasBastionTokens;

    // ...
}
```

## Quick Start

### Generate a Token

```php
use JustSteveKing\Bastion\Enums\TokenEnvironment;
use JustSteveKing\Bastion\Enums\TokenType;

$result = $user->createBastionToken(
    name: 'My API Key',
    scopes: ['users:read', 'users:write'],
    environment: TokenEnvironment::Test,
    type: TokenType::Restricted,
);

// Store this securely - it's only shown once!
$token = $result['plainTextToken'];
// Example: app_test_rk_a8Kx7mN2pQ4vW9yB1cD3eF5gH6jK8lM

echo "Token: " . $token;
```

### Protect Routes with Middleware

```php
use JustSteveKing\Bastion\Http\Middleware\AuthenticateToken;

Route::middleware(AuthenticateToken::class)->group(function () {
    Route::get('/api/users', [UserController::class, 'index']);
});

// Require specific scope
Route::middleware([AuthenticateToken::class . ':users:write'])
    ->post('/api/users', [UserController::class, 'store']);
```

### Make Authenticated Requests

```bash
curl -H "Authorization: Bearer app_test_rk_..." \
     https://your-api.com/api/users
```

## Token Types

Bastion supports three token types, inspired by Stripe:

### Public Keys (`pk`)
```php
TokenType::Public
```
- Prefix: `app_{env}_pk_*`
- Limited access, safe for client-side use
- Ideal for JavaScript/mobile apps
- Cannot perform sensitive operations

### Secret Keys (`sk`)
```php
TokenType::Secret
```
- Prefix: `app_{env}_sk_*`
- Full access to all permitted scopes
- Must be kept secure on the server
- Use for backend integrations

### Restricted Keys (`rk`)
```php
TokenType::Restricted
```
- Prefix: `app_{env}_rk_*`
- Scoped access with specific permissions
- Best for third-party integrations
- Follows principle of least privilege

## Environments

Bastion isolates test and production data:

### Test Environment
```php
TokenEnvironment::Test
```
- For development and testing
- Higher rate limits (default: 100/min)
- Can be used in any environment

### Live Environment
```php
TokenEnvironment::Live
```
- For production traffic
- Standard rate limits (default: 60/min)
- Can be restricted from non-production environments (configurable)

## Advanced Features

### Token Rotation

Rotate tokens to create a new token while revoking the old one:

```php
$result = $token->rotate();

// Get the new token (store securely)
$newToken = $result['plainTextToken'];
$newTokenModel = $result['token'];

// The old token is automatically revoked
```

You can also rotate via CLI:

```bash
php artisan bastion:rotate {token-id}
```

### Scopes and Permissions

Bastion uses a flexible scope system with wildcard support:

```php
// Grant specific permissions
$user->createBastionToken(
    name: 'User Manager',
    scopes: ['users:read', 'users:write'],
);

// Use wildcards for category-level access
$user->createBastionToken(
    name: 'Payment API',
    scopes: ['payments:*'], // All payment operations
);

// Full access
$user->createBastionToken(
    name: 'Admin Token',
    scopes: ['*'], // All scopes
);
```

#### Built-in Scope Examples

The package includes example scopes in `ApiScope` enum:

- `users:read`, `users:write`, `users:delete`
- `payments:read`, `payments:create`, `payments:refund`
- `webhooks:read`, `webhooks:write`
- `*` (admin/full access)

You can define your own scopes - they're just strings following the `resource:action` pattern.

### Webhooks

Create webhook endpoints to receive real-time notifications:

```php
use JustSteveKing\Bastion\Models\WebhookEndpoint;

$result = WebhookEndpoint::createEndpoint([
    'user_id' => $user->id,
    'url' => 'https://your-app.com/webhooks/bastion',
    'events' => ['token.created', 'token.revoked', 'token.used'],
    'environment' => TokenEnvironment::Live,
    'is_active' => true,
]);

// Store the signing secret securely!
$signingSecret = $result['signingSecret'];
// Example: whsec_a8Kx7mN2pQ4vW9yB1cD3eF5gH6jK8lM
```

#### Verifying Webhook Signatures

```php
use JustSteveKing\Bastion\Models\WebhookEndpoint;

Route::post('/webhooks/bastion', function (Request $request) {
    $endpoint = WebhookEndpoint::where('secret_prefix', '...')->first();

    $signature = $request->header('X-Bastion-Signature');
    $timestamp = $request->header('X-Bastion-Timestamp');
    $payload = $request->getContent();

    if (!$endpoint->verifySignature($payload, $signature, (int)$timestamp)) {
        abort(401, 'Invalid signature');
    }

    // Process webhook...
    $event = $request->input('event');
    $data = $request->input('data');

    return response()->json(['received' => true]);
});
```

### Events

Bastion dispatches events for all token lifecycle actions:

```php
use JustSteveKing\Bastion\Events\{
    TokenCreated,
    TokenUsed,
    TokenRevoked,
    TokenRotated,
    TokenExpired
};

// Listen to events in your EventServiceProvider
Event::listen(TokenCreated::class, function (TokenCreated $event) {
    // $event->token - The BastionToken model
    // $event->plainTextToken - The plain text token (only in TokenCreated)
    Log::info('Token created', ['token_id' => $event->token->id]);
});

Event::listen(TokenUsed::class, function (TokenUsed $event) {
    // $event->token
    // $event->ipAddress
    // $event->userAgent
    // $event->endpoint
});

Event::listen(TokenRevoked::class, function (TokenRevoked $event) {
    // $event->token
    // $event->reason
    Mail::to($event->token->user)->send(new TokenRevokedNotification($event));
});
```

### Audit Logging

Enable comprehensive API request auditing by adding the middleware:

```php
use JustSteveKing\Bastion\Http\Middleware\{AuthenticateToken, AuditApiRequest};

Route::middleware([AuthenticateToken::class, AuditApiRequest::class])
    ->group(function () {
        // All requests will be logged
        Route::get('/api/users', [UserController::class, 'index']);
    });
```

Audit logs capture:
- Request method, path, and query parameters
- Response status code and time
- IP address and user agent
- Token and user information
- Request/response bodies (configurable)

Query audit logs:

```php
use JustSteveKing\Bastion\Models\AuditLog;

// Get recent activity for a token
$logs = AuditLog::where('bastion_token_id', $token->id)
    ->latest()
    ->take(100)
    ->get();

// Find failed requests
$failures = AuditLog::where('status_code', '>=', 400)
    ->where('created_at', '>=', now()->subDay())
    ->get();
```

## CLI Commands

Bastion provides several Artisan commands for token management:

### Generate Token

```bash
php artisan bastion:generate {user-id} "Token Name" \
    --environment=test \
    --type=restricted \
    --scopes=users:read --scopes=users:write
```

### Revoke Token

```bash
# Revoke by token ID
php artisan bastion:revoke 123 --reason="Security incident"

# Revoke by token prefix
php artisan bastion:revoke abc12345 --reason="No longer needed"

# Revoke all tokens for a user
php artisan bastion:revoke 0 --all-user=456 --reason="User offboarded"
```

### Rotate Token

```bash
php artisan bastion:rotate {token-id}
```

### Prune Expired Tokens

```bash
# Prune expired tokens
php artisan bastion:prune-tokens --expired

# Prune tokens unused for 90 days
php artisan bastion:prune-tokens --days=90
```

### Prune Old Audit Logs

```bash
# Use config default (90 days)
php artisan bastion:prune-logs

# Custom retention period
php artisan bastion:prune-logs --days=30
```

Schedule these commands in your `app/Console/Kernel.php`:

```php
protected function schedule(Schedule $schedule): void
{
    $schedule->command('bastion:prune-tokens --expired')->daily();
    $schedule->command('bastion:prune-logs')->weekly();
}
```

## Configuration

Publish and edit the configuration file:

```bash
php artisan vendor:publish --tag=bastion-config
```

### Key Configuration Options

```php
return [
    // Table names (customizable)
    'tables' => [
        'tokens' => 'bastion_tokens',
        'audit_logs' => 'bastion_audit_logs',
        'webhooks' => 'bastion_webhook_endpoints',
    ],

    // Token expiration (days)
    'token_expiration_days' => null,

    // Audit log retention (days)
    'audit_log_retention_days' => 90,

    // Rate limits per minute
    'rate_limits' => [
        'test' => 100,
        'live' => 60,
    ],

    // Security settings
    'security' => [
        'prevent_test_tokens_in_production' => true,
        'enable_audit_logging' => true,
        'enable_alerting' => true,
    ],

    // Error response format
    'errors' => [
        'use_rfc7807' => true, // RFC 7807 Problem Details
        'base_url' => 'https://bastion.laravel.com/errors/', // Base for problem type URLs
    ],

    // User model
    'user_model' => App\Models\User::class,
];
```

#### RFC 7807 Base URL

Bastion returns errors in RFC 7807 Problem Details format by default. You can customize the base URL used for the `type` field in error responses:

```php
// config/bastion.php
'errors' => [
    'use_rfc7807' => true,
    'base_url' => 'https://bastion.laravel.com/errors/',
],
```

With this configuration, an unauthenticated request will return a `type` like:

- `https://bastion.laravel.com/errors/token_missing`
- `https://bastion.laravel.com/errors/token_invalid`
- `https://bastion.laravel.com/errors/insufficient_scope`

Adjust `base_url` to point to your own error documentation if desired.

## Security Best Practices

1. **Never log tokens** - Only the HMAC hash is stored in the database
2. **Show tokens once** - Display the plain text token only at creation time
3. **Use HTTPS exclusively** - Always transmit tokens over encrypted connections
4. **Use restricted tokens** - Grant minimum necessary permissions (principle of least privilege)
5. **Set expiration dates** - Especially for temporary integrations
6. **Rotate tokens regularly** - Implement a token rotation policy (e.g., every 90 days)
7. **Monitor audit logs** - Watch for suspicious activity and unusual patterns
8. **Use test tokens in development** - Keep live tokens in production only
9. **Store tokens securely** - Use environment variables or secure vaults (AWS Secrets Manager, HashiCorp Vault)

### Token Security Features

Laravel Bastion implements multiple security layers:

- **HMAC-SHA256 hashing** - Tokens are hashed with your application key
- **Constant-time comparison** - Prevents timing attacks during token lookup
- **Cryptographically secure RNG** - Uses `random_bytes()` for token generation
- **Environment isolation** - Prevents test tokens in production (configurable)
- **Automatic event dispatching** - Monitor all token lifecycle events

### Community Requests
Have a feature idea? [Open an issue](https://github.com/juststeveking/laravel-bastion/issues/new?template=feature_request.md) with the `enhancement` label.

## Out of Scope

Bastion focuses on token-based authentication with scopes and environments. It does not implement:

- IP allowlisting or CIDR-based restrictions
- Domain/host origin restrictions

If you need these controls, add them at your application layer (e.g., trusted proxies, firewall/WAF rules, or custom middleware) alongside Bastion.

---
name: "juststeveking/scenario"
description: "A strictly typed, railway-oriented business logic orchestration engine for PHP and Laravel."
packagist: "https://packagist.org/packages/juststeveking/scenario"
github: "https://github.com/JustSteveKing/scenario"
link: "https://github.com/JustSteveKing/scenario"
tech: ["PHP"]
featured: false
downloads: 1
monthlyDownloads: 1
stars: 3
version: "dev-main"
updatedAt: "2026-04-07"
---

# Scenario: Type-Safe Business Orchestration

**Scenario** is a logic orchestration engine for PHP 8.5+ designed to replace "Fat Services" and messy "Action" patterns with a strictly typed, railway-oriented flow. It's built to bring structure to complex business processes using a type-safe context, saga rollbacks, and a powerful dependency resolution system.

---

## Why Use Scenario?

- **No Magic**: Everything is discovered via Reflection. No unpredictable `__call` or `__get`.
- **Type-Safe Context**: Share data between steps via class-type injection.
- **Saga Pattern**: Automatic rollbacks (`compensate`) if any step fails.
- **Railway Oriented**: Every step returns a `Result` object. Success moves forward; failure stops the line.
- **Middleware**: Wrap scenarios in transactions, telemetry, or custom logging.
- **Step Hooks**: Observe every action as it completes via `onStep`.
- **Recursive**: Compose complex workflows by nesting scenarios within each other.

---

## Installation

```bash
composer require juststeveking/scenario
```

---

## Scaffolding (Laravel Only)

Quickly generate boilerplate for your workflows using the built-in Artisan commands:

```bash
# Create a new Scenario class in app/Scenarios
php artisan make:scenario Order/PlaceOrderScenario

# Create a new Action class
php artisan make:scenario-action Order/Actions/ChargePayment

# Create a new Middleware class
php artisan make:scenario-middleware Order/Middleware/ValidateInventory
```

The commands will automatically resolve the correct namespaces and create the directories if they don't exist.

---

## Getting Started

### 1. Define your Input Data
Create a readonly DTO to represent the starting payload of your scenario.

```php
readonly class RegisterUserData
{
    public function __construct(public string $name, public string $email) {}
}
```

### 2. Create an Action
Implement the `Action` contract. Business logic goes in `handle()`, rollback logic goes in `compensate()`.

```php
use JustSteveKing\Scenario\Contracts\Action;
use JustSteveKing\Scenario\Context\Context;
use JustSteveKing\Scenario\Support\Result;

class CreateUser implements Action
{
    public function handle(RegisterUserData $data): Result
    {
        $user = new User($data->name, $data->email);
        $user->save();

        return Result::success($user); // $user is recorded in Context automatically
    }

    public function compensate(mixed $input, Context $context): void
    {
        $context->get(User::class)?->delete();
    }
}
```

### 3. Define the Scenario
Implement the `Scenario` contract and define the steps in order.

```php
use JustSteveKing\Scenario\Contracts\Scenario;
use JustSteveKing\Scenario\Engine\Blueprint;

class RegistrationScenario implements Scenario
{
    public function build(Blueprint $plan): void
    {
        $plan->add(CreateUser::class)
             ->add(SendWelcomeEmail::class);
    }
}
```

### 4. Run it
Execute the scenario from a controller or service.

```php
use JustSteveKing\Scenario\Scenario;

Scenario::for(RegistrationScenario::class)
    ->run(new RegisterUserData('John Doe', 'john@example.com'))
    ->onSuccess(function (Context $context): void {
        $user = $context->get(User::class);
        // $user is the object returned by CreateUser
    })
    ->onFailure(function (string $error, Context $context): void {
        // $error is the message from Result::failure(...)
        // $context holds any objects recorded before the failure
    });
```

---

## Full API at a Glance

```php
$pending = Scenario::for(RegistrationScenario::class)
    ->through([LoggingMiddleware::class, DatabaseTransactionMiddleware::class]) // optional, outermost first
    ->onStep(function (string $action, Result $result, Context $context): void {
        // fires after every action, success or failure
    })
    ->run(new RegisterUserData('John Doe', 'john@example.com'))
    ->onSuccess(function (Context $context): void {
        // fires once if the whole scenario succeeded
        $user = $context->get(User::class);
    })
    ->onFailure(function (string $error, Context $context): void {
        // fires once if any action returned Result::failure(...)
    });

// Escape hatches — useful in tests or when you need the result outside a callback
$result  = $pending->result();  // ?Result
$context = $pending->context(); // Context
```

---

## Key Concepts

### Dependency Resolution

The engine resolves dependencies for `handle()` methods automatically, checking in this order:

1. The **Scenario Context** — objects returned by previous steps via `Result::success($obj)`.
2. The **Initial Input** passed to `->run()`.
3. The **Action Payload** — values defined alongside the action in the blueprint.
4. The **Laravel Service Container** — for any remaining type-hinted services.

```php
class SendWelcomeEmail implements Action
{
    public function __construct(private Mailer $mailer) {}

    // User comes from Context (returned by the previous CreateUser action).
    // RegisterUserData comes from the initial run() input.
    // Mailer is resolved from the container.
    public function handle(User $user, RegisterUserData $data): Result
    {
        $this->mailer->send($user->email, $data->name);
        return Result::success();
    }

    public function compensate(mixed $input, Context $context): void {}
}
```

See [Context Sharing Example](examples/03-context-sharing.php).

### Saga Rollbacks (Compensation)

If an action returns `Result::failure($message)`, the engine stops and triggers `compensate()` for every previously completed step in reverse order (LIFO). The failing step itself is not compensated.

```php
class CreateOrder implements Action
{
    public function handle(CheckoutData $data): Result
    {
        $order = Order::create($data);
        return Result::success($order);
    }

    public function compensate(mixed $input, Context $context): void
    {
        // Called if a later step fails — undo the order creation
        $context->get(Order::class)?->delete();
    }
}
```

See [Saga Compensation Example](examples/02-saga-compensation.php).

### Middleware

Wrap your scenario in one or more middleware for cross-cutting concerns. Implement the `Middleware` contract and register classes via `->through()`. They wrap execution in the order given — outermost first.

```php
use JustSteveKing\Scenario\Contracts\Middleware;

class MyMiddleware implements Middleware
{
    public function handle(mixed $input, Context $context, Closure $next): Result
    {
        // Before execution
        $result = $next($input, $context);
        // After execution
        return $result;
    }
}

Scenario::for(CheckoutScenario::class)
    ->through([MyMiddleware::class])
    ->run($input);
```

#### Built-in Middleware

Two middleware classes are included out of the box.

**`LoggingMiddleware`** — logs scenario start, completion, and failure via `Psr\Log\LoggerInterface`. In a Laravel application the logger is resolved from the container automatically.

```php
use JustSteveKing\Scenario\Middleware\LoggingMiddleware;

Scenario::for(CheckoutScenario::class)
    ->through([LoggingMiddleware::class])
    ->run($input);
```

Emits `info` on start and success (with `duration_ms`), and `warning` on failure (with `error` and `duration_ms`).

**`DatabaseTransactionMiddleware`** — wraps execution in a database transaction using `Illuminate\Database\ConnectionInterface`. Commits on success, rolls back on failure.

```php
use JustSteveKing\Scenario\Middleware\DatabaseTransactionMiddleware;

Scenario::for(CheckoutScenario::class)
    ->through([DatabaseTransactionMiddleware::class])
    ->run($input);
```

Both can be combined. Place `LoggingMiddleware` outermost so it captures the full duration including transaction overhead:

```php
->through([LoggingMiddleware::class, DatabaseTransactionMiddleware::class])
```

See [Custom Middleware Example](examples/04-middleware.php) and [LoggingMiddleware Example](examples/06-logging-middleware.php).

### Step Hooks (`onStep`)

`onStep` fires a callback after every individual action completes — whether it succeeded or failed. Register it before `->run()` and use it for per-step observability: audit trails, metrics, debugging.

```php
Scenario::for(CheckoutScenario::class)
    ->onStep(function (string $action, Result $result, Context $context): void {
        // $action  — fully-qualified class name of the action that just ran
        // $result  — its Result; check isSuccess() / isFailure()
        // $context — context at this point; on success the action's return
        //            value is already recorded here
    })
    ->run($input);
```

Key behaviours:
- Fires for every action, including actions inside sub-scenarios.
- On **success**: fires after the action's return value is recorded in context.
- On **failure**: fires before saga compensation begins.
- Multiple `onStep` registrations are all called per step, in order — useful for separating concerns:

```php
Scenario::for(CheckoutScenario::class)
    ->onStep(fn($action, $result, $ctx) => Log::info('step', ['action' => $action]))
    ->onStep(fn($action, $result, $ctx) => Metrics::increment('scenario.step'))
    ->run($input);
```

See [onStep Example](examples/07-on-step.php).

### Action Payloads

Pass static configuration to an action directly in the blueprint. This is useful for reusing the same action class with different settings.

```php
class SendNotification implements Action
{
    // 'channel' and 'priority' are matched by parameter name from the payload
    public function handle(string $channel, string $priority): Result
    {
        // send via $channel at $priority...
        return Result::success();
    }

    public function compensate(mixed $input, Context $context): void {}
}

class OrderScenario implements Scenario
{
    public function build(Blueprint $plan): void
    {
        $plan->add(CreateOrder::class)
             ->add(SendNotification::class, ['channel' => 'email', 'priority' => 'high'])
             ->add(SendNotification::class, ['channel' => 'slack', 'priority' => 'low']);
    }
}
```

See [Action Payload Example](examples/05-action-payload.php).

### Sub-Scenarios

Add a scenario class as a step inside another scenario's blueprint. This lets you build complex workflows from smaller, independently testable blocks. Saga compensation works globally across the full tree — if a parent step fails, sub-scenario steps are compensated too.

```php
class ValidationScenario implements Scenario
{
    public function build(Blueprint $plan): void
    {
        $plan->add(ValidateAddress::class)
             ->add(ValidatePaymentMethod::class);
    }
}

class CheckoutScenario implements Scenario
{
    public function build(Blueprint $plan): void
    {
        $plan->add(ValidationScenario::class) // entire sub-scenario runs as one step
             ->add(ReserveInventory::class)
             ->add(ChargePayment::class)
             ->add(SendConfirmation::class);
    }
}
```

### Accessing the Result and Context Directly

The fluent `onSuccess` / `onFailure` callbacks cover most use cases, but `->result()` and `->context()` are available as escape hatches — particularly useful in tests.

```php
$pending = Scenario::for(RegistrationScenario::class)
    ->run(new RegisterUserData('John Doe', 'john@example.com'));

if ($pending->result()->isSuccess()) {
    $user = $pending->context()->get(User::class);
}
```

Note the callback signatures:
- `onSuccess(fn(Context $context): void)` — context holds all objects recorded during the run.
- `onFailure(fn(string $error, Context $context): void)` — error is the message from `Result::failure(...)`, context holds objects recorded before the failure.

---

## Testing Your Scenarios

The library includes built-in test helpers to make asserting against your workflows fluent and clean.

### 1. Faking Scenarios
If you're writing a controller test and want to assert that a scenario was triggered without actually executing all of its actions, you can use `Scenario::fake()`.

```php
use JustSteveKing\Scenario\Scenario;

public function test_it_dispatches_registration_scenario()
{
    Scenario::fake();

    $this->post('/register', [
        'name' => 'John',
        'email' => 'john@example.com',
    ]);

    // Assert it ran at all
    Scenario::assertRan(RegistrationScenario::class);

    // Or assert it ran with specific input
    Scenario::assertRan(RegistrationScenario::class, function ($input) {
        return $input->email === 'john@example.com';
    });
    
    Scenario::assertNotRan(DeleteUserScenario::class);
}
```

### 2. Fluent Assertions
When you are unit testing a specific scenario, you can use the fluent assertions to verify the outcome and the final state of the `Context`.

```php
public function test_registration_scenario_succeeds()
{
    Scenario::for(RegistrationScenario::class)
        ->run(new RegisterUserData('John', 'john@example.com'))
        ->assertPassed()
        ->assertContextHas(User::class)
        ->assertContextHas(User::class, fn(User $user) => $user->email === 'john@example.com');
}

public function test_registration_scenario_fails_on_duplicate_email()
{
    Scenario::for(RegistrationScenario::class)
        ->run(new RegisterUserData('John', 'existing@example.com'))
        ->assertFailed();
}
```

### 3. Action Mocking (Partial Fakes)
Sometimes you want to test the full orchestration of a scenario, but mock out a single step that talks to an external API (like a Payment Gateway). You can use the `mock()` method to force a specific `Result` for an action.

```php
public function test_checkout_handles_payment_failure()
{
    Scenario::for(CheckoutScenario::class)
        ->mock(ChargeCreditCard::class, Result::failure("Card declined."))
        ->run(new CheckoutData())
        ->assertFailed();
}
```

---

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.


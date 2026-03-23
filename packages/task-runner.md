---
name: juststeveking/task-runner
description: A simple PHP task runner for PHP 8
packagist: "https://packagist.org/packages/juststeveking/task-runner"
github: "https://github.com/JustSteveKing/task-runner"
downloads: 0
monthlyDownloads: 0
stars: 2
version: dev-main
updatedAt: 2026-03-09
---

# Task Runner

[](https://github.com/JustSteveKing/task-runner/actions/workflows/tests.yml)

A simple task runner for PHP 8.

## Installation

```bash
$ composer require juststeveking/task-runner
```

## Usage

```php
$runner = Runner::prepare([]);

$task = new AddOne();

$runner->add($task);
$runner->run();
```

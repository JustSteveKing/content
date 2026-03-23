---
name: juststeveking/feed-parser
description: A simple feed parser for PHP with zero dependencies.
packagist: "https://packagist.org/packages/juststeveking/feed-parser"
github: "https://github.com/JustSteveKing/feed-parser"
downloads: 15
monthlyDownloads: 1
stars: 5
version: dev-main
updatedAt: 2026-03-09
---

# Feed Generator

<!-- BADGES_START -->
[![Latest Version][badge-release]][packagist]
[![PHP Version][badge-php]][php]

[![Total Downloads][badge-downloads]][downloads]

[badge-release]: https://img.shields.io/packagist/v/juststeveking/feed-parser.svg?style=flat-square&label=release
[badge-php]: https://img.shields.io/packagist/php-v/juststeveking/feed-parser.svg?style=flat-square
[badge-downloads]: https://img.shields.io/packagist/dt/juststeveking/feed-parser.svg?style=flat-square&colorB=mediumvioletred

[packagist]: https://packagist.org/packages/juststeveking/feed-parser
[php]: https://php.net
[downloads]: https://packagist.org/packages/juststeveking/feed-parser
<!-- BADGES_END -->

A simple feed parser for PHP with zero dependencies.

## Why

Most RSS and Atom parsers I have seen are either too complex or have too many dependencies. This is a simple feed parser that can parse both RSS and Atom feeds, with zero dependencies using a simple `file_get_contents` to fetch the feed itself.

## Installation

```shell
composer require juststeveking/feed-generator
```

## Usage

This package is designed to be super simple to use.

### Parsing Atom Feeds

```php
use JustSteveKing\FeedParser\AtomParser;
use JustSteveKing\FeedParser\FeedIterator;
use JustSteveKing\FeedParser\ValueObjects\AtomEntry;
use JustSteveKing\FeedParser\ValueObjects\AtomFeed;

$iterator = new FeedIterator(
    url: 'https://example.com/feed.atom',
    parser: new AtomParser(),
);

/** @var AtomFeed $item */
foreach ($iterator as $item) {
    echo $item->title(); // The Title of the Feed
    echo $item->link(); // The Link of the Feed
    echo $item->subtitle(); // The Subtitle of the Feed
    echo $item->updated(); // The Updated Date of the Feed
    echo $item->rights(); // The Rights of the Feed
    echo $item->generator(); // The Generator of the Feed

    /** @var AtomEntry $entry */
    foreach ($item->entries() as $entry) {
        echo $entry->title(); // The Title of the Entry
        echo $entry->link(); // The Link of the Entry
        echo $entry->id(); // The ID of the Entry
        echo $entry->updated(); // The Updated Date of the Entry
        echo $entry->summary(); // The Summary of the Entry
        echo $entry->content(); // The Content of the Entry
        echo $entry->author(); // The Author of the Entry
    }
}
```

### Parsing RSS Feeds

```php
use JustSteveKing\FeedParser\RssParser;
use JustSteveKing\FeedParser\FeedIterator;
use JustSteveKing\FeedParser\ValueObjects\RssChannel;
use JustSteveKing\FeedParser\ValueObjects\RssItem;

$iterator = new FeedIterator(
    url: 'https://example.com/feed.rss',
    parser: new RssParser(),
);

/** @var RssChannel $item */
foreach ($iterator as $item) {
    echo $item->title(); // The Title of the Feed
    echo $item->link(); // The Link of the Feed
    echo $item->description(); // The Description of the Feed

    /** @var RssItem $entry */
    foreach ($item->items() as $entry) {
        echo $entry->title(); // The Title of the Entry
        echo $entry->link(); // The Link of the Entry
        echo $entry->guid(); // The GUID of the Entry
        echo $entry->pubDate(); // The Published Date of the Entry
        echo $entry->description(); // The Description of the Entry
        echo $entry->author(); // The Author of the Entry
    }
}
```

## Testing

You can run the tests using the following command:

```shell
composer test
```

## Static Analysis

You can run PHPStan using the following command:

```shell
composer stan
```

## Code Style

You can run Laravel Pint using the following command:

```shell
composer pint
```

## Refactoring

You can run Rector using the following command:

```shell
composer refactor
```

## Credits

- [Steve McDougall](https://github.com/JustSteveKing)
- [All Contributors](https://github.com/JustSteveKing/feed-parser/blob/main/../contributors)

## LICENSE

The MIT License (MIT). Please see [License File](https://github.com/JustSteveKing/feed-parser/blob/main/LICENSE) for more information.

<?php

declare(strict_types=1);

function releaseBackportError(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function releaseBackportVersion(string $version): array
{
    $version = ltrim($version, 'v');
    if (!preg_match('/^\d+(?:\.\d+){2,3}$/', $version)) {
        releaseBackportError("Unsupported package version: {$version}");
    }

    return array_map('intval', explode('.', $version));
}

function releaseBackportAllocateVersion(string $current, array $tags): string
{
    $parts = releaseBackportVersion($current);
    $occupied = [];
    foreach ($tags as $tag) {
        if (is_string($tag) && preg_match('/^v?\d+(?:\.\d+){2,3}$/', $tag)) {
            $occupied[implode('.', releaseBackportVersion($tag))] = true;
        }
    }

    if (count($parts) === 4) {
        do {
            $parts[3]++;
        } while (isset($occupied[implode('.', $parts)]));
        return implode('.', $parts);
    }

    $candidate = $parts;
    $candidate[2]++;
    if (!isset($occupied[implode('.', $candidate)])) {
        return implode('.', $candidate);
    }

    $suffix = 1;
    do {
        $candidate = array_merge($parts, [$suffix++]);
    } while (isset($occupied[implode('.', $candidate)]));

    return implode('.', $candidate);
}

function releaseBackportValidateLockScope(array $before, array $after, string $package): void
{
    $beforePackage = 0;
    $afterPackage = 0;
    foreach (['packages', 'packages-dev'] as $section) {
        foreach (($before[$section] ?? []) as $entry) {
            $beforePackage += (($entry['name'] ?? '') === $package) ? 1 : 0;
        }
        foreach (($after[$section] ?? []) as $entry) {
            $afterPackage += (($entry['name'] ?? '') === $package) ? 1 : 0;
        }
    }
    if ($beforePackage !== 1 || $afterPackage !== 1) {
        releaseBackportError('Backport lock scope requires exactly one affected package entry');
    }
    $normalize = static function (array $lock) use ($package): array {
        unset($lock['content-hash']);
        foreach (['packages', 'packages-dev'] as $section) {
            $lock[$section] = array_values(array_filter(
                $lock[$section] ?? [],
                static fn (array $entry): bool => ($entry['name'] ?? '') !== $package
            ));
        }
        return $lock;
    };
    $before = $normalize($before);
    $after = $normalize($after);
    if ($before !== $after) {
        releaseBackportError('Backport changed an unexpected Composer lock entry');
    }
}

function releaseBackportRepository(array $lock, string $package): string
{
    foreach (['packages', 'packages-dev'] as $section) {
        foreach (($lock[$section] ?? []) as $entry) {
            if (($entry['name'] ?? '') !== $package) {
                continue;
            }
            $url = (string) ($entry['source']['url'] ?? '');
            if (!preg_match('~github\.com[:/]([^/]+/[^/#]+?)(?:\.git)?$~', $url, $match)) {
                releaseBackportError("No GitHub source repository found for {$package}");
            }
            return $match[1];
        }
    }

    releaseBackportError("Package is not present in composer.lock: {$package}");
}

function releaseBackportArguments(array $argv): array
{
    $arguments = [];
    for ($index = 2; $index < count($argv); $index++) {
        if (strpos($argv[$index], '--') !== 0 || !isset($argv[$index + 1])) {
            releaseBackportError('Arguments must use --name value');
        }
        $arguments[substr($argv[$index], 2)] = $argv[++$index];
    }
    return $arguments;
}

if (($argv[1] ?? '') === 'allocate') {
    $arguments = releaseBackportArguments($argv);
    $tags = json_decode((string) file_get_contents($arguments['tags']), true);
    if (!is_array($tags)) {
        releaseBackportError('Tag list must be a JSON array');
    }
    file_put_contents($arguments['output'], releaseBackportAllocateVersion($arguments['current'], $tags) . PHP_EOL);
    exit(0);
}

if (($argv[1] ?? '') === 'repository') {
    $arguments = releaseBackportArguments($argv);
    $lock = json_decode((string) file_get_contents($arguments['lock']), true);
    if (!is_array($lock)) {
        releaseBackportError('Invalid composer.lock');
    }
    file_put_contents($arguments['output'], releaseBackportRepository($lock, $arguments['package']) . PHP_EOL);
    exit(0);
}

if (($argv[1] ?? '') === 'lock-scope') {
    $arguments = releaseBackportArguments($argv);
    $before = json_decode((string) file_get_contents($arguments['before']), true);
    $after = json_decode((string) file_get_contents($arguments['after']), true);
    if (!is_array($before) || !is_array($after)) {
        releaseBackportError('Invalid composer lockfile');
    }
    releaseBackportValidateLockScope($before, $after, $arguments['package']);
    exit(0);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    releaseBackportError('Unknown command');
}

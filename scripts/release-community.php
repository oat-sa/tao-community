<?php

declare(strict_types=1);

function releaseCommunityError(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function releaseCommunityJson(string $path): array
{
    if (!is_file($path)) {
        releaseCommunityError("JSON file does not exist: {$path}");
    }

    $value = json_decode((string) file_get_contents($path), true);
    if (!is_array($value)) {
        releaseCommunityError("Invalid JSON object: {$path}");
    }

    return $value;
}

function releaseCommunityValidateContract(array $input): array
{
    $errors = [];
    $releaseType = $input['release_type'] ?? '';
    if (!in_array($releaseType, ['stable', 'rc', 'lts', 'backport'], true)) {
        $errors[] = 'release_type must be stable, rc, lts, or backport';
    }

    foreach (['source_ref', 'release_version'] as $field) {
        $value = (string) ($input[$field] ?? '');
        if ($value === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/', $value) || strpos($value, '..') !== false) {
            $errors[] = "{$field} is missing or unsafe";
        }
    }

    foreach (['allow_stable_fallback', 'allow_lts_fallback'] as $field) {
        if (!in_array($input[$field] ?? null, [true, false, 'true', 'false', '0', '1', 0, 1], true)) {
            $errors[] = "{$field} must be boolean";
        }
    }

    if ($releaseType === 'backport') {
        foreach (['backport_package', 'backport_source_pr', 'backport_target_branch'] as $field) {
            $value = (string) ($input[$field] ?? '');
            if ($value === '') {
                $errors[] = "{$field} is required for backport releases";
            }
        }
        if (isset($input['backport_package']) && !preg_match('/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/', (string) $input['backport_package'])) {
            $errors[] = 'backport_package is unsafe';
        }
        if (isset($input['backport_target_branch']) && (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/', (string) $input['backport_target_branch']) || strpos((string) $input['backport_target_branch'], '..') !== false)) {
            $errors[] = 'backport_target_branch is unsafe';
        }
        if (isset($input['backport_source_pr']) && !preg_match('/^(?:\d+|https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+)$/', (string) $input['backport_source_pr'])) {
            $errors[] = 'backport_source_pr is unsafe';
        }
    }

    return $errors;
}

function releaseCommunityDirectRequirements(array $composer): array
{
    $requirements = $composer['require'] ?? null;
    if (!is_array($requirements)) {
        releaseCommunityError('composer.json has no require object');
    }

    return $requirements;
}

function releaseCommunityNormalizeTag(string $tag): string
{
    $tag = ltrim($tag, 'v');
    if ($tag === '' || !preg_match('/^\d+(?:\.\d+){2,3}$/', $tag)) {
        releaseCommunityError("Unsupported stable package tag: {$tag}");
    }

    return $tag;
}

function releaseCommunityManifestResults(array $manifest): array
{
    $results = $manifest['package_results'] ?? $manifest['packages'] ?? null;
    if (!is_array($results)) {
        releaseCommunityError('Package manifest must contain package_results');
    }

    $normalized = [];
    foreach ($results as $result) {
        if (!is_array($result) || !isset($result['package'], $result['tag'])) {
            releaseCommunityError('Every package result requires package and tag');
        }
        $package = (string) $result['package'];
        if (!preg_match('/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/', $package)) {
            releaseCommunityError("Invalid package name: {$package}");
        }
        $tag = (string) $result['tag'];
        if (preg_match('/(?:dev|rc|alpha|beta|feature|fix|hotfix)/i', $tag)) {
            $normalized[$package] = ['tag' => $tag, 'version' => $tag];
            continue;
        }
        $version = releaseCommunityNormalizeTag($tag);
        $normalized[$package] = ['tag' => $tag, 'version' => $version];
    }

    return $normalized;
}

function releaseCommunityApplyManifest(array $composer, array $manifest, string $releaseType, bool $allowStableFallback, bool $allowLtsFallback, ?string $backportPackage = null): array
{
    $requirements = releaseCommunityDirectRequirements($composer);
    $results = releaseCommunityManifestResults($manifest);
    $changed = [];

    foreach ($results as $package => $result) {
        if (!array_key_exists($package, $requirements)) {
            continue;
        }

        $tag = $result['tag'];
        $isDevelopment = (bool) preg_match('/^(?:dev-|dev\/|[^0-9]*release)/i', $tag);
        if ($releaseType === 'stable' || $releaseType === 'lts') {
            if ($isDevelopment && !(($releaseType === 'stable' && $allowStableFallback) || ($releaseType === 'lts' && $allowLtsFallback))) {
                releaseCommunityError("Development tag {$tag} is not allowed for {$releaseType}");
            }
            if ($isDevelopment) {
                $fallbackTag = (string) ($result['fallback_tag'] ?? '');
                if ($fallbackTag === '') {
                    releaseCommunityError("Fallback for {$package} must provide a stable package tag");
                }
                $tag = releaseCommunityNormalizeTag($fallbackTag);
            } else {
                $tag = releaseCommunityNormalizeTag($tag);
            }
        }

        if ($backportPackage !== null && $package !== $backportPackage) {
            continue;
        }
        if ($requirements[$package] !== $tag) {
            $requirements[$package] = $tag;
            $changed[] = $package;
        }
    }

    $composer['require'] = $requirements;
    return ['composer' => $composer, 'changed' => $changed];
}

function releaseCommunityValidateScope(array $before, array $after, string $releaseType, ?string $backportPackage = null): void
{
    $beforeRequire = releaseCommunityDirectRequirements($before);
    $afterRequire = releaseCommunityDirectRequirements($after);
    $changed = [];
    foreach (array_unique(array_merge(array_keys($beforeRequire), array_keys($afterRequire))) as $package) {
        if (($beforeRequire[$package] ?? null) !== ($afterRequire[$package] ?? null)) {
            $changed[] = $package;
        }
    }

    if ($releaseType === 'backport' && ($changed !== [$backportPackage])) {
        releaseCommunityError('Backport changed an unexpected direct Composer requirement');
    }
}

function releaseCommunityWriteJson(string $path, array $value): void
{
    file_put_contents($path, json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
}

function releaseCommunityArguments(array $argv): array
{
    $arguments = [];
    for ($index = 2; $index < count($argv); $index++) {
        if (strpos($argv[$index], '--') !== 0 || !isset($argv[$index + 1])) {
            releaseCommunityError('Arguments must use --name value');
        }
        $arguments[substr($argv[$index], 2)] = $argv[++$index];
    }
    return $arguments;
}

$command = $argv[1] ?? '';
if ($command === 'validate') {
    $errors = releaseCommunityValidateContract(releaseCommunityArguments($argv));
    if ($errors !== []) {
        releaseCommunityError(implode('; ', $errors));
    }
    exit(0);
}

if ($command === 'apply') {
    $arguments = releaseCommunityArguments($argv);
    $composerPath = $arguments['composer'] ?? 'composer.json';
    $composer = releaseCommunityJson($composerPath);
    $manifest = releaseCommunityJson($arguments['manifest']);
    $result = releaseCommunityApplyManifest(
        $composer,
        $manifest,
        $arguments['release_type'],
        $arguments['allow_stable_fallback'] === 'true',
        $arguments['allow_lts_fallback'] === 'true',
        $arguments['backport_package'] ?? null
    );
    releaseCommunityWriteJson($composerPath, $result['composer']);
    file_put_contents($arguments['output'], implode(PHP_EOL, $result['changed']) . PHP_EOL);
    exit(0);
}

if ($command === 'scope') {
    $arguments = releaseCommunityArguments($argv);
    releaseCommunityValidateScope(
        releaseCommunityJson($arguments['before']),
        releaseCommunityJson($arguments['after']),
        $arguments['release_type'],
        $arguments['backport_package'] ?? null
    );
    exit(0);
}

if ($command === 'result') {
    $arguments = releaseCommunityArguments($argv);
    releaseCommunityWriteJson($arguments['output'], [
        'repository' => 'oat-sa/tao-community',
        'release_type' => $arguments['release_type'],
        'source_ref' => $arguments['source_ref'],
        'release_version' => $arguments['release_version'],
        'status' => $arguments['status'],
        'branch' => $arguments['branch'],
        'pull_request_url' => $arguments['pull_request_url'] ?? '',
        'tag' => $arguments['tag'] ?? '',
        'release_url' => $arguments['release_url'] ?? '',
        'workflow_run_url' => getenv('GITHUB_SERVER_URL') . '/' . getenv('GITHUB_REPOSITORY') . '/actions/runs/' . getenv('GITHUB_RUN_ID'),
        'package_manifest' => $arguments['package_manifest'] ?? '',
        'failure_reason' => $arguments['failure_reason'] ?? '',
    ]);
    exit(0);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    releaseCommunityError('Unknown command');
}

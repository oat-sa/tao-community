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

    foreach (['source_ref', 'release_version', 'coordinator_correlation_id'] as $field) {
        $value = (string) ($input[$field] ?? '');
        if ($value === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/', $value) || strpos($value, '..') !== false) {
            $errors[] = "{$field} is missing or unsafe";
        }
    }

    if (($input['package_manifest_run_id'] ?? '') !== '' && !preg_match('/^\d+$/', (string) $input['package_manifest_run_id'])) {
        $errors[] = 'package_manifest_run_id is unsafe';
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
    $tag = preg_replace('/^v/', '', $tag) ?? $tag;
    if ($tag === '' || !preg_match('/^\d+(?:\.\d+){2,3}$/', $tag)) {
        releaseCommunityError("Unsupported stable package tag: {$tag}");
    }

    return $tag;
}

function releaseCommunityPackageResult(array $result, string $releaseType): array
{
    foreach (['package', 'repository', 'tag', 'version', 'commit', 'release_url', 'workflow_run_url'] as $field) {
        if (!array_key_exists($field, $result) || !is_string($result[$field])) {
            releaseCommunityError("Every package result requires {$field}");
        }
    }

    $tag = $result['tag'];
    $version = $result['version'];
    $isDevelopment = (bool) preg_match('/^(?:dev-|dev\/|[^0-9]*release)/i', $tag);
    if (!$isDevelopment) {
        $version = releaseCommunityNormalizeTag($tag);
        if (releaseCommunityNormalizeTag($result['version']) !== $version) {
            releaseCommunityError("Package version does not match tag for {$result['package']}");
        }
    } elseif ($releaseType !== 'rc' && $releaseType !== 'lts') {
        releaseCommunityError("Development tag {$tag} is not allowed for {$releaseType}");
    } elseif ($version !== $tag) {
        releaseCommunityError("Package version does not match development tag for {$result['package']}");
    }

    if ($result['repository'] !== $result['package']) {
        releaseCommunityError("Package repository does not match {$result['package']}");
    }
    foreach (['release_url', 'workflow_run_url'] as $urlField) {
        if ($result[$urlField] === '' || !preg_match('~^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(?:releases/tag|actions/runs)/[^\s]+$~', $result[$urlField])) {
            releaseCommunityError("Invalid {$urlField} for {$result['package']}");
        }
    }
    if (!preg_match('/^[a-f0-9]{7,64}$/i', $result['commit'])) {
        releaseCommunityError("Invalid commit for {$result['package']}");
    }

    return ['tag' => $tag, 'version' => $version, 'metadata' => $result];
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
        $normalized[$package] = releaseCommunityPackageResult($result, (string) ($manifest['release_type'] ?? 'stable'));
    }

    return $normalized;
}

function releaseCommunityApplyManifest(array $composer, array $manifest, string $releaseType, bool $allowStableFallback, bool $allowLtsFallback, ?string $backportPackage = null): array
{
    $requirements = releaseCommunityDirectRequirements($composer);
    $manifest['release_type'] = $releaseType;
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

function releaseCommunityResolvePackages(array $composer, array $catalog, string $releaseType, string $sourceRef, bool $allowStableFallback, bool $allowLtsFallback, string $releaseVersion = ''): array
{
    $requirements = releaseCommunityDirectRequirements($composer);
    $catalog = is_array($catalog['packages'] ?? null) ? $catalog['packages'] : $catalog;
    if ($sourceRef === 'develop' && preg_match('/^(\d{4})[.-](\d{2})(?:\.\d+)?$/', $releaseVersion, $version)) {
        $sourceRef = "release-{$version[1]}-{$version[2]}";
    }
    if (!preg_match('/^release-(\d{4}-\d{2})(-lts)?$/', $sourceRef, $line)) {
        releaseCommunityError("Source ref is not a release line: {$sourceRef}");
    }
    $month = $line[1];
    $results = [];
    $fallbacks = [];
    foreach (array_keys($requirements) as $package) {
        if (!isset($catalog[$package]) || !is_array($catalog[$package])) {
            releaseCommunityError("No package release data supplied for {$package}");
        }
        $data = $catalog[$package];
        $repository = (string) ($data['repository'] ?? $package);
        $branches = is_array($data['branches'] ?? null) ? $data['branches'] : [];
        $tags = is_array($data['tags'] ?? null) ? $data['tags'] : [];
        $branchNames = [];
        if ($releaseType === 'lts') {
            $branchNames = ["release-{$month}-lts", "dev-release-{$month}-lts", "release-{$month}", "dev-release-{$month}"];
        } elseif ($releaseType === 'rc') {
            $branchNames = ["dev-release-{$month}", "release-{$month}"];
        }
        if ($releaseType === 'stable') {
            $stableCandidates = [];
            foreach ($tags as $candidate) {
                if (is_array($candidate) && isset($candidate['name'], $candidate['commit']) && !preg_match('/(?:dev|rc|alpha|beta|feature|fix|hotfix)/i', (string) $candidate['name'])) {
                    try {
                        releaseCommunityNormalizeTag((string) $candidate['name']);
                        $stableCandidates[] = $candidate;
                    } catch (Throwable) {
                        continue;
                    }
                }
            }
            usort($stableCandidates, static fn (array $left, array $right): int => version_compare(
                releaseCommunityNormalizeTag((string) $right['name']),
                releaseCommunityNormalizeTag((string) $left['name'])
            ));
            $stable = $stableCandidates[0] ?? null;
            if (!is_array($stable) || !isset($stable['name'], $stable['commit'])) {
                releaseCommunityError("No stable package tag available for {$package}");
            }
            $tag = (string) $stable['name'];
            $results[] = [
                'package' => $package,
                'repository' => $repository,
                'tag' => $tag,
                'version' => releaseCommunityNormalizeTag($tag),
                'commit' => (string) $stable['commit'],
                'release_url' => "https://github.com/{$repository}/releases/tag/{$tag}",
                'workflow_run_url' => (string) ($data['workflow_run_url'] ?? ''),
            ];
            continue;
        }
        $selected = null;
        foreach ($branchNames as $branchName) {
            foreach ($branches as $branch) {
                if (($branch['name'] ?? '') === $branchName) {
                    $selected = [$branchName, (string) ($branch['commit'] ?? '')];
                    break 2;
                }
            }
        }
        if ($selected !== null) {
            if (!preg_match('/^[a-f0-9]{7,64}$/i', $selected[1])) {
                releaseCommunityError("Invalid branch commit for {$package}");
            }
            $results[] = [
                'package' => $package,
                'repository' => $repository,
                'tag' => $selected[0],
                'version' => str_starts_with($selected[0], 'dev-') ? $selected[0] : 'dev-' . $selected[0],
                'commit' => $selected[1],
                'release_url' => "https://github.com/{$repository}/tree/{$selected[0]}",
                'workflow_run_url' => (string) ($data['workflow_run_url'] ?? ''),
            ];
            continue;
        }
        $allowFallback = $releaseType === 'lts' ? $allowLtsFallback : $allowStableFallback;
        if (!$allowFallback || $releaseType === 'stable') {
            releaseCommunityError("No matching {$releaseType} release branch for {$package}");
        }
        $stable = null;
        foreach ($tags as $candidate) {
            if (is_array($candidate) && isset($candidate['name'], $candidate['commit']) && !preg_match('/(?:dev|rc|alpha|beta|feature|fix|hotfix)/i', (string) $candidate['name'])) {
                $stable = $candidate;
                break;
            }
        }
        if (!is_array($stable) || !isset($stable['name'], $stable['commit'])) {
            releaseCommunityError("No stable fallback available for {$package}");
        }
        $tag = (string) $stable['name'];
        $version = releaseCommunityNormalizeTag($tag);
        $results[] = [
            'package' => $package,
            'repository' => $repository,
            'tag' => $tag,
            'version' => $version,
            'commit' => (string) $stable['commit'],
            'release_url' => "https://github.com/{$repository}/releases/tag/{$tag}",
            'workflow_run_url' => (string) ($data['workflow_run_url'] ?? ''),
        ];
        $fallbacks[] = [
            'package' => $package,
            'reason' => "No matching {$releaseType} release branch; used latest stable tag",
            'tag' => $tag,
        ];
    }
    return ['release_type' => $releaseType, 'package_results' => $results, 'fallbacks' => $fallbacks];
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

function releaseCommunityValidateLock(array $lock, array $manifest): void
{
    $locked = [];
    foreach (['packages', 'packages-dev'] as $section) {
        foreach ($lock[$section] ?? [] as $entry) {
            if (isset($entry['name'])) {
                $locked[$entry['name']] = $entry;
            }
        }
    }
    foreach ($manifest['package_results'] ?? [] as $result) {
        $package = (string) ($result['package'] ?? '');
        if (!isset($locked[$package])) {
            continue;
        }
        $entry = $locked[$package];
        $expectedVersion = (string) ($result['version'] ?? '');
        $actualVersion = (string) ($entry['version'] ?? '');
        if ($expectedVersion !== $actualVersion && ltrim($expectedVersion, 'v') !== ltrim($actualVersion, 'v')) {
            releaseCommunityError("Composer lock version mismatch for {$package}");
        }
        if (($result['commit'] ?? '') !== '' && ($entry['source']['reference'] ?? '') !== $result['commit']) {
            releaseCommunityError("Composer lock commit mismatch for {$package}");
        }
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

if ($command === 'resolve') {
    $arguments = releaseCommunityArguments($argv);
    $composer = releaseCommunityJson($arguments['composer']);
    $catalog = releaseCommunityJson($arguments['catalog']);
    releaseCommunityWriteJson($arguments['output'], releaseCommunityResolvePackages(
        $composer,
        $catalog,
        $arguments['release_type'],
        $arguments['source_ref'],
        $arguments['allow_stable_fallback'] === 'true',
        $arguments['allow_lts_fallback'] === 'true',
        $arguments['release_version'] ?? ''
    ));
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

if ($command === 'lock-validate') {
    $arguments = releaseCommunityArguments($argv);
    releaseCommunityValidateLock(
        releaseCommunityJson($arguments['lock']),
        releaseCommunityJson($arguments['manifest'])
    );
    exit(0);
}

if ($command === 'result') {
    $arguments = releaseCommunityArguments($argv);
    $packageResults = [];
    if (($arguments['package_manifest'] ?? '') !== '' && is_file($arguments['package_manifest'])) {
        $manifest = json_decode((string) file_get_contents($arguments['package_manifest']), true);
        if (is_array($manifest) && is_array($manifest['package_results'] ?? null)) {
            $packageResults = $manifest['package_results'];
        }
    }
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
        'coordinator_correlation_id' => $arguments['coordinator_correlation_id'],
        'package_manifest' => $arguments['package_manifest'] ?? '',
        'package_results' => $packageResults,
        'failure_reason' => $arguments['failure_reason'] ?? '',
    ]);
    exit(0);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    releaseCommunityError('Unknown command');
}

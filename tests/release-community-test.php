<?php

declare(strict_types=1);

require_once __DIR__ . '/../scripts/release-community.php';

function testAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$composer = ['require' => ['oat-sa/generis' => '15.19.2', 'oat-sa/tao-core' => '50.10.11']];
$manifest = ['package_results' => [
    ['package' => 'oat-sa/generis', 'repository' => 'oat-sa/generis', 'tag' => 'v15.19.3', 'version' => '15.19.3', 'commit' => str_repeat('a', 40), 'release_url' => 'https://github.com/oat-sa/generis/releases/tag/v15.19.3', 'workflow_run_url' => 'https://github.com/oat-sa/generis/actions/runs/1'],
    ['package' => 'oat-sa/not-direct', 'repository' => 'oat-sa/not-direct', 'tag' => 'v1.0.0', 'version' => '1.0.0', 'commit' => str_repeat('b', 40), 'release_url' => 'https://github.com/oat-sa/not-direct/releases/tag/v1.0.0', 'workflow_run_url' => 'https://github.com/oat-sa/not-direct/actions/runs/2'],
]];
$result = releaseCommunityApplyManifest($composer, $manifest, 'stable', false, false);
testAssert($result['composer']['require']['oat-sa/generis'] === '15.19.3', 'v prefix should be normalized');
testAssert($result['composer']['require']['oat-sa/tao-core'] === '50.10.11', 'unlisted direct requirement must remain unchanged');
testAssert(count($result['changed']) === 1, 'only direct packages should be changed');

$errors = releaseCommunityValidateContract([
    'release_type' => 'stable',
    'source_ref' => 'release-2026-08',
    'release_version' => '2026.08',
    'coordinator_correlation_id' => 'corr-1',
    'allow_stable_fallback' => 'false',
    'allow_lts_fallback' => 'false',
]);
testAssert($errors === [], 'valid normalized contract should pass');

$errors = releaseCommunityValidateContract([
    'release_type' => 'backport',
    'source_ref' => '../unsafe',
    'release_version' => '2026.08',
    'allow_stable_fallback' => 'false',
    'allow_lts_fallback' => 'false',
]);
testAssert(count($errors) === 5, 'backport and unsafe ref validation should report all missing fields');

$backport = releaseCommunityApplyManifest($composer, ['package_results' => [
    ['package' => 'oat-sa/generis', 'repository' => 'oat-sa/generis', 'tag' => '15.19.3', 'version' => '15.19.3', 'commit' => str_repeat('c', 40), 'release_url' => 'https://github.com/oat-sa/generis/releases/tag/15.19.3', 'workflow_run_url' => 'https://github.com/oat-sa/generis/actions/runs/3'],
]], 'backport', false, false, 'oat-sa/generis');
releaseCommunityValidateScope($composer, $backport['composer'], 'backport', 'oat-sa/generis');
testAssert($backport['composer']['require']['oat-sa/generis'] === '15.19.3', 'backport should update the affected package');

$resolverComposer = ['require' => ['oat-sa/generis' => '15.19.2']];
$catalog = ['packages' => [
    'oat-sa/generis' => [
        'repository' => 'oat-sa/generis',
        'workflow_runs' => [
            str_repeat('0', 40) => 'https://github.com/oat-sa/generis/actions/runs/4',
            str_repeat('d', 40) => 'https://github.com/oat-sa/generis/actions/runs/5',
            str_repeat('e', 40) => 'https://github.com/oat-sa/generis/actions/runs/6',
            str_repeat('f', 40) => 'https://github.com/oat-sa/generis/actions/runs/7',
            str_repeat('1', 40) => 'https://github.com/oat-sa/generis/actions/runs/8',
        ],
        'branches' => [
            ['name' => 'dev-release-2026-08', 'commit' => str_repeat('0', 40)],
            ['name' => 'release-2026-08', 'commit' => str_repeat('d', 40)],
            ['name' => 'dev-release-2026-08-lts', 'commit' => str_repeat('e', 40)],
            ['name' => 'release-2026-08-lts', 'commit' => str_repeat('f', 40)],
        ],
        'tags' => [['name' => 'v15.19.4', 'commit' => str_repeat('1', 40)]],
    ],
]];
$rc = releaseCommunityResolvePackages($resolverComposer, $catalog, 'rc', 'release-2026-08', false, false);
testAssert($rc['package_results'][0]['tag'] === 'dev-release-2026-08', 'RC should prefer the development release branch');
$lts = releaseCommunityResolvePackages($resolverComposer, $catalog, 'lts', 'release-2026-08-lts', false, false);
testAssert($lts['package_results'][0]['tag'] === 'dev-release-2026-08-lts', 'LTS should prefer the stable LTS branch as a Composer development version');
$ltsApplied = releaseCommunityApplyManifest($resolverComposer, $lts, 'lts', false, false);
testAssert($ltsApplied['composer']['require']['oat-sa/generis'] === 'dev-release-2026-08-lts', 'LTS branch results should be accepted by manifest application');
$stable = releaseCommunityResolvePackages($resolverComposer, $catalog, 'stable', 'release-2026-08', false, false);
testAssert($stable['package_results'][0]['tag'] === 'v15.19.4', 'stable should use the latest stable tag');
$derived = releaseCommunityResolvePackages($resolverComposer, $catalog, 'rc', 'develop', false, false, '2026.08');
testAssert($derived['package_results'][0]['tag'] === 'dev-release-2026-08', 'develop should derive the release line from the release version');
releaseCommunityValidateLock(
    ['packages' => [['name' => 'oat-sa/generis', 'version' => '15.19.3', 'source' => ['reference' => 'abc123']]]],
    ['package_results' => [['package' => 'oat-sa/generis', 'version' => '15.19.3', 'commit' => 'abc123']]]
);
$caseSensitiveRepository = releaseCommunityManifestResults(['package_results' => [[
    'package' => 'oat-sa/generis', 'repository' => 'OAT-SA/Generis', 'tag' => 'v15.19.3', 'version' => '15.19.3',
    'commit' => str_repeat('a', 40), 'release_url' => 'https://github.com/OAT-SA/Generis/releases/tag/v15.19.3',
    'workflow_run_url' => 'https://github.com/OAT-SA/Generis/actions/runs/9',
]]]);
testAssert($caseSensitiveRepository['oat-sa/generis']['metadata']['repository'] === 'OAT-SA/Generis', 'GitHub repository casing should be accepted');
testAssert(releaseCommunityBoolean('1') && !releaseCommunityBoolean('0'), 'boolean CLI values should be coerced consistently');

$composerPath = tempnam(sys_get_temp_dir(), 'composer-');
$manifestPath = tempnam(sys_get_temp_dir(), 'manifest-');
$outputPath = tempnam(sys_get_temp_dir(), 'output-');
file_put_contents($composerPath, json_encode($resolverComposer));
file_put_contents($manifestPath, json_encode(['package_results' => [['package' => 'oat-sa/generis', 'tag' => 'v15.19.3']]]));
$command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../scripts/release-community.php') . ' apply --composer ' . escapeshellarg($composerPath) . ' --manifest ' . escapeshellarg($manifestPath) . ' --release_type stable --allow_stable_fallback false --allow_lts_fallback false --output ' . escapeshellarg($outputPath);
exec($command, $unusedOutput, $exitCode);
testAssert($exitCode !== 0, 'incomplete package metadata should be rejected');
@unlink($composerPath);
@unlink($manifestPath);
@unlink($outputPath);

echo "release-community tests passed\n";

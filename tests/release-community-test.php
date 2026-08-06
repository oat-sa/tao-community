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
    ['package' => 'oat-sa/generis', 'tag' => 'v15.19.3'],
    ['package' => 'oat-sa/not-direct', 'tag' => 'v1.0.0'],
]];
$result = releaseCommunityApplyManifest($composer, $manifest, 'stable', false, false);
testAssert($result['composer']['require']['oat-sa/generis'] === '15.19.3', 'v prefix should be normalized');
testAssert($result['composer']['require']['oat-sa/tao-core'] === '50.10.11', 'unlisted direct requirement must remain unchanged');
testAssert(count($result['changed']) === 1, 'only direct packages should be changed');

$errors = releaseCommunityValidateContract([
    'release_type' => 'stable',
    'source_ref' => 'release-2026-08',
    'release_version' => '2026.08',
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
testAssert(count($errors) === 4, 'backport and unsafe ref validation should report all missing fields');

$backport = releaseCommunityApplyManifest($composer, ['package_results' => [
    ['package' => 'oat-sa/generis', 'tag' => '15.19.3'],
]], 'backport', false, false, 'oat-sa/generis');
releaseCommunityValidateScope($composer, $backport['composer'], 'backport', 'oat-sa/generis');
testAssert($backport['composer']['require']['oat-sa/generis'] === '15.19.3', 'backport should update the affected package');

echo "release-community tests passed\n";

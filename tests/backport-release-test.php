<?php

declare(strict_types=1);

require_once __DIR__ . '/../scripts/backport-release.php';

function backportTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

backportTestAssert(
    releaseBackportAllocateVersion('16.1.2', ['v16.1.2', '16.1.2.1']) === '16.1.3',
    'free patch version should be selected'
);
backportTestAssert(
    releaseBackportAllocateVersion('16.1.2', ['v16.1.3']) === '16.1.2.1',
    'occupied patch should use the first free four-part version'
);
backportTestAssert(
    releaseBackportAllocateVersion('16.1.2.1', ['v16.1.2.1']) === '16.1.2.2',
    'four-part versions should increment their suffix'
);
backportTestAssert(
    releaseBackportAllocateVersion('16.1.2.1', ['v16.1.2.2']) === '16.1.2.3',
    'four-part version allocation should skip occupied results'
);
releaseBackportValidateLockScope(
    ['content-hash' => 'before', 'packages' => [['name' => 'oat-sa/generis', 'version' => '15.19.2'], ['name' => 'oat-sa/other', 'version' => '1.0.0']]],
    ['content-hash' => 'after', 'packages' => [['name' => 'oat-sa/generis', 'version' => '15.19.3'], ['name' => 'oat-sa/other', 'version' => '1.0.0']]],
    'oat-sa/generis'
);
backportTestAssert(
    releaseBackportRepository(['packages' => [['name' => 'oat-sa/generis', 'source' => ['url' => 'https://github.com/oat-sa/generis.git']]]], 'oat-sa/generis') === 'oat-sa/generis',
    'lock metadata should resolve the package repository'
);

echo "backport-release tests passed\n";

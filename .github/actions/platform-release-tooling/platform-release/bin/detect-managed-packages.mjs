#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { parseArgs, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import { managedPrefixes } from '../lib/config.js';

const args = parseArgs(process.argv);
const path = args['composer-json'] ?? 'composer.json';
const packages = new ComposerPackages();
const composer = packages.read(path);
const managed = packages.managedRequire(composer);
const json = `${JSON.stringify(managed, null, 4)}\n`;

if (args.output && args.output !== 'true') {
  writeFileSync(args.output, json);
} else {
  out(json.trimEnd());
}

const names = Object.keys(managed);
writeGithubOutput({
  count: String(names.length),
  packages: names.join(','),
  prefixes: managedPrefixes().join(','),
});
out(`Managed packages (${names.length}): ${names.join(', ')}`);
out(`Detection rule: composer.json require entries matching prefixes: ${managedPrefixes().join(', ')}`);

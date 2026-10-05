#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { parseArgs, requireArg, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';

const args = parseArgs(process.argv);
const oldPath = requireArg(args, 'old-composer-json');
const newPath = requireArg(args, 'new-composer-json');
const packages = new ComposerPackages();
const diff = packages.diffManaged(packages.read(oldPath), packages.read(newPath));
const json = `${JSON.stringify(diff, null, 4)}\n`;

if (args.output && args.output !== 'true') {
  writeFileSync(args.output, json);
} else {
  out(json.trimEnd());
}

writeGithubOutput({
  changed_count: String(diff.length),
  has_changes: diff.length > 0 ? 'true' : 'false',
});
out(`Detected ${diff.length} managed package version change(s).`);

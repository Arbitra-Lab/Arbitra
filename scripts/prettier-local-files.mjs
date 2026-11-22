import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [workspace, ...stagedFiles] = process.argv.slice(2);
if (!workspace) {
  throw new Error('Usage: prettier-local-files.mjs <workspace> <file...>');
}

const workspaceRoot = path.resolve(workspace);
const files = stagedFiles
  .map((file) => path.relative(workspaceRoot, path.resolve(file)))
  .filter((file) => !file.startsWith('..') && !path.isAbsolute(file));

if (files.length === 0) {
  process.exit(0);
}

execFileSync('pnpm', ['--dir', workspace, 'exec', 'prettier', '--write', ...files], {
  stdio: 'inherit',
});

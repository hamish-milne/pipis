// A one-off: publishes an empty placeholder for the package, because npm only lets you configure Trusted Publishing on a package that
// exists. Run it once, logged in to npm as an owner (`npm login`), then add the trusted publisher on the package's settings page.
//   node packages/pipis/tools/publish-placeholder.ts --dry-run    shows what would be published
//   node packages/pipis/tools/publish-placeholder.ts              publishes (npm asks for your one-time password if you have 2FA)
// The placeholder is a prerelease under its own `placeholder` tag, so it is never what `npm install pipis` picks, and a real release
// from CI is a later version. Delete this file once it has been used.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dry = process.argv.includes('--dry-run');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dev = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name: string = dev.name;
const version = '0.0.1-placeholder.0';

const dir = mkdtempSync(join(tmpdir(), `${name}-placeholder-`));
try {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version,
        description: `Placeholder for ${name}; the real releases are published from CI.`,
        license: dev.license,
        repository: dev.repository,
        homepage: dev.homepage,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, 'README.md'),
    `# ${name}\n\nThis is a placeholder. See ${dev.homepage.replace(/#readme$/, '')} for the real package.\n`,
  );
  console.log(`${dry ? 'would publish' : 'publishing'} ${name}@${version} (tag placeholder)`);
  execFileSync('npm', ['publish', '--tag', 'placeholder', '--access', 'public', ...(dry ? ['--dry-run'] : [])], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const [, , version] = process.argv;

if (!version || !isValidVersionFormat(version)) {
  console.error('Please provide a version as an argument.');
  process.exit(1);
}

// Check if git directory is dirty
if (isGitDirty()) {
  console.error(
    'Your git working directory has uncommitted changes. Please commit or stash them before running this script.',
  );
  process.exit(1);
}

const workspacesRoot = join(__dirname, '..', 'packages');

const dirs = readdirSync(workspacesRoot, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

let filesChanged = false;

dirs.forEach((dir) => {
  const packagePath = join(workspacesRoot, dir, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = require(packagePath);
    pkg.version = version;
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    filesChanged = true;
  }
});

if (filesChanged) {
  try {
    execSync(`git add -A && git commit -m "Bump version to ${version}"`);
    execSync(`git tag -a v${version} -m "release v${version}"`);
    execSync(`git push origin v${version}`);
    execSync(`git push origin HEAD --tags`);
    console.log(`Committed and tagged version ${version}.`);
    console.log(
      `Visit https://github.com/bangle-io/nalanda/releases/new?tag=v${version} to add release notes.`,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error committing or tagging the version:', error.message);
    } else {
      throw error;
    }
    process.exit(1);
  }
}

function isValidVersionFormat(version: string) {
  const regex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
  return regex.test(version);
}

function isGitDirty() {
  const output = execSync('git status --porcelain').toString();
  return !!output.trim(); // returns true if the working directory is dirty
}

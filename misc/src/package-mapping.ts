import path from 'node:path';
import fxExtra from 'fs-extra';
import { globby } from 'globby';

const ignores = [
  '!**/node_modules',
  '!**/dist',
  '!**/coverage',
  '!**/lib',
  '!**/.next',
];

type PackageMapping = ReturnType<typeof computePackageMapping>;

const rootPath = path.join(__dirname, '..', '..');

export async function computePackageMapping() {
  const packageNameToPath = new Map<string, string>();
  const pathToPackageName = new Map<string, string>();

  const packagePaths = (
    await globby(['packages/**/package.json', ...ignores], {
      cwd: rootPath,
    })
  ).map((p) => path.join(rootPath, p));

  for (let packagePath of packagePaths) {
    const packageContent = await fxExtra.readFile(packagePath, 'utf8');
    const packageName = JSON.parse(packageContent).name;
    packageNameToPath.set(packageName, path.dirname(packagePath));
    pathToPackageName.set(path.dirname(packagePath), packageName);
  }

  return {
    packageNameToPath,
    pathToPackageName,
  };
}

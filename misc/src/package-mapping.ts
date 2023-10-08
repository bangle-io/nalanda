import path from 'node:path';
import fxExtra from 'fs-extra';
import { globby } from 'globby';
import type { PackageJson } from 'type-fest';
import { cloneDeep, merge } from 'lodash';
const ignores = [
  '!**/node_modules',
  '!**/dist',
  '!**/coverage',
  '!**/lib',
  '!**/.next',
];

export type PackageMapping = Awaited<ReturnType<typeof computePackageMapping>>;

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

    isValidPackageName: (packageName: string) =>
      packageNameToPath.has(packageName),
    updatePackageJson: async (
      packageName: string,
      update: (packageJson: PackageJson) => Record<string, any>,
    ) => {
      const packagePath = packageNameToPath.get(packageName)!;
      const packageJsonPath = path.join(packagePath, 'package.json');

      const packageJson = JSON.parse(
        await fxExtra.readFile(packageJsonPath, 'utf8'),
      );
      const newJSON = update(packageJson);

      const finalJSON = merge(cloneDeep(packageJson), newJSON);

      await fxExtra.writeFile(
        packageJsonPath,
        JSON.stringify(finalJSON, null, 2).trimEnd() + '\n',
      );
    },
  };
}

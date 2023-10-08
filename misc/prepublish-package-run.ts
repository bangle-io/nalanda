import path from 'node:path';
import fxExtra from 'fs-extra';
import { computePackageMapping } from './src/package-mapping';
import type { PackageMapping } from './src/package-mapping';
import {
  currentPackageName,
  currentPackageVersion,
} from './src/current-package-name';
import { rootPath } from './src';

main().catch((error: any) => {
  console.log(`Error prepublish-package-run: ${error.message}`);
  throw error;
});

async function copyReadMe(packageMapping: PackageMapping) {
  const packagePath = packageMapping.packageNameToPath.get(currentPackageName)!;

  await fxExtra.copyFile(
    path.join(rootPath, 'README.md'),
    path.join(packagePath, 'README.md'),
  );

  console.log(packagePath, 'prepublish-package-run copyReadMe');
}

async function updateWorkspacePackageJson(packageMapping: PackageMapping) {
  await packageMapping.updatePackageJson(currentPackageName, (packageJson) => {
    const dependencies: any = Object.fromEntries(
      Object.entries(packageJson.dependencies || {}).map(([key, value]) => {
        if (packageMapping.isValidPackageName(key) && value === 'workspace:*') {
          return [key, currentPackageVersion];
        }

        return [key, value];
      }),
    );

    return {
      ...packageJson,
      dependencies,
    };
  });
}

async function main() {
  console.log('prepublish-package-run currentPackageName', currentPackageName);
  const packageMapping = await computePackageMapping();

  await copyReadMe(packageMapping);

  await updateWorkspacePackageJson(packageMapping);
}

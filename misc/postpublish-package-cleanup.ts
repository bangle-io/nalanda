import path from 'node:path';
import fxExtra from 'fs-extra';
import { PackageMapping, computePackageMapping } from './src/package-mapping';
import {
  currentPackageName,
  currentPackageVersion,
} from './src/current-package-name';

async function main() {
  console.log(
    'postpublish-package-cleanup currentPackageName',
    currentPackageName,
  );
  const packageMapping = await computePackageMapping();

  const packagePath = packageMapping.packageNameToPath.get(currentPackageName)!;

  await fxExtra.remove(path.join(packagePath, 'README.md'));

  await versionCleanup(packageMapping);
}

// revert back to workspace:*
async function versionCleanup(packageMapping: PackageMapping) {
  await packageMapping.updatePackageJson(currentPackageName, (packageJson) => {
    const dependencies: any = Object.fromEntries(
      Object.entries(packageJson.dependencies || {}).map(([key, value]) => {
        if (
          packageMapping.isValidPackageName(key) &&
          value === currentPackageVersion
        ) {
          return [key, 'workspace:*'];
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

main().catch((error: any) => {
  console.log(`Error postpublish-package-cleanup: ${error.message}`);
  throw error;
});

import path from 'node:path';
import fxExtra from 'fs-extra';
import { computePackageMapping } from './src/package-mapping';
import { currentPackageName } from './src/current-package-name';
import { rootPath } from './src';

main().catch((error: any) => {
  console.log(`Error prepublish-package-run: ${error.message}`);
  throw error;
});

async function main() {
  console.log('prepublish-package-run currentPackageName', currentPackageName);
  const packageMapping = await computePackageMapping();

  const packagePath = packageMapping.packageNameToPath.get(currentPackageName)!;

  await fxExtra.copyFile(
    path.join(rootPath, 'README.md'),
    path.join(packagePath, 'README.md'),
  );
}

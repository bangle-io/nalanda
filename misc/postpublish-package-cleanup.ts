import path from 'node:path';
import fxExtra from 'fs-extra';
import { computePackageMapping } from './src/package-mapping';
import { currentPackageName } from './src/current-package-name';

async function main() {
  console.log(
    'postpublish-package-cleanup currentPackageName',
    currentPackageName,
  );
  const packageMapping = await computePackageMapping();

  const packagePath = packageMapping.packageNameToPath.get(currentPackageName)!;

  await fxExtra.remove(path.join(packagePath, 'README.md'));
}

main().catch((error: any) => {
  console.log(`Error postpublish-package-cleanup: ${error.message}`);
  throw error;
});

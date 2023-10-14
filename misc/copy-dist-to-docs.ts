import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fxExtra from 'fs-extra';
import { PackageMapping, computePackageMapping } from './src/package-mapping';

main();

const DOCS_LOCATION = path.join(__dirname, '..', 'documentation', 'dist');

async function main() {
  const packageMapping = await computePackageMapping();

  await copyModuleFile('@nalanda/core', 'nalanda-core', packageMapping);
  await copyModuleFile('@nalanda/react', 'nalanda-react', packageMapping);
}

async function copyModuleFile(
  packageName: string,
  finalFileName: string,
  packageMapping: PackageMapping,
) {
  const packagePath = packageMapping.packageNameToPath.get(packageName);

  if (!packagePath) {
    console.error(`Package path for ${packageName} not found.`);
    return;
  }

  const sourcePath = join(packagePath, 'dist', 'index.mjs');
  const destinationPath = join(DOCS_LOCATION, `${finalFileName}.mjs`);

  if (existsSync(sourcePath)) {
    await fxExtra.copyFile(sourcePath, destinationPath);
    console.log(
      `Copied dist/index.mjs from ${packageName} to ${destinationPath}`,
    );
  } else {
    console.error(`File dist/index.mjs not found in ${packageName}`);
  }
}

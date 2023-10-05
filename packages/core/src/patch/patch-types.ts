import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import prettier from 'prettier';

const patchDir = path.join(__dirname);
const outDir = path.join(__dirname, '..', '..', 'dist');
const patchFilePath = path.join(patchDir, 'types-override.patch');

const targetFile = path.join(outDir, 'index.d.ts');
const targetMFile = path.join(outDir, 'index.d.mts');

async function applyPatch() {
  await formatFile(targetFile);
  await formatFile(targetMFile);

  const cmd = `patch ${targetFile} ${patchFilePath}`;
  const cmd2 = `patch ${targetMFile} ${patchFilePath}`;

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`Applied patch from ${patchFilePath} to ${targetFile}`);
    execSync(cmd2, { stdio: 'inherit' });
    console.log(`Applied patch from ${patchFilePath} to ${targetMFile}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error applying patch: ${error.message}`);
    }
    throw error;
  }
}

async function formatFile(targetFile: string) {
  const fileContent = fs.readFileSync(targetFile, 'utf-8');
  const formatted = await prettier.format(fileContent, {
    parser: 'typescript',
  });
  fs.writeFileSync(targetFile, formatted);
}

void applyPatch();

import { defineConfig } from 'tsup';
import fs from 'node:fs';
import path from 'node:path';

function getChildDirectories(directory: string): string[] {
  const childDirectories: string[] = [];
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      childDirectories.push(file);
    }
  }
  return childDirectories;
}

const topPaths = getChildDirectories(path.join(__dirname, 'src'))
  .filter((dir) => !dir.includes('__tests__'))
  .map((item) => path.basename(item));

export default defineConfig({
  format: ['esm', 'cjs'],
  entry: ['src/index.ts', ...topPaths.map((item) => `src/${item}/index.ts`)],
  splitting: true,
  dts: true,
  clean: true,
  shims: false,
  minify: false,
  external: ['react', 'react', 'react-dom', 'zod'],
});

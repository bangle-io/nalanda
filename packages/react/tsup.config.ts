import { defineConfig } from 'tsup';
import { baseConfig } from 'tsup-config';
import path from 'node:path';
const packagePath = path.join(__dirname);
const rootPath = path.join(packagePath, '..', '..');

export default defineConfig({
  ...baseConfig,
  external: Array.from(
    new Set([
      ...(baseConfig.external || []),
      'react',
      'react-dom',
      '@nalanda/core',
    ]),
  ),
});

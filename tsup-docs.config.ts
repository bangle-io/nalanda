import { defineConfig } from 'tsup';

import baseConfig from './tsup.config';

export default defineConfig({
  ...baseConfig,
  treeshake: true,
  minify: false,
  verbose: true,
  outDir: './documentation/dist/nsm-docs-bundle',
});

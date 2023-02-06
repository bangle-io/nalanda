import { defineConfig } from 'tsup';

export default defineConfig({
  format: ['esm', 'cjs'],
  entry: [
    'src/index.ts',
    'src/react/index.ts',
    'src/sync/index.ts',
    'src/test-helpers/index.ts',
    'src/vanilla/index.ts',
  ],
  splitting: true,
  dts: true,
  clean: true,
  shims: false,
  external: ['react', 'zod'],
});

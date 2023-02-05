import { defineConfig } from 'tsup';

export default defineConfig({
  format: ['esm', 'cjs'],
  entry: ['src/index.ts'],
  splitting: true,
  dts: true,
  clean: true,
  shims: false,
  external: [],
});

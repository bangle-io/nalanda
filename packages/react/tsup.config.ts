import { defineConfig } from 'tsup';
import { baseConfig } from 'tsup-config';

export default defineConfig({
  ...baseConfig,
  external: Array.from(
    new Set([...(baseConfig.external || []), 'react', 'react-dom']),
  ),
});

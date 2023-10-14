import { Sandpack } from '@codesandbox/sandpack-react';
import { sandpackDark } from '@codesandbox/sandpack-themes';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Callout, Tabs, Tab } from 'nextra-theme-docs';

import rawNsmCode from '../../packages/core/dist/index.mjs?raw';
import rawNsmReactCode from '../../packages/react/dist/index.mjs?raw';
import rawUseSyncExternalStoreCode from 'use-sync-external-store/cjs/use-sync-external-store-shim.production.min.js?raw';
import prettier from 'prettier';

import Image from 'next/image';

export function CodeBlockVanilla({
  height,
  children,
}: {
  height?: number;
  children: string;
}) {
  const { theme } = useTheme();
  const code = `
${children.trim()}
  `.trim();

  return (
    <Sandpack
      template="react-ts"
      options={{
        editorHeight: height,
        editorWidthPercentage: 66, // default - 50
      }}
      theme={theme === 'light' ? 'light' : 'dark'}
      files={{
        '/App.tsx': code,
        '/node_modules/use-sync-external-store/shim/package.json': {
          hidden: true,
          code: JSON.stringify({
            name: 'use-sync-external-store/shim',
            main: './index.js',
          }),
        },
        '/node_modules/use-sync-external-store/shim/index.js': {
          hidden: true,
          code: rawUseSyncExternalStoreCode,
        },
        '/node_modules/@nalanda/core/package.json': {
          hidden: true,
          code: JSON.stringify({
            name: '@nalanda/core',
            main: './index.mjs',
          }),
        },
        '/node_modules/@nalanda/core/index.mjs': {
          hidden: true,
          code: rawNsmCode,
        },
        '/node_modules/@nalanda/react/package.json': {
          hidden: true,
          code: JSON.stringify({
            name: '@nalanda/react',
            main: './index.mjs',
          }),
        },
        '/node_modules/@nalanda/react/index.mjs': {
          hidden: true,
          code: rawNsmReactCode,
        },
      }}
    />
  );
}

export function CodeBlock({ children }: { children: string }) {
  const { theme } = useTheme();

  return (
    <Sandpack
      options={{}}
      files={{
        '/App.tsx': {
          // not doing trim causes weird errors
          code: children.trim(),
        },
      }}
      theme={theme === 'light' ? 'light' : 'dark'}
      template={'react-ts'}
    />
  );
}

import {
  Sandpack,
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { sandpackDark } from '@codesandbox/sandpack-themes';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
// @ts-expect-error - no types
import rawNsmCode from '../dist/nsm-docs-bundle/index.mjs?raw';
import prettier from 'prettier';

export function CodeBlockVanilla({ children }: { children: string }) {
  const code = `
${children.trim()}
  `.trim();

  return (
    <Sandpack
      options={{
        layout: 'console',
      }}
      files={{
        '/index.ts': {
          code: `${code}`.trim(),
        },
        '/node_modules/nalanda/package.json': {
          hidden: true,
          code: JSON.stringify({
            name: 'nalanda',
            main: './index.mjs',
          }),
        },
        '/node_modules/nalanda/index.mjs': {
          hidden: true,
          code: rawNsmCode,
        },
      }}
      theme="light"
      template="vanilla-ts"
    />
  );
}
export function CodeBlock({ children }: { children: string }) {
  return (
    <Sandpack
      options={{
        layout: 'console',
      }}
      files={{
        '/App.tsx': {
          // not doing trim causes weird errors
          code: children.trim(),
        },
      }}
      theme="light"
      template={'react-ts'}
    />
  );
}

import { Sandpack } from '@codesandbox/sandpack-react';
import { sandpackDark } from '@codesandbox/sandpack-themes';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
// @ts-expect-error - no types
import rawNsmCode from '../dist/nsm-docs-bundle/index.mjs?raw';
import prettier from 'prettier';

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
      options={{
        layout: 'console',
        editorHeight: height,
        editorWidthPercentage: 70, // default - 50
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
      theme={theme === 'light' ? 'light' : 'dark'}
      template="vanilla-ts"
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

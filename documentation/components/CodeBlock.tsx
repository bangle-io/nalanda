import { useTheme } from 'next-themes';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  SandpackCodeEditor,
  Sandpack,
} from '@codesandbox/sandpack-react';
import { useEffect, useMemo, useState } from 'react';
import { Callout, Tabs, Tab } from 'nextra-theme-docs';
// @ts-expect-error - not worth the effort to fix
import rawNsmCode from '../../packages/core/dist/index.mjs?raw';
// @ts-expect-error - not worth the effort to fix
import rawNsmReactCode from '../../packages/react/dist/index.mjs?raw';

// @ts-expect-error - not worth the effort to fix
import rawUseSyncExternalStoreCode from 'use-sync-external-store/cjs/use-sync-external-store-shim.production.min.js?raw';

const nalandaFiles = {
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
};
export function CodeBlockTabs({
  height,
  closableTabs = true,
  otherSources = {},
  appSource,
}: {
  height?: number | undefined;
  closableTabs: boolean;
  appSource: string;
  otherSources: Record<string, string>;
}) {
  const { theme } = useTheme();
  const code = `
${appSource.trim()}
  `.trim();

  const otherSourcesFiles = useMemo(() => {
    return Object.fromEntries(
      Object.entries(otherSources).map(([key, value]) => {
        return [key, value.trim()];
      }),
    );
  }, [otherSources]);
  return (
    <SandpackProvider
      template="react-ts"
      options={{
        externalResources: [
          'https://cdn.jsdelivr.net/npm/water.css@2/out/water.css',
        ],
      }}
      theme={theme === 'light' ? 'light' : 'dark'}
      files={{
        ...otherSourcesFiles,
        '/App.tsx': code,
        ...nalandaFiles,
      }}
    >
      <SandpackLayout>
        <SandpackCodeEditor
          showTabs
          showLineNumbers={false}
          showInlineErrors
          wrapContent
          closableTabs={closableTabs}
          style={{
            height: height,
          }}
        />
        <SandpackPreview
          style={{
            height: height,
          }}
        />
      </SandpackLayout>
    </SandpackProvider>
  );
}

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
        externalResources: [
          'https://cdn.jsdelivr.net/npm/water.css@2/out/water.css',
        ],
        editorHeight: height,
        editorWidthPercentage: 66, // default - 50
      }}
      theme={theme === 'light' ? 'light' : 'dark'}
      files={{
        '/App.tsx': code,
        ...nalandaFiles,
      }}
    />
  );
}

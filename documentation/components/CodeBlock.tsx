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

export function CodeBlock() {
  return <Sandpack />;
}

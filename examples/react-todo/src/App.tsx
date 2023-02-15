import React from 'react';
import { mergedSlice, useSlice } from './store';

export default function App() {
  const [val, dispatch] = useSlice(mergedSlice);

  return <div>Hello World{''}</div>;
}

import React from 'react';
import { mySlice, useSlice } from './store';

export default function App() {
  const [val, dispatch] = useSlice(mySlice);
  return <div>Hello World{val.val}</div>;
}

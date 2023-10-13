import React from 'react';
import { StoreProvider, createStore, useStore, useTrack } from '@nalanda/react';

import { counterSlice } from './counter-slice';

const store = createStore({
  slices: [counterSlice],
});

export function App() {
  return (
    <StoreProvider store={store}>
      <div>
        <Counter />
        <Increment />
        <Decrement />
      </div>
    </StoreProvider>
  );
}

function Counter() {
  const { counter } = useTrack(counterSlice);
  return <div className="counter">Counter: {counter}</div>;
}

function Increment() {
  const store = useStore();
  return (
    <button
      onClick={() => {
        store.dispatch(counterSlice.incrementCounter());
      }}
    >
      Increment
    </button>
  );
}

function Decrement() {
  const store = useStore();
  return (
    <button
      onClick={() => {
        store.dispatch(counterSlice.decrementCounter());
      }}
    >
      Decrement
    </button>
  );
}

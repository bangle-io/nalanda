import { Button, defaultTheme, Provider } from '@adobe/react-spectrum';
import { StoreProvider, useStore, useTrack, createStore } from '@nalanda/react';

import { counterSlice } from './store/counter-slice';
import React from 'react';

const store = createStore({
  name: 'my-app-store',
  slices: [counterSlice],
});

export function App() {
  const [state, setState] = React.useState(0);

  return (
    <StoreProvider store={store}>
      <Provider theme={defaultTheme}>
        <Button variant="accent" onPress={() => setState(1)}>
          Hello React Spectrum!
        </Button>
      </Provider>
      <Foo />
      <NoTracked />
      <FooTracked />
      <NegCounter />
    </StoreProvider>
  );
}

function Foo() {
  const store = useStore();

  console.log(store.options.name);
  return <div>Foo</div>;
}

function NegCounter() {
  const store = useStore();

  return (
    <div>
      <button
        onClick={() => {
          store.dispatch(counterSlice.incrementNegCounter());
        }}
      >
        neg
      </button>
    </div>
  );
}

function NoTracked() {
  const store = useStore();
  const { counter } = counterSlice.get(store.state);

  return (
    <div>
      <button
        onClick={() => {
          store.dispatch(counterSlice.incrementCounter());
        }}
      >
        increment (NoTracked)
      </button>
      <div>Value {counter}</div>
    </div>
  );
}

function FooTracked() {
  const store = useStore();
  const { counter } = useTrack(counterSlice);

  return (
    <div>
      <button
        onClick={() => {
          store.dispatch(counterSlice.incrementCounter());
        }}
      >
        increment (FooTracked)
      </button>
      <div>Value {counter}</div>
    </div>
  );
}

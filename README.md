<p align="center">
  <a href="https://nalanda.bangle.io">
    <img src="https://raw.githubusercontent.com/bangle-io/nalanda/dev/documentation/public/nalanda.png"
        alt="screen" width="140">
  </a>
</p>

<h1 align="center">
  <br>
 
  <br>
  Nalanda
  <br>
</h1>

<h3 align="center">
Effortlessly Powerful State Management Simple to Start, Designed to Scale.
</h3>

## Features

- **Predictable State Management:** No magic, predictable state management that scales with your app.
- **Performance Optimized:** With explicit dependency management, slices of state only update when necessary, ensuring optimal performance.
- **TypeScript First:** Leverages TypeScript to catch errors at compile-time.
- **Powerful Effects System:** Handle complex logic outside of your UI components.
- **Scalability:** Allows you to break your app into small, testable, and maintainable slices.
- **Framework Agnostic:** Works seamlessly with any framework.

### Installation

```sh
npm i @nalanda/nalanda
```

## Quick Start

### Creating a Slice

Lets start by creating a simple counter slice.

```tsx
import { createKey } from '@nalanda/react';

// key is local helper to define various things related to your slice
const key = createKey('counterSlice', []);

// state fields define the shape of your state
const counter = key.field(0);

// actions dicate how a field/s should be updated
function increment() {
  return counter.update((c) => c + 1);
}

// slice acts as an interface, exposing the chosen fields and actions to
// the rest of the application.
export const counterSlice = key.slice({
  counter,
  increment,
});
```

### Setting up the Store

At the root of your React application create a store and wrap your app with the `StoreProvider` component.

```tsx copy filename="app.tsx"
import { createStore, StoreProvider } from '@nalanda/react';
import { counterSlice } from './counterSlice';

// Set up a global store that comprises of your slices
const store = createStore({
  slices: [counterSlice],
});

ReactDOM.render(
  <StoreProvider store={store}>
    <App />
  </StoreProvider>,
  document.getElementById('root'),
);
```

### Displaying the counter

Now that we have set up the store, we can use the `useSlice` hook to access the state and actions from the slice.

```tsx copy filename="counter.tsx"
import { useTrack, useStore } from '@nalanda/react';
import { counterSlice } from './counterSlice';

export function Counter() {
  // useTrack re-render the component whenever `counter` changes
  const { counter } = useTrack(counterSlice);
  const store = useStore();

  const increment = () => {
    // Dispatch an action to update the slice
    store.dispatch(counterSlice.increment());
  };

  return (
    <div>
      <h1>Counter</h1>
      <p>{counter}</p>
      <button onClick={increment}>increment</button>
    </div>
  );
}
```

### Next steps

- Checkout out our [documentation](https://nalanda.bangle.io) to learn more about Nalanda.
- Checkout some of the [examples](https://nalanda.bangle.io/docs/examples) to see Nalanda in action.

### Contributing

We'd love to have your helping hand on `nalanda`! See [CONTRIBUTING.md](CONTRIBUTING.md).

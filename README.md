<p align="center">
  <a href="https://nalanda.bangle.io">
    <img src="https://raw.githubusercontent.com/bangle-io/nalanda/dev/documentation/public/nalanda.png"
        alt="screen" width="128" >
  </a>
</p>
<h2 align="center">
  Nalanda
</h2>

<p align="center">
Effortlessly Powerful State Management Simple to Start, Designed to Scale.
</p>

<div align="center">
  <a href="https://nalanda.bangle.io/docs">Read the docs</a>
</div>

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

// The key is a local helper used to define various components of your slice.
const key = createKey('counterSlice', []);

// State fields define part of your state.
const counter = key.field(0);

// Actions define how a field/s should be updated.
function increment() {
  return counter.update((c) => c + 1);
}

// A slice serves as an interface, revealing the specified fields
// and actions to the entire application.
export const counterSlice = key.slice({
  counter,
  increment,
});
```

### Setting up the Store

At the root of your React app, set up a store and encapsulate your app with the StoreProvider component:

```tsx copy filename="app.tsx"
import { createStore, StoreProvider } from '@nalanda/react';
import { counterSlice } from './counterSlice';

// Establish a global store incorporating your slices.
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

With the store in place, employ the useSlice hook to access the state and actions from the slice:

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

### Next Steps

- Dive deeper into Nalanda by exploring our [official documentation](https://nalanda.bangle.io).
- View [real-world examples](https://nalanda.bangle.io/docs/examples) to see Nalanda in action.

### Contribute to Nalanda

Your contribution can make `nalanda` even better! If you're interested in lending a hand, please consult our [CONTRIBUTING.md](CONTRIBUTING.md) guide.

# Nalanda (WIP)

## React API

### Consuming Slice State

```ts
import { Slice, createUseSliceHook } from 'nalanda';

const store = Store.create({
  slices: [sliceA, sliceB],
});

// Create a hook from your store that can be used in your components
const useSlice = createUseSliceHook(myStore);

function MyComponent() {
  const [state, dispatch] = useSlice(mySlice);
  return <div>{state.counter}</div>;
}
```

### Consuming from multiple slices

When using multiple slices, it can get tiresome to remember which dispatch to use.

```ts
function MyComponent() {
  const [stateA, dispatchA] = useSlice(mySliceA);
  const [stateB, dispatchB] = useSlice(mySliceB);

  return <div>{state.counter}</div>;
}
```

Instead you can create a single dispatch and use it to dispatch actions from all the slices your component uses.

You can also optimize re-renders by selecting only the state you need. Nalanda will automatically only re-render your component when the selected state changes.

```ts
const [{ apple, orange }, dispatch] = useSelectStore(
  [mySliceA, mySliceB],
  (storeState) => {
    return {
      apple: mySliceA.getState(storeState).apple,
      orange: mySliceB.getState(storeState).orange,
    };
  },
);
```

### Using with React context

It is recommended that you define your own hooks, for better typing support.

````tsx
// store.ts
import { Slice, Store } from 'nalanda';
import { sliceA } from './slice-a';
import { sliceB } from './slice-b';

const store = Store.create({
  slices: [sliceA, sliceB],
});

const [storeState, dispatch] = useStoreState();
const val = mySlice.getState(storeState);

export const MyStoreContext = React.createContext(store);

// Wrap your Application with this provider
export function MyStoreProvider({ children }) {
  return (
    <MyStoreContext.Provider value={store}>
    {children}
    </MyStoreContext.Provider>
  );
}

export function useSliceState<SL extends Slice>(sl: SL) {
  const store = useContext(MyStoreContext).current;

}



## Features

- Clean abstractions - you control over the state change. No magic.

## Dependencies

Knowing the dependencies of a slice helps ensure any code is only run when its dependencies are updated. Think of it as React's virtual DOM but without the DOM which is the slowest part of React.

## Selectors

### Accessing other selectors inside a selector

## Syncing across multiple stores

```ts
const mySlice = slice({
  key: 'test-3',
  initState: { name: 'jojo' },
  actions: {
    lowercase: () => (state) => {
      return { ...state, name: state.name.toLocaleLowerCase() };
    },
  },
});

const mainStore = Store.create({
  storeName: 'main-store',
  state: State.create({
    slices: [mySlice],
  }),
});

const workerStore = Store.create({
  storeName: 'worker-store',
  state: State.create({
    slices: [replica(mySlice, { mainStore: 'main-store' })],
  }),
});
````

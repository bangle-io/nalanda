# Nalanda (wip)

Nalanda is state management library designed for high performance, maximum scalability, and ease of use with TypeScript.

```
npm i nalanda
```

## Features

- **Predictable State Management:** No magic, predictable state management that scales with your app.
- **Performance Optimized:** With explicit dependency management, slices of state only update when necessary, ensuring optimal performance.
- **TypeScript First:** Leverages TypeScript to catch errors at compile-time.
- **Powerful Effects System:** Handle complex logic outside of your UI components.
- **Scalability:** Allows you to break your app into small, testable, and maintainable slices.
- **Framework Agnostic:** Works seamlessly with any framework.

## Quick Start

Here is a quick example to get you started:

```ts
import { createSliceKey, createSlice, createStore } from 'nalanda';

const countSliceKey = createSliceKey([], {
  name: 'countSlice',
  state: {
    count: 1,
  },
});

const countSlice = createSlice({
  key: countSliceKey,
  computed: {},
});

const updateCount = countSlice.createAction((count: number) => {
  return countSlice.createTxn((state) => ({
    count: state.count + count,
  }));
});

const store = createStore({
  slices: [countSlice],
});

store.dispatch(updateCount({ count: 5 }));

countSlice.get(store.state); // { count: 5 }
```

## Dependency Management

Nalanda lets you add dependencies to your slices. These slices depend on the data from other slices and update only when necessary.

```ts
const fruitSliceKey = createSliceKey([countSlice], {
  name: 'fruitSlice',
  state: {
    fruit: 'mango',
  },
});
```

## Selectors and Computed State

Selectors allow you to compute values from your state. They are lazy and run only when dependencies change.

```ts
const fruitCount = fruitSliceKey.createSelector((state) => {
  const { count } = countSlice.get(state);
  const { fruit } = fruitSliceKey.get(state);
  return `We have ${count} ${fruit}!`;
});

const fruitSlice = createSlice({
  key: fruitSliceKey,
  computed: {
    fruitCount: fruitCount,
  },
});

fruitSlice.get(store.state); // { fruitCount: 'We have 5 mango!', fruit: 'mango' }

store.dispatch(updateCount({ count: 6 }));

fruitSlice.get(store.state); // { fruitCount: 'We have 6 mango!', fruit: 'mango' }
```

## Type Safety

If you forget to add a dependency to a slice, the TypeScript compiler will catch it as a type error.

```ts
const fruitSliceKey = createSliceKey(
  [], // <-----------  missing countSlice dependency
  {
    name: 'fruitSlice',
    state: {
      fruit: 'mango',
    },
  },
);

const fruitCount = fruitSliceKey.createSelector((state) => {
  const { count } = countSlice.get(state);
  //                           ^ type error: countSlice not in dependency list
});
```

## Effects

The effects system in Nalanda helps you extract complex logic from your UI components. Effects run whenever one of their dependencies change.

```ts
effect(
  {
    // dependencies
    fruit: fruitSlice.pick((s) => s.fruit),
    countSlice: countSlice.pick((s) => s.count),
  },
  ({ fruit, count }, dispatch) => {
    // runs on mount and when fruit changes
    console.log(`We have ${fruit}!`);

    if (fruit === 'mango' && count > 5) {
      dispatch(updateCount(0));
      dispatch(changeFruit({ fruit: 'apple' }));
    }
  },
);
```

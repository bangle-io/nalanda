# Nalanda

Nalanda is a TypeScript-first state management library designed for serious web applications. It provides modern, predictable state management with no magical underpinnings. Nalanda offers high performance through explicit dependency management, allows you to build slices of state that depend on others and only update when necessary.

The library also provides a powerful effects system that enables you to handle complex logic outside of your UI components. It supports breaking down your app into small, testable, and maintainable slices, and is compatible with any framework.

## Installation

To install Nalanda, use the following command in your project directory:

```
npm i nalanda
```

## Features

- **Predictable State Management:** No magic, just modern, understandable state management.
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

const updateCounter = countSlice.createAction(
  ({ count }: { count: number }) => {
    return countSlice.createTxn((state) => {
      return {
        count: state.count + count,
      };
    });
  },
);

const store = createStore({
  slices: [countSlice],
});

store.dispatch(updateCounter({ count: 5 }));

countSlice.get(store.state); // { count: 6 }
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

Selectors are functions that take the state and return a value. The computed state, on the other hand, is a value derived from the state.

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

store.dispatch(updateCounter({ count: 6 }));

fruitSlice.get(store.state); // { fruitCount: 'We have 6 mango!', fruit: 'mango' }
```

## Type Safety

Nalanda is written in TypeScript, which provides type safety. If you forget to add a dependency to a slice, the TypeScript compiler will catch it as a type error.

```ts
const fruitSliceKey = createSliceKey(
  [], // missing countSlice dependency
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
  },
  ({ fruit }, dispatch) => {
    // runs on mount and when fruit changes
    console.log(`We have ${fruit}!`);

    if (fruit === 'mango') {
      dispatch(changeFruit({ fruit: 'apple' }));
    }
  },
);
```

For more examples and usage instructions, please refer to our [Documentation](link-to-docs). Feel free to contribute, raise issues, and suggest improvements on our [GitHub page](link-to-github).

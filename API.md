# Slice

## basic

```ts
slice([], {
  name: 'sliceName',
  state: {
    a: 1,
  },
});
```

## With selectors

```ts
const key = sliceKey([sliceA], {
  name: 'sliceName',
  state: {
    a: 1,
  },
});

const sel0 = key.selector(
  // will have sliceA
  (state) => {
    return key.get(state).z;
  },
  {
    equal: (a, b) => a === b,
  },
);

const sel1 = key.selector(
  // will have sliceA
  (state) => {
    const otherSel = sel0(state);
    const otherSlice = sliceA.get(state);
    return key.get(state).f + otherSlice;
  },
  {
    equal: (a, b) => a === b,
  },
);

const slice = key.slice({
  derivedState: {
    a: sel1,
  },
});
```

# Query

generally prefer using selectors, but we have this for flexibility

```ts
const myQuery = createQuery<StoreState>(({ param: X }) => {
  return (storeState): T => {};
});

key.createQuery(); // <-- like this

const result = myQuery(store.state, { param: 1 });
```

# Actions

Should always be updating the key State and nothing else.
Q: not forcing an action name could be problem with syncing, maybe we can use a counter++ to always have the same name?
and not burden the user with naming actions

- Global NoOp transaction

- Chain transaction or multiple txns

without helpers

```ts
const myAction = slice.action((obj: { x: number }) => {
  return (storeState) => {
    return {
      ...slice.get(storeState),
      x: obj.x,
    };
  };
});

myAction; // (params: P) => Transaction<SliceName, P[]>
```

with helpers

```ts
const myAction = slice.action((obj: { x: number }) => {
  return slice.tx((storeState) => {
    return slice.update(storeState, { x: obj.x });
  });
});

let tx: Transaction = slice.tx((storeState: StoreState): SliceState => {});
```

### Serialization

```ts
const myAction = slice.action(
  z.object({
    x: z.number(),
  }),
  (obj) => {},
);
```

### update helpers

```ts
let result: SliceState = slice.update(
  storeState,
  (sliceState) => ({
    ...sliceState,
    x: obj.x,
  }),
  {
    replace: true,
  },
);

slice.update(storeState, (sliceState) => ({
  // is partial by default
  x: obj.x,
}));

slice.update(storeState, (sliceState) => ({
  // is partial by default
  x: obj.x,
}));
// selector updates are ignored
slice.update(storeState, (sliceState) => ({
  x: obj.x,
  selectorA: 2, // ignored
}));
```

# Operations

```ts
const op = createOp<Store<SlA>>((obj: { x: number }) => {
  return (store): void => {
    const valA = sliceA.get(store);
    const valB = sliceB.get(store);

    dispatch(someAction);
  };
});

dispatch(op(param));
```

## Serialization of operation

```ts
const op = createSerialOp<Store<SlA>>(z.object({ som: z.string() }), (obj) => {
  return (key, dispatch): void => {
    dispatch(someAction);
  };
});

dispatch(op(param));
```

# Effects

Using auto dependency thing

```ts
effect((store) => {
  store.name('myEffect'); // or use function name

  const valA = sliceA.track.foo(store, { isEqual }); // this will be tracked
  const valT = sliceA.track(store, (val) => val.t, { isEqual }); // this will be selective tracked, when t changes

  const valB = sliceB.get(store.state); // this will be un-tracked

  cleanup(store, () => {});
  cleanup(store, () => {}); // can have multiple

  store.dispatch(someAction);
});
```

## Effect Async

- When a new effect runs, previous runs dispatch become no-op

```ts
effect(async (store) => {
  const valT = sliceA.track.foo(); // this will be selective tracked, when t changes

  const abort = new AbortController();
  const data = await fetch('someurl');

  const valC = sliceB.track(store); // TODO: should this be tracked?

  cleanup(store, () => {
    abort.abort();
  });

  store.dispatch(someAction);
});
```

## Typings

By default dispatch can be `any`, but they can provide a store type if they want

```ts
store.effect(() => {});

// or

effect<Store<SliceA>>((store) => {
  dispatch(someAction); // dispatch will be typed
});
```

## API

```ts
effect(cb);
effect(cb, opts);

let ef = effect();
ef.disable();
type Opts = {
  autoRegister: boolean; // default true
};
```

## Refs

Refs that can be shared with other effects

```ts
const getMyRef = ref(false);

effect((store) => {
  const myRef = getMyRef(store);
});
```

## Other features

- allow store to throw error if effects donot have name

- we should follow angular style here to allow for cleanup, so that async await can work.
  - When an effect is terminated, the dispatch function should become a no-op. This should be customizable if someone
    wants to not cancel the effect on a new trigger.
- running it once

```ts
effect((store) => {
  store.cleanup(() => {});
});
```

# Readonly clone of slice

This will help with the worker sync in an elegant way.

we can also allow to merge multiple slices into one readonly slice

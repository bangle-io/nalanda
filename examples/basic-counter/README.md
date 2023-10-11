```typescript
const key = setup("mySliceName", dependencies);

const jsonResponse = key.state(undefined);
const isLoading = key.state(0);

const mySelector2 = key.selector(
  (state) => {
    return jsonResponse.get(state) + isLoading.get(state);
  },
  {
    equal: (a, b) => a === b,
  }
);

function updateIsLoading(newLoading: boolean): Transaction<"mySliceName"> {
  let txn = key.transaction();

  // option 1 - one function
  txn = txn.update((state) => {
    const newState = jsonResponseData.set(state, data);
    return isLoading.set(newState, newLoading);
  });

  // option 2 - chaining
  txn = txn
    .update((state) => {
      return jsonResponseData.set(state, data);
    })
    .update((state) => {
      return isLoading.set(state, newLoading);
    });

  //  use case - chaining of another transaction
  txn = txn.chain(depA.fixMe());

  return txn;
}

const networkSlice = key.slice(
  {
    jsonResponse,
    isLoading,
    mySelector2,
  },
  {
    updateIsLoading,
  }
);

// call action
networkSlice.updateIsLoading(true);

// get state
networkSlice.get(store).isLoading;
networkSlice.get(store).mySelector2;
```

## Operations

```ts
function myOperation(params) {
  const op = key.operation();

  return op.exec(async (store) => {
    const valA = sliceA.get(store);
    const valB = sliceB.get(store);

    await something;

    cleanup(store, () => {});

    store.dispatch(txn);
  });
}

const networkSlice = key.slice(
  {
    jsonResponse,
    isLoading,
    mySelector2,
  },
  {
    updateIsLoading, // action
    myOperation, // operation
  }
);
```

## Effects

```typescript
key.effect((store) => {
  isLoading.get(store.state);
});

const networkSlice = key.slice(
  {
    jsonResponse,
    isLoading,
    mySelector2,
  },
  {
    updateIsLoading, // action
    myOperation, // operation
  },
  []
);
```

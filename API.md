## init

```ts
const key = createKey('FooBar', [otherSlice], {
  x: 0,
  y: 'hi',
});

type Selector = (state: State) => DerivedState;

// should call the callback only when deps of key change or key itself changes
const selectorA = key.createSelector(
  (state) => {
    const loca = key.get(state);
    const foo = otherSlice.get(state);

    return {};
  },
  {
    equal: () => false,
  },
);

// should update if the tracked state changes
// the benefit here is that the selector only runs when sliceA or key state changes
const selectorB = key.optimizedSelector({
  track: {
    foo: sliceA.tracked((state) => state.foo),
  },
  selector: ({ foo }) => {
    return {};
  },
});

const slice = createSlice({
  key,
  derivedState: (state) => {
    return {
      b: selectorB,
    };
  },
});
```

## Actions

Should always be updating the key State and nothing else.
Q: not forcing an action name could be problem with syncing, maybe we can use a counter++ to always have the same name?
and not burden the user with naming actions

```ts
type Action<T> = (obj: T, state: StoreState) => Transaction;

const myAction = slice.createAction((obj: { x: number }, state: StoreState) => {
  return slice.newValue();
});
```

if you want to give name, use function notation

### Dispatching

```ts
store.dispatch(myAction(param));
```

should i send dispatch as part of action?

Note: this might not work if we want to play around and txns

```ts
myAction(param, store.dispatch);
```

### Higher Action or meta action

When an action can update more than one slice state

If we change action to something like this

```ts
const myAction = slice.createAction(
  (
    obj: { x: number },
    createTxn: TXBuilder<Slice_NAME>,
  ): Transaction<one_of_slice_deps_or_slice> => {
    return createTxn((state) => state);
  },
);
```

## Do I need to wrap action what if i let users return Transaction

### Global NoOp transaction

### Chain transaction or multiple txns

what about steps

```ts
createTxn(step1, step2);

const step1 = slice.updateState((state) => state);
```

### Serializing

```ts
const myAction = mySerializer({
  slice: slice,
  schema: z.object({
    removals: z.array(z.string()),
    additions: z.array(z.string()),
  }),
  action: (obj, state) => {},
});
```

### Writing query functions

Query functions are similar to selectors but can be used for complex things or event side-effects

```ts
const queryFunc = (state: State<THE_CORRECT_TYPE_BASED_ON_SLICE>) => {
  const s = slice1.get(state);
  const s2 = slice2.get(state);

  return s + s2;
};
```

### Operation

## Effects

Effects should auto register to any dependent slice

```ts
effect(
  {
    obj: mySlice.pick((s) => s.obj),
  },
  ({ obj }, dispatch: Dispatch<mySlice>): void => {},
);
```

allow passive picking

```ts
effect(
  {
    obj: mySlice.pick((s) => s.obj),
    xyz: mySlice2.passivePick((s) => s.xyz),
  },
  ({ obj, xyz }, dispatch: Dispatch<mySlice | mySlice2>): void => {},
);
```

### getting the entire slice state

This can also be used to mimic mount

```ts
effect(
  {
    sliceState: mySlice.passivePick((s) => s),
  },
  ({ obj, xyz }, dispatch: Dispatch<mySlice | mySlice2>): void => {},
);
```

### Effects Ref

```ts
effect(
  'change_effect',
  {
    obj: mySlice.pick((s) => s.obj),
    myRef: mySlice.ref(false),
  },
  (
    { obj, myRef },
    dispatch: Dispatch<mySlice>,
    onCleanup,
  ): void | Promise<void> => {
    myRef.current; // typed and boolean
  },
);
```

```ts
effect({
  name: 'change_effect',
  track: {
    obj: mySlice.pick((s) => s.obj),
    myRef: mySlice.ref(false),
  },
  run: (
    { obj, myRef },
    dispatch: Dispatch<mySlice>,
    onCleanup,
  ): void | Promise<void> => {
    myRef.current; // typed and boolean
  },
});
```

### sharing ref across effects

I am thinking just setting the value using weakmap to Store would allow me to share the ref across effects.
Not everyone has access to store, we need to have a storeKey which is unique to store and can be used to access metadata.
see worker-editor in bangle

### cleanup

we should follow angular style here to allow for cleanup, so that async await can work.

When an effect is terminated, the dispatch function should become a no-op. This should be customizable if someone
wants to not cancel the efffect on a new trigger.

```ts
effect(
  {
    obj: mySlice.pick((s) => s.obj),
  },
  ({ obj }, dispatch: Dispatch<mySlice>, onCleanup): void | Promise<void> => {},
);
```

### manual state or access to store unconditionally

see : `persistStateWatch`

```ts
createManualEffect({});
```

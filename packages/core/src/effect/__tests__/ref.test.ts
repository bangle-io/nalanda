import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { createStore } from '../../store';
import waitForExpect from 'wait-for-expect';
import { testCleanup } from '../../helpers/test-cleanup';
import { createKey } from '../../slice/key';
import { ref } from '../ref';
import { EffectStore } from '../effect-store';

const sliceAKey = createKey('sliceA', []);
const sliceAField1 = sliceAKey.field('value:sliceAField1');
const sliceAField2 = sliceAKey.field('value:sliceAField2');

const sliceA = sliceAKey.slice({
  sliceAField1,
  sliceAField2,
});

const sliceBKey = createKey('sliceB', []);
const sliceBField1 = sliceBKey.field('value:sliceBField1');

const sliceB = sliceBKey.slice({
  sliceBField1,
});

beforeEach(() => {
  testCleanup();
});

test('ref works', async () => {
  const myStore = createStore({
    autoStartEffects: true,
    name: 'myStore',
    slices: [sliceA, sliceB],
  });

  const getMyRef = ref<{ foo: { counter?: number } }>(() => ({
    foo: {},
  }));

  let derStore: EffectStore | undefined;

  myStore.effect((store) => {
    derStore = store;
    const val = sliceA.track(store);
    const myRef = getMyRef(store);

    myRef.current.foo.counter = 1;
  });

  expect(getMyRef(myStore).current).toEqual({
    foo: {},
  });

  // effect is deferred so we need to wait for it to run
  await waitForExpect(() => {
    expect(getMyRef(derStore!).current.foo.counter).toBe(1);
  });
});

test('creating another store does not reuse the ref value', async () => {
  const myStore = createStore({
    autoStartEffects: true,
    name: 'myStore',
    slices: [sliceA, sliceB],
  });

  const myStore2 = createStore({
    autoStartEffects: true,
    name: 'myStore2',
    slices: [sliceA, sliceB],
  });

  const getMyRef = ref<{ foo: { counter?: number } }>(() => ({
    foo: {},
  }));

  let derStore: EffectStore | undefined;
  let derStore2: EffectStore | undefined;

  myStore.effect((store) => {
    derStore = store;
    const val = sliceA.track(store);

    const myRef = getMyRef(store);

    myRef.current.foo.counter = 1;
  });

  myStore2.effect((store) => {
    derStore2 = store;
    const myRef = getMyRef(store);

    myRef.current.foo.counter = 99;
  });

  expect(getMyRef(myStore).current).toEqual({
    foo: {},
  });

  // effect is deferred so we need to wait for it to run
  await waitForExpect(() => {
    expect(getMyRef(derStore!).current.foo.counter).toBe(1);
  });

  // effect is deferred so we need to wait for it to run
  await waitForExpect(() => {
    expect(getMyRef(derStore2!).current.foo.counter).toBe(99);
  });
});

test('multiple effects can share the ref value', async () => {
  const myStore = createStore({
    autoStartEffects: true,
    name: 'myStore',
    slices: [sliceA, sliceB],
  });

  const getMyRef = ref<{ foo: { counter?: number } }>(() => ({
    foo: {},
  }));

  let derStore: EffectStore | undefined;
  let derStore2: EffectStore | undefined;

  myStore.effect((store) => {
    derStore = store;
    const val = sliceA.track(store).sliceAField1;

    const myRef = getMyRef(store);

    myRef.current.foo.counter = 1;
  });

  sliceBKey.effect((store) => {
    derStore2 = store;
    const val = sliceB.track(store).sliceBField1;

    const myRef = getMyRef(store);

    if (myRef.current.foo.counter === 1) {
      myRef.current.foo.counter = 2;
    }
  });

  expect(getMyRef(myStore).current).toEqual({
    foo: {},
  });

  await waitForExpect(() => {
    expect(getMyRef(myStore).current.foo.counter).toBe(2);
    expect(getMyRef(derStore2!).current.foo.counter).toBe(2);
    expect(getMyRef(derStore!).current.foo.counter).toBe(2);
  });
});

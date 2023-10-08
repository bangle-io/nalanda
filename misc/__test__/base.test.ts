import { expect, test } from '@jest/globals';
import { createKey, createStore, Key, Slice } from '@nalanda/core';
import {
  InferSliceDepNames,
  InferSliceName,
  expectType,
  IfEquals,
} from '../type-helpers';

const dep1Key = createKey('dep1Key', []);
const dep1Slice = dep1Key.slice({});

const dep2Key = createKey('dep2Key', []);
const dep2Slice = dep2Key.slice({});

const key = createKey('myKey', [dep1Slice, dep2Slice]);

const field1 = key.field(1);

const mySlice = key.slice({});

const store = createStore({
  slices: [dep1Slice, dep2Slice, mySlice],
});

test('slice', () => {
  type MySlice = typeof mySlice;

  type MySliceName = InferSliceName<MySlice>;
  type MySliceDepNames = InferSliceDepNames<MySlice>;

  () => {
    type Result = IfEquals<MySliceName, 'myKey', 'yes', 'no'>;
    const result: Result = 'yes';
  };

  () => {
    type Result = IfEquals<MySliceDepNames, 'myKey', 'yes', 'no'>;
    let result1: Result = 'no';
  };

  () => {
    type Result = IfEquals<MySliceDepNames, 'dep1Key' | 'dep2Key', 'yes', 'no'>;
    let result1: Result = 'yes';
  };

  expect(1).toBe(1);
});

test('key', () => {
  type KeyType = typeof key;

  type InferName<T> = T extends Key<infer Name, any> ? Name : never;
  type InferDepNames<T> = T extends Key<any, infer DepNames> ? DepNames : never;
  type DepName = InferDepNames<KeyType>;

  () => {
    type Result = IfEquals<InferName<KeyType>, 'myKey', 'yes', 'no'>;
    const result: Result = 'yes';
  };

  () => {
    type Result = IfEquals<DepName, 'myKey', 'yes', 'no'>;
    let result1: Result = 'no';
  };

  () => {
    type Result = IfEquals<DepName, 'dep1Key' | 'dep2Key', 'yes', 'no'>;
    let result1: Result = 'yes';
  };

  expect(1).toBe(1);
});

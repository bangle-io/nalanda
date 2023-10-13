import { createKey } from '@nalanda/react';

const key = createKey('counter-slice', []);

const counterField = key.field(0);

function incrementCounter() {
  return counterField.update((c) => c + 1);
}

function decrementCounter() {
  return counterField.update((c) => c - 1);
}

export const counterSlice = key.slice({
  counter: counterField,
  incrementCounter,
  decrementCounter,
});

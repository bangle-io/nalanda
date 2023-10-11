import { createKey } from "@nalanda/react";

const key = createKey("counter-slice", []);

const counterField = key.field(19);

const negField = key.field(19);

function incrementCounter() {
  return counterField.update((c) => c + 1);
}

function incrementNegCounter() {
  return negField.update((c) => c - 1);
}

export const counterSlice = key.slice({
  counter: counterField,
  incrementCounter,
  incrementNegCounter,
});

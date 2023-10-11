// sum.test.js
import { expect, test } from "vitest";
import { slice, sliceKey, store } from "nalanda";
import {} from "./helper";

const countSlice = slice([], {
  name: "countSlice",
  state: {
    count: 1,
  },
});

const appStore = store({
  storeName: "appStore",
  slices: [countSlice],
});

test("simple slice", () => {
  expect(countSlice.get(appStore.state)).toEqual({
    count: 1,
  });
});

// sum.test.js
import { expect, test } from "vitest";
import { effect, slice, sliceKey, store } from "nalanda";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mySlice = slice([], {
  name: "mySlice",
  state: {
    jsonResponse: null,
  },
});

const appStore = store({
  storeName: "appStore",
  slices: [mySlice],
  manualEffectsTrigger: true,
});

const myEffect = effect(async (effectStore) => {
  const url =
    "https://gist.githubusercontent.com/" +
    "zerobias/3209919edc04fa7b6c4b6b742fa0c380/" +
    "raw/367b9773f85da46270cef7393189aaff2f349464/" +
    "selector.json";
  const req = await fetch(url);
  console.log(await req.json());
});

appStore.registerEffect(myEffect);

test("simple slice", async () => {
  appStore.runEffects();
  await sleep(400);
  expect(mySlice.get(appStore.state)).toEqual({
    count: 1,
  });
});

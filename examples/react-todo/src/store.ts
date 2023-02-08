import { slice, key, Store, createUseSliceHook } from 'nalanda';

export const mySlice = slice({
  key: key('mySlice', [], { val: 'hi' }),
  actions: {
    updateStr: (val: string) => () => ({ val }),
  },
  effects: {
    updateSync() {
      console.count('updateSync');
    },
  },
});

const myStore = Store.create({
  storeName: 'myStore',
  state: { slices: [mySlice] },
});

export const useSlice = createUseSliceHook(myStore);

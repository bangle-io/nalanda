import {
  Store,
  createUseSliceHook,
  createSlice,
  changeEffect,
  mergeSlices,
} from 'nalanda';

const mySlice = createSlice([], {
  key: 'mySlice',
  initState: {
    val: 'hello',
  },
  actions: {
    updateVal: (val: string) => () => ({ val }),
  },
});

const myEffect = changeEffect(
  'myEffect',
  {
    val: mySlice.pick((v) => v.val),
  },
  (data) => {
    console.log(data.val);
  },
);

export const mergedSlice = mergeSlices({
  key: 'myMergedSlice',
  children: [mySlice, myEffect],
});

const myStore = Store.create({
  storeName: 'myStore',
  state: [mergedSlice],
});

export const useSlice = createUseSliceHook(myStore);

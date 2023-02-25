import { Slice } from './slice';

export const CORE_SLICE_READY = '$nalanda/CORE_SLICE_READY';
const initState: { ready: boolean } = {
  ready: false,
};

export const coreReadySlice = new Slice({
  name: CORE_SLICE_READY,
  initState,
  actions: {
    ready: () => () => ({ ready: true }),
  },
  dependencies: [],
  selectors: {},
  effects: [
    {
      init(slice, store) {
        store.dispatch(slice.actions.ready());
      },
    },
  ],
});

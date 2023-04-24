import { createSlice } from '../create';
import { isLineageId } from '../helpers';

const testSlice1InitState = {
  num: 0,
};
const testSlice1Decrement =
  (opts: { decrement: boolean }) => (state: typeof testSlice1InitState) => {
    return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
  };
const testSlice1 = createSlice([], {
  name: 'test-1',
  initState: testSlice1InitState,
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: testSlice1Decrement,
  },
});

describe('lineage id is geneated correctly', () => {
  test('works', () => {
    const slice1 = createSlice([], {
      name: 'slice1',
      actions: {},
      initState: { num: 1 },
    });

    const sliceWithSameName = createSlice([], {
      name: 'slice1',
      actions: {},
      initState: { num: 1 },
    });
    const sliceWithSameName2 = createSlice([], {
      name: 'slice1',
      actions: {},
      initState: { num: 1 },
    });

    expect(slice1.spec.lineageId).toBe('l_slice1$');
    expect(sliceWithSameName.spec.lineageId).toBe('l_slice1$1');
    expect(sliceWithSameName2.spec.lineageId).toBe('l_slice1$2');
  });

  test('isLineageId', () => {
    expect(isLineageId('ssadsad')).toBe(false);
    expect(isLineageId('l_slice1$')).toBe(true);
    expect(isLineageId('l_slice1$$')).toBe(true);
    expect(isLineageId('l_slice1$1$')).toBe(true);
    expect(isLineageId('l_slice1$1$3a')).toBe(false);
    expect(isLineageId('l_slice1$334314')).toBe(true);
  });
});

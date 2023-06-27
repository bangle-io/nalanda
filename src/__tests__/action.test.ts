import { expectType } from '../helpers';
import { slice } from '../slice';
import { Transaction } from '../transaction';
import { ActionBuilder } from '../action';
import { testOnlyResetIdGeneration } from '../id_generation';

beforeEach(() => {
  testOnlyResetIdGeneration();
});

describe('actions', () => {
  const mySlice = slice([], {
    name: 'mySlice',
    state: {
      a: 1,
    },
  });

  test('setup', () => {
    let myAction = mySlice.action((a: number) => {
      return mySlice.tx((state) => {
        return mySlice.update(state, { a: 3 });
      });
    });

    const txn = myAction(3);
    expectType<Transaction<'mySlice', [number]>, typeof txn>(txn);

    expect(txn).toMatchInlineSnapshot(
      {
        opts: {
          actionId: expect.any(String),
          sourceSliceId: expect.any(String),
          targetSliceId: expect.any(String),
        },
        txId: expect.any(String),
      },
      `
      {
        "metadata": Metadata {
          "_metadata": {},
        },
        "opts": {
          "actionId": Any<String>,
          "name": "mySlice",
          "params": [
            3,
          ],
          "sourceSliceId": Any<String>,
          "sourceSliceName": "mySlice",
          "targetSliceId": Any<String>,
          "targetSliceName": "mySlice",
        },
        "txId": Any<String>,
      }
    `,
    );
  });

  test('action naming', () => {
    let myAction1 = mySlice.action(function myActioning(a: number) {
      return mySlice.tx((state) => {
        return mySlice.update(state, { a: 3 });
      });
    });

    let myAction2 = mySlice.action((a: number) => {
      return mySlice.tx((state) => {
        return mySlice.update(state, { a: 3 });
      });
    });

    expect(myAction1(3).opts.actionId).toContain('a_myActioning[sl_mySlice');

    expect(myAction2(3).opts.actionId).toEqual('a_[sl_mySlice$]0');
  });

  test('same hint', () => {
    const sliceJackson = slice([], {
      name: 'sliceJackson',
      state: {
        a: 1,
      },
    });

    let myAction1 = sliceJackson.action(function myActioning(a: number) {
      return sliceJackson.tx((state) => {
        return sliceJackson.update(state, { a: 3 });
      });
    });

    let myAction2 = sliceJackson.action(function myActioning(a: number) {
      return sliceJackson.tx((state) => {
        return sliceJackson.update(state, { a: 3 });
      });
    });

    expect(myAction1(3).opts.actionId).toEqual(
      'a_myActioning[sl_sliceJackson$]',
    );
    expect(myAction2(3).opts.actionId).toEqual(
      'a_myActioning[sl_sliceJackson$]0',
    );
  });

  test('.tx', () => {
    let stateBuilder = mySlice.tx((state) => {
      return mySlice.update(state, { a: 3 });
    });

    expectType<
      ActionBuilder<'mySlice', { a: number }, string>,
      typeof stateBuilder
    >(stateBuilder);
  });
});

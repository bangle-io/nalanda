import { expectType } from '../helpers';
import { slice } from '../slice';
import { Transaction } from '../transaction';
import { ActionBuilder } from '../action';

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

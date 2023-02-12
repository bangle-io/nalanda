import { StoreState } from './state';
import { Transaction } from './transaction';

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;

export const expectType = <Type>(_: Type): void => void 0;
export function rejectAny<K extends IfAny<K, never, unknown>>(key: K): void {}

export interface BareSlice<K extends string = any, SS = any> {
  key: K;
  //   Duplicated for ease of doing BareSlice['initState'] type
  initState: SS;
  // Internal things are here
  _bare: {};
}

export type TxApplicator<K extends string, SS = any> = (
  sliceState: SS,
  storeState: StoreState<BareSlice>,
  tx: Transaction<K, unknown[]>,
) => SS;

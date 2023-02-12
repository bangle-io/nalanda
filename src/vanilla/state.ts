import { BareSlice } from './slice';

export type ResolveSliceIfRegistered<
  SL extends BareSlice,
  SliceRegistry extends BareSlice,
> = SL extends BareSlice<infer K, any>
  ? K extends SliceRegistry['key']
    ? SL
    : never
  : never;

export interface StoreState<RegSlices extends BareSlice> {
  getSliceState<SL extends BareSlice>(
    slice: ResolveSliceIfRegistered<SL, RegSlices>,
  ): SL['initState'];
}

export class InternalStoreState implements StoreState<any> {
  static create<SL extends BareSlice>(slices: SL[]): StoreState<SL> {
    return new InternalStoreState(slices);
  }

  constructor(public readonly slices: BareSlice[]) {}

  getSliceState(sl: BareSlice): unknown {
    return {};
  }
}

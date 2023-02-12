import { BareSlice } from './internal-types';

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

export class InternalStoreState<SL extends BareSlice>
  implements StoreState<SL>
{
  getSliceState(sl: BareSlice): unknown {
    return {};
  }
}

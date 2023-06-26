import { CreateSliceOpts, BaseSlice } from './base-slice';
import { NoInfer } from './helpers';
import { InferSliceNameFromSlice, Slice, slice } from './slice';
import { StoreState } from './store-state';

type SelectorOpts<T> = {
  equal?: (a: T, b: T) => boolean;
};

type SliceKeyToSliceOpts<TDerived extends object> = {
  derivedState: TDerived;
};

// TODO implement the type
type Selector<T> = () => T;

export class SliceKey<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> extends BaseSlice<TSliceName, TState, TDep> {
  static create<
    TSliceName extends string,
    TState extends object,
    TDepSlice extends Slice<string, any, any>,
  >(
    dependencies: TDepSlice[],
    opts: Omit<
      CreateSliceOpts<TSliceName, TState, InferSliceNameFromSlice<TDepSlice>>,
      'dependencies'
    >,
  ): SliceKey<TSliceName, TState, InferSliceNameFromSlice<TDepSlice>> {
    return new SliceKey({
      ...opts,
      dependencies: dependencies as any,
    });
  }

  private constructor(
    public readonly opts: CreateSliceOpts<TSliceName, TState, TDep>,
  ) {
    super(opts);
  }

  selector<T>(
    cb: (storeState: StoreState<TSliceName | TDep>) => T,
    opts: SelectorOpts<NoInfer<T>> = {},
  ): Selector<T> {
    return {} as any;
  }

  // TODO add derived state to slice and keep it immune to updates
  //   - fix the type as TDerived will be a Map of selectors
  slice<TDerived extends object>(
    opts: SliceKeyToSliceOpts<TDerived>,
  ): Slice<TSliceName, TDerived & TState, TDep> {
    slice(this.opts.dependencies, {
      ...this.opts,
    });

    return {} as any;
  }
}

export const sliceKey = SliceKey.create.bind(SliceKey);

// TESTS
const key = sliceKey([], {
  name: 'sliceName',
  state: {
    a: 1,
  },
});

let f = key.selector((state) => 5);
let f2 = key.selector((state) => 5, {
  equal(a, b) {
    return true;
  },
});

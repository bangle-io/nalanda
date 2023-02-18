import { uuid } from './helpers';

export type AnySlice = Slice2;

interface Slice2Spec<
  K extends string = any,
  SS = any,
  DS extends AnySlice = any,
  A extends Record<string, any> = any,
  SE extends Record<string, any> = any,
> {
  key: K;
  dependencies: DS[];
  initState: SS;
  actions: A;
  selectors: SE;
  effects?: any[];
  additionalSlices?: AnySlice[];
}

interface Slice2Config {
  originalSpec: Slice2Spec;
  // It is used to identify slices that were forked from the same original slice.
  lineageId: string;
  merged?: boolean;
  nested?: boolean;
}

let sliceUidCounter = 0;
let fileUid = uuid(3);

export class Slice2 {
  config: Slice2Config;

  get lineageId() {
    return this.config.lineageId;
  }

  get originalKey() {
    return this.config.originalSpec.key;
  }

  constructor(public readonly spec: Slice2Spec, config?: Slice2Config) {
    this.config = config || {
      originalSpec: spec,
      lineageId: `${spec.key}-${fileUid}-${sliceUidCounter++}`,
    };
  }

  reconfigure(spec: Partial<Slice2Spec>): Slice2 {
    return new Slice2({ ...this.spec, ...spec }, this.config);
  }
}

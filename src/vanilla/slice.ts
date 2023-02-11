import { BareSlice } from './internal-types';

interface SliceConfig<K extends string = any, SS = any> {
  key: K;
  initState: SS;
}

export class Slice<K extends string = any, SS = any>
  implements BareSlice<K, SS>
{
  get key(): K {
    return this.config.key;
  }

  get initState(): SS {
    return this.config.initState;
  }

  constructor(public readonly config: SliceConfig<K, SS>) {}
}

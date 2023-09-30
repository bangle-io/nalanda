import type { Slice } from './slice';
import { StoreState } from './store-state';

interface StoreConfig {
  name: string;
  slices: Slice[];
}

export function createStore(config: { name?: string; slices: Slice[] }) {
  return new Store({ ...config, name: 'anonymous' });
}

export class Store {
  state: StoreState;

  constructor(private config: StoreConfig) {
    this.state = StoreState.create({
      slices: config.slices,
    });
  }
}

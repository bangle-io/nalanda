import { Slice } from '../slice';
import type { AnySlice } from '../types';

export { calcReverseDependencies } from './dependency-helpers';
export { idGeneration } from './id_generation';
export { shallowEqual } from './shallow-equal';
export { testCleanup } from './test-cleanup';
export { validateSlices } from './validations';

export function uuid(len = 10) {
  return Math.random().toString(36).substring(2, 15).slice(0, len);
}

export const hasIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window;

export function isSlice(obj: unknown): obj is AnySlice {
  return obj instanceof Slice;
}

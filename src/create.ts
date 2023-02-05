// 3 Generics that are optional

import type { SliceConfig } from './slice';
import { Slice, SliceKey } from './slice';
import type { EffectsBase, RawAction, SelectorFn } from './types';

export function createKey<SS extends object>(initState: SS) {
  function _createKey<K extends string, DS extends Slice[]>(
    id: K,
    deps: DS,
  ): SliceKey<K, SS, {}, DS>;
  function _createKey<
    K extends string,
    DS extends Slice[],
    SE extends Record<string, SelectorFn<SS, DS, any>>,
  >(id: K, deps: DS, selector: SE): SliceKey<K, SS, {}, DS>;
  function _createKey(id: any, deps: any, selector?: any): any {
    return new SliceKey(id, deps, initState, selector || {});
  }

  return _createKey;
}

export function key<K extends string, SS extends object, DS extends Slice[]>(
  id: K,
  deps: DS,
  initState: SS,
): SliceKey<K, SS, {}, DS>;
export function key<
  K extends string,
  SS extends object,
  DS extends Slice[],
  SE extends Record<string, SelectorFn<SS, DS, any>>,
>(id: K, deps: DS, initState: SS, selector: SE): SliceKey<K, SS, SE, DS>;
export function key(id: any, deps: any, initState: any, selector?: any): any {
  return new SliceKey(id, deps, initState, selector || {});
}

export function slice<
  SK extends SliceKey<any, any, any, any>,
  A extends Record<
    string,
    RawAction<any[], SK['initState'], SK['dependencies']>
  >,
>({
  key,
  actions,
  effects,
  config = {},
}: {
  key: SK;
  actions: A;
  effects?: EffectsBase<
    Slice<SK['key'], SK['initState'], SK['dependencies'], A, SK['selectors']>
  >;
  config?: SliceConfig;
}): Slice<SK['key'], SK['initState'], SK['dependencies'], A, SK['selectors']> {
  return new Slice(key, actions, effects ? [effects] : [], config);
}

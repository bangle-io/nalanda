import { Action, AnySlice, Effect, SelectorFn } from './public-types';
import { Slice } from './slice';

class SliceKey<
  N extends string,
  SS extends object,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
  DS extends AnySlice,
> {
  constructor(
    public name: N,
    public dependencies: DS[],
    public initState: SS,
    public selectors: SE,
  ) {}
}

export function createKey<
  K extends string,
  SS extends object,
  DS extends AnySlice,
>(id: K, deps: DS[], initState: SS): SliceKey<K, SS, {}, DS>;
export function createKey<
  K extends string,
  SS extends object,
  DS extends AnySlice,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
>(id: K, deps: DS[], initState: SS, selector: SE): SliceKey<K, SS, SE, DS>;
export function createKey(
  id: any,
  deps: any[],
  initState: any,
  selector?: any,
): any {
  return new SliceKey(id, deps, initState, selector || {});
}

type InferInitState<SK extends SliceKey<any, any, any, any>> =
  SK extends SliceKey<any, infer SS, any, any> ? SS : never;
type InferDependencies<SK extends SliceKey<any, any, any, any>> =
  SK extends SliceKey<any, any, any, infer DS> ? DS : never;
type InferSelectors<SK extends SliceKey<any, any, any, any>> =
  SK extends SliceKey<any, any, infer SE, any> ? SE : never;

export function slice<
  SK extends SliceKey<any, any, any, any>,
  A extends Record<
    string,
    Action<any[], InferInitState<SK>, InferDependencies<SK>>
  >,
>({
  key,
  actions,
  effects,
}: {
  key: SK;
  actions: A;
  effects?: Effect<
    Slice<
      SK['name'],
      InferInitState<SK>,
      InferDependencies<SK>,
      A,
      InferSelectors<SK>
    >,
    | Slice<
        SK['name'],
        InferInitState<SK>,
        InferDependencies<SK>,
        A,
        InferSelectors<SK>
      >
    | InferDependencies<SK>
  >[];
}) {
  return new Slice({
    actions,
    dependencies: key.dependencies,
    effects: effects || [],
    initState: key.initState,
    name: key.name,
    selectors: key.selectors,
  });
}

export function createSlice<
  K extends string,
  SS extends object,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
>(
  dependencies: DS[],
  arg: {
    key: K;
    initState: SS;
    actions: A;
    selectors: SE;
  },
): Slice<K, SS, DS, A, SE> {
  return new Slice({
    actions: arg.actions,
    dependencies,
    effects: [],
    initState: arg.initState,
    name: arg.key,
    selectors: arg.selectors || {},
  });
}

export type Foo = 4;

type Selector = (state: any) => any;

declare function createKey<TSliceName extends string, TDep extends string>(
  name: TSliceName
): Key;

declare class Key<TSliceName extends string> {
  selector: Selector;

  slice<TState extends object>(slice: Slice<TSliceName, TState, any>): void;
}

declare class Slice<
  TSliceName extends string,
  TState extends object,
  TDep extends string
> {}

declare class Store {
  readonly state: StoreState;
}

declare class StoreState {}

import { AnySlice } from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';

export function mergeSlices<K extends string, SL extends AnySlice>({
  key,
  children,
}: {
  key: K;
  children: SL[];
}): Slice<K, object, any, any, any> {
  let childrenKeys = [...children.map((child) => child.key)];

  const newChildren = children.flatMap((child) => {
    return [
      ...children
        .filter((child) => child._bare.children)
        .flatMap((child) => {
          return (
            child._bare.children?.map((c) =>
              Slice._addToParent(c as AnySlice, key, childrenKeys),
            ) || []
          );
        }),
      Slice._addToParent(child, key, childrenKeys),
    ];
  });

  //   console.log(newChildren.map((r) => r?.key));
  const mergedSlice = new Slice({
    key: key,
    dependencies: [],
    initState: {},
    actions: {},
    selectors: {},
  });

  return mergedSlice._fork(mergedSlice.config, {
    children: newChildren,
  });
}

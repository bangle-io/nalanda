import { AnySlice } from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';

export function mergeSlices<K extends string, SL extends AnySlice>({
  key,
  children,
}: {
  key: K;
  children: SL[];
}): Slice<K, object, any, any, any> {
  let newChildren = children.flatMap((child) => {
    return [
      ...children.flatMap((child) => {
        const childChildren = child._bare.children as AnySlice[];
        const siblingUids = new Set(childChildren.map((c) => c.sliceUid));
        return childChildren.map((c) => {
          return c._nestSlice(key, siblingUids);
        });
      }),
      child._nestSlice(key, new Set(children.map((c) => c.sliceUid))),
    ];
  });

  const newChildrenMapping = new Map(newChildren.map((c) => [c.sliceUid, c]));

  newChildren = newChildren.map((c) => {
    return c._fork({
      mappedDependencies: c._bare.mappedDependencies.map((dep) => {
        const mappedDep = newChildrenMapping.get(dep.sliceUid);
        return mappedDep || dep;
      }),
    });
  });

  const mergedSlice = new Slice({
    key: key,
    dependencies: [],
    initState: {},
    actions: {},
    selectors: {},
  });

  return mergedSlice._fork({
    children: newChildren,
  });
}

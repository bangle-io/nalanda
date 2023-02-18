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
    const flattenedSlices = children.flatMap((child) => {
      const childChildren = child._bare.children as AnySlice[];
      const siblingUids = new Set(childChildren.map((c) => c.uid));
      return childChildren.map((c) => {
        return nestSlice(c, key, siblingUids);
      });
    });

    flattenedSlices.push(
      nestSlice(child, key, new Set(children.map((c) => c.uid))),
    );

    return flattenedSlices;
  });

  const newChildrenMapping = new Map(newChildren.map((c) => [c.uid, c]));

  newChildren = newChildren.map((c) => {
    return c._fork({
      mappedDependencies: c._bare.mappedDependencies.map((dep) => {
        const mappedDep = newChildrenMapping.get(dep.uid);
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

function nestSlice(
  slice: AnySlice,
  prefix: string,
  siblingSliceUids: Set<string>,
) {
  const newKey = prefix + ':' + slice.key;

  return slice._fork(
    {
      siblingSliceUids,
    },
    {
      modifiedKey: newKey,
    },
  );
}

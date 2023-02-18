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
      const childChildren = child.spec.children || [];
      return childChildren.map((c) => {
        return nestSlice(c, key);
      });
    });

    flattenedSlices.push(nestSlice(child, key));

    return flattenedSlices;
  });

  const newChildrenMapping = new Map(newChildren.map((c) => [c.lineageId, c]));

  newChildren = newChildren.map((c) => {
    return c._fork({
      dependencies: c.spec.dependencies.map((dep) => {
        const mappedDep = newChildrenMapping.get(dep.lineageId);
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

function nestSlice(slice: AnySlice, prefix: string) {
  const newKey = prefix + ':' + slice.key;

  return slice._fork({
    key: newKey,
  });
}

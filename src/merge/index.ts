import {
  createSliceNameOpaque,
  nestSliceKey,
  SliceNameOpaque,
} from '../vanilla/internal-types';
import { AnySlice } from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';
import { InternalStoreState } from '../vanilla/state';

export function mergeSlices<N extends string, SL extends AnySlice>({
  name: parentName,
  children,
}: {
  name: N;
  children: SL[];
}): Slice<N, object, any, any, any> {
  InternalStoreState.checkUniqueKeys(children);

  let mappingRecord: Map<string, AnySlice> = new Map();

  function nestSlice(slice: AnySlice, prefix: SliceNameOpaque) {
    const newKey = nestSliceKey(slice.key, prefix);

    let newSlice = slice._fork({
      name: newKey,
    });
    mappingRecord.set(slice.key, newSlice);
    return newSlice;
  }

  let newChildren: AnySlice[] = children
    .flatMap((child) => {
      const additional = [...(child.spec._additionalSlices || [])];
      return [
        ...additional,
        child._fork({
          _additionalSlices: [],
        }),
      ];
    })
    .map((child) => {
      return nestSlice(child, createSliceNameOpaque(parentName));
    });

  // update the dependencies so that they point to the new slices
  newChildren = newChildren.map((c) => {
    return c._fork({
      dependencies: c.spec.dependencies.map((dep) => {
        const mappedDep = mappingRecord.get(dep.key);
        return mappedDep || dep;
      }),
    });
  });

  const mergedSlice = new Slice({
    name: parentName,
    dependencies: [],
    initState: {},
    actions: {},
    selectors: {},
  });
  // setMetadata(mergedSlice, {
  //   isMerge: true,
  // });

  return mergedSlice._fork({
    _additionalSlices: newChildren,
  });
}

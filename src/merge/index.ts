import {
  createSliceNameOpaque,
  nestSliceKey,
  SliceNameOpaque,
} from '../vanilla/internal-types';
import { AnySlice } from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';
import { InternalStoreState } from '../vanilla/state';

// const MERGE_KEY = '$nalanda/MERGE_METADATA_KEY';

// interface MergeData {
//   isMerge: true;
// }

// function setMetadata(slice: AnySlice, metadata: MergeData) {
//   slice._metadata[MERGE_KEY] = metadata;
// }

// function getMetadata(slice: AnySlice): MergeData | undefined {
//   return slice._metadata[MERGE_KEY];
// }

export function mergeSlices<K extends string, SL extends AnySlice>({
  key: parentName,
  children,
}: {
  key: K;
  children: SL[];
}): Slice<K, object, any, any, any> {
  InternalStoreState.checkUniqueKeys(children);

  let mappingRecord: Map<string, AnySlice> = new Map();

  function nestSlice(slice: AnySlice, prefix: SliceNameOpaque) {
    const newKey = nestSliceKey(slice.newKeyNew, prefix);

    let newSlice = slice._fork({
      name: newKey,
    });
    mappingRecord.set(slice.newKeyNew, newSlice);
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
        const mappedDep = mappingRecord.get(dep.newKeyNew);
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

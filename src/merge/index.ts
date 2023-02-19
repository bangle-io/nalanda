import { AnySlice } from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';

const MERGE_KEY = '$nalanda/MERGE_METADATA_KEY';

interface MergeData {
  isMerge: true;
}

function setMetadata(slice: AnySlice, metadata: MergeData) {
  slice._metadata[MERGE_KEY] = metadata;
}

function getMetadata(slice: AnySlice): MergeData | undefined {
  return slice._metadata[MERGE_KEY];
}

export function mergeSlices<K extends string, SL extends AnySlice>({
  key: parentKey,
  children,
}: {
  key: K;
  children: SL[];
}): Slice<K, object, any, any, any> {
  let newChildren: AnySlice[] = children.flatMap((child) => {
    const mergeData = getMetadata(child);

    // check if the slice is a merge slice
    if (!mergeData) {
      return [nestSlice(child, parentKey)];
    }

    // for merge slices we need to flatten the children
    // and lift them up to the parent.
    const flattenedSlices = (child.spec.additionalSlices || []).map((c) => {
      return nestSlice(c, parentKey)._fork({
        // remove them from this slice, since the slice with key=`parentKey` will
        // own them now.
        additionalSlices: [],
      });
    });
    flattenedSlices.push(nestSlice(child, parentKey));
    return flattenedSlices;
  });

  const newChildrenMapping = new Map(newChildren.map((c) => [c.lineageId, c]));

  // update the dependencies so that they point to the new slices
  newChildren = newChildren.map((c) => {
    return c._fork({
      dependencies: c.spec.dependencies.map((dep) => {
        const mappedDep = newChildrenMapping.get(dep.lineageId);
        return mappedDep || dep;
      }),
    });
  });

  const mergedSlice = new Slice({
    key: parentKey,
    dependencies: [],
    initState: {},
    actions: {},
    selectors: {},
  });
  setMetadata(mergedSlice, {
    isMerge: true,
  });

  return mergedSlice._fork({
    additionalSlices: newChildren,
  });
}

function nestSlice(slice: AnySlice, prefix: string) {
  const newKey = prefix + ':' + slice.key;

  return slice._fork({
    key: newKey,
  });
}

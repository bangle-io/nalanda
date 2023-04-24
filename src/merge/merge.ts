import { createBaseSlice, Slice } from '../vanilla';
import type { Merge, UnionToIntersection } from 'type-fest';
import { AnySlice, AnySliceWithName } from '../vanilla/slice';
import { expandSlices } from '../vanilla/slices-helpers';

type InferState<TSlice extends AnySlice> = TSlice extends Slice<
  any,
  infer T,
  any,
  any
>
  ? T
  : never;

type InferDerivedState<TSlice extends AnySlice> = TSlice extends Slice<
  any,
  any,
  any,
  infer T
>
  ? T
  : never;
/**
 * Produces a new slice which serves as the proxy to access any of the merged slices.
 * Ensure all the slices to be merged have distinct state, selector,
 */
export function mergeAll<N extends string, TSlice extends AnySlice>(
  slices: TSlice[],
  {
    name,
  }: {
    name: N;
  },
): Slice<
  N,
  {},
  TSlice extends AnySliceWithName<infer TDependency> ? TDependency : never,
  Merge<
    UnionToIntersection<InferState<TSlice>>,
    UnionToIntersection<InferDerivedState<TSlice>>
  >
> {
  const expandedSlices = expandSlices(slices);
  slices.forEach((slice) => {
    slice.spec.dependencies.forEach((dep) => {
      if (!expandedSlices.pathMap[dep.spec.lineageId]) {
        throw new Error(
          `Merge slice "${name}", must include slice "${dep.spec.name}" as slice "${slice.spec.name}" depends on it`,
        );
      }
    });
  });

  // // TODO add a test to make sure terminal slices are ignored properly
  const nonTerminalSlices = slices.filter((sl) => !sl.spec.terminal);

  let mergedSlice = createBaseSlice(nonTerminalSlices, {
    name: name,
    initState: {},
    derivedState: () => {
      return (storeState) => {
        let seenKeys = new Set<string>();
        return Object.fromEntries(
          nonTerminalSlices.flatMap((slice) => {
            const res = slice.resolveState(storeState);
            const entries = Object.entries(res);
            for (const [key] of entries) {
              if (seenKeys.has(key)) {
                throw new Error(
                  `Merge slices must have unique state keys. The slice "${slice.spec.name}" has a state key "${key}" that conflicts with another selector or state of a slice.`,
                );
              }
              seenKeys.add(key);
            }
            return entries;
          }),
        );
      };
    },
  });

  Slice._registerInternalSlice(mergedSlice, {
    before: slices,
  });

  return mergedSlice as any;
}

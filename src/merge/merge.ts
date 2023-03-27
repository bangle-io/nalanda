import { Slice, Transaction } from '../vanilla';
import { LineageId } from '../vanilla/internal-types';
import { SelectorFn, TxCreator } from '../vanilla/public-types';
import type { UnionToIntersection } from 'type-fest';
import { isPlainObject } from '../vanilla/helpers';

type ChangeTxCreatorSourceName<N extends string, A> = {
  [K in keyof A]: A[K] extends TxCreator<any, infer P>
    ? TxCreator<N, P>
    : never;
};

type CreateSelectors<S> = {
  [K in keyof S]: S[K] extends SelectorFn<any, any, infer P>
    ? SelectorFn<any, any, P>
    : never;
};

type StateToSelectors<S> = {
  [K in keyof S]: S[K] extends {} ? SelectorFn<any, any, S[K]> : never;
};

/**
 * Produces a new slice which serves as the proxy to access any of the merged slices.
 * Ensure all the slices to be merged have distinct state, selector, action keys as
 * the function will create a slice with corresponding fields merged.
 */
export function mergeAll<
  N extends string,
  SL extends Slice<string, any, any, any, any>,
>(
  slices: SL[],
  {
    name,
  }: {
    name: N;
  },
): Slice<
  N,
  {},
  SL,
  ChangeTxCreatorSourceName<N, UnionToIntersection<SL['actions']>>,
  StateToSelectors<UnionToIntersection<SL['initState']>> &
    UnionToIntersection<CreateSelectors<SL['selectors']>>
> {
  const seenActions = new Set<string>();
  const seenStateKeys = new Set<string>();
  const forwardEntries: [string, LineageId][] = [];
  const mergedSelectors: [string, SelectorFn<any, any, any>][] = [];

  for (const sl of slices) {
    for (const actionId of Object.keys(sl.actions)) {
      if (seenActions.has(actionId)) {
        throw new Error(
          `Action "${actionId}" is already defined in the slice ${sl.name}`,
        );
      }
      seenActions.add(actionId);

      const nestedForward = sl.spec.forwardMap?.[actionId];

      forwardEntries.push([actionId, nestedForward || sl.lineageId]);
    }

    if (!isPlainObject(sl.initState)) {
      throw new Error(
        `The slice "${sl.name}" has a non-plain object as its initial state. This is not supported.`,
      );
    }

    for (const key of Object.keys(sl.initState)) {
      if (seenStateKeys.has(key)) {
        throw new Error(
          `Merge slices must have unique state keys. The slice "${sl.name}" has a state key "${key}" that conflicts with another selector or state of a slice.`,
        );
      }
      seenStateKeys.add(key);
      mergedSelectors.push([
        key,
        (_, storeState) => sl.getState(storeState)[key],
      ]);
    }

    for (const key of Object.keys(sl.selectors)) {
      if (seenStateKeys.has(key)) {
        throw new Error(
          `Merge slices must have unique selector keys. The slice "${sl.name}" has a selector "${key}" that conflicts with another selector or state of a slice.`,
        );
      }
      seenStateKeys.add(key);
      mergedSelectors.push([
        key,
        (_, storeState) => sl.resolveSelectors(storeState)[key],
      ]);
    }
  }

  const mergedSlice = new Slice({
    name: name,
    dependencies: slices,
    initState: {},
    actions: ({ lineageId: sourceSliceLineage }) => {
      const result: Record<string, TxCreator<N, any[]>> = Object.fromEntries(
        forwardEntries.map(([actionId, targetSliceLineage]) => {
          const txCreator: TxCreator<N, any[]> = (...payload) => {
            return new Transaction({
              sourceSliceName: name,
              sourceSliceLineage: sourceSliceLineage,
              targetSliceLineage: targetSliceLineage,
              payload,
              actionId: actionId,
            });
          };
          return [actionId, txCreator];
        }),
      );

      return result;
    },
    selectors: Object.fromEntries(mergedSelectors),
    reducer: (state) => state,
    forwardMap: Object.fromEntries(forwardEntries),
  }).rollupSlices({ before: slices });

  return mergedSlice as any;
}

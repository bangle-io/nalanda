import { Slice, StoreState, Transaction } from '../vanilla';
import { AnyFn, LineageId } from '../vanilla/internal-types';
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

/**
 * Produces a new slice which serves as the proxy to access any of the merged slices.
 * Ensure all the slices to be merged have distinct state, selector, action keys as
 * the function will create a slice with corresponding fields merged.
 */
export function mergeAll<
  N extends string,
  SL extends Slice<string, any, any, any, AnyFn>,
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
  SelectorFn<
    any,
    any,
    UnionToIntersection<SL['initState']> &
      UnionToIntersection<ReturnType<SL['selector']>>
  >
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
    selector: (_, storeState) => {
      const selectorStateRecord: Record<string, any> = {};
      const sliceStateRecord: Record<string, any> = {};

      for (const slice of slices) {
        const selector: SelectorFn<any, any, any> = slice.spec.selector;

        const sliceState = slice.getState(storeState as StoreState<any>);

        let result = selector(sliceState, storeState);

        if (isPlainObject(result)) {
          Object.assign(selectorStateRecord, result);
        } else {
          console.warn(
            `The selector of slice "${slice.name}" returned a non-plain object. This is not supported.`,
          );
        }

        if (isPlainObject(sliceState)) {
          Object.assign(sliceStateRecord, sliceState);
        } else {
          console.warn(
            `The slice "${slice.name}" has a non-plain object as its state. This is not supported.`,
          );
        }
      }

      return {
        ...sliceStateRecord,
        ...selectorStateRecord,
      };
    },
    reducer: (state) => state,
    forwardMap: Object.fromEntries(forwardEntries),
  }).rollupSlices({ before: slices });

  return mergedSlice as any;
}

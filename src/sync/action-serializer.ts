import type { z } from 'zod';
import { AnyFn } from '../vanilla/internal-types';
import { Action, SelectorFn } from '../vanilla/public-types';

import type { Slice } from '../vanilla/slice';
import { zodFindUnsafeTypes } from './zod';

export type ActionSerialData<P extends any[]> = {
  parse: (data: unknown) => P;
  serialize: (payload: P) => unknown;
};
export const serialActionCache = new WeakMap<AnyFn, ActionSerialData<any>>();

export type AnyActionSlice = Slice<
  string,
  any,
  AnyActionSlice,
  Record<string, any>,
  {}
>;

export function serialAction<
  T extends z.ZodTypeAny,
  SS,
  DS extends AnyActionSlice,
>(
  schema: T,
  cb: Action<[z.infer<T>], SS, DS>,
  opts?: {
    parse?: (schema: T, data: unknown) => [z.infer<T>];
    serialize?: (schema: T, payload: [z.infer<T>]) => unknown;
  },
): Action<[z.infer<T>], SS, DS> {
  let unsafeTypes = zodFindUnsafeTypes(schema);

  if (unsafeTypes.length > 0) {
    throw new Error(
      `serialAction: schema contains unsafe types: ${unsafeTypes.join(', ')}`,
    );
  }

  serialActionCache.set(cb, {
    parse: (data: unknown) => {
      if (opts?.parse) {
        return opts.parse(schema, data);
      }

      return [data];
    },
    serialize: (payload: [z.infer<T>]): unknown => {
      if (opts?.serialize) {
        return opts.serialize(schema, payload);
      }

      return payload[0];
    },
  });

  return cb;
}

export class ActionSerializer<
  N extends string,
  SS extends object,
  DS extends AnyActionSlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> {
  static create<SL extends AnyActionSlice>(slice: SL) {
    return new ActionSerializer(slice);
  }

  getRawAction = (actionId: string): Action<any, any, any> | undefined => {
    const action = this.slice.spec.actions[actionId];

    if (!action) {
      return undefined;
    }

    return action;
  };

  constructor(public slice: Slice<N, SS, DS, A, SE>) {}

  getRawSerializedAction(actionId: string):
    | {
        action: Action<any, any, any>;
        serialData: ActionSerialData<any>;
      }
    | undefined {
    const action = this.getRawAction(actionId);

    if (!action) {
      throw new Error(
        `Action ${actionId} not found in slice ${this.slice.key}`,
      );
    }

    const serialData = serialActionCache.get(action);

    if (!serialData) {
      throw new Error(
        `Action ${actionId} in slice ${this.slice.key} is not serializable`,
      );
    }

    return {
      action,
      serialData,
    };
  }

  isSyncReady(): boolean {
    // all actions must be serial
    return Object.values(this.slice.spec.actions).every((action) =>
      serialActionCache.has(action),
    );
  }

  parseActionPayload<AK extends keyof A>(
    actionId: AK extends string ? AK : never,
    payload: unknown,
  ): Parameters<A[AK]> {
    const action = this.getRawSerializedAction(actionId);

    if (!action) {
      throw new Error(
        `Action ${actionId} not found or does not have a serializer`,
      );
    }

    return action.serialData.parse(payload);
  }

  serializeActionPayload<AK extends keyof A>(
    actionId: AK extends string ? AK : never,
    payload: Parameters<A[AK]>,
  ): unknown {
    const action = this.getRawAction(actionId);

    if (!action) {
      throw new Error(
        `Action ${actionId} not found in slice ${this.slice.key}`,
      );
    }

    const serialData = serialActionCache.get(action);

    if (!serialData) {
      throw new Error(
        `Serialize Action ${actionId} in slice ${this.slice.key} not found`,
      );
    }

    return serialData.serialize(payload);
  }
}

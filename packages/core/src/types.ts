/**
 * Hack for nominal typing
 * https://basarat.gitbook.io/typescript/main-1/nominaltyping
 */
declare const __brand: unique symbol;
export type Brand<T, K> = T & { [__brand]: K };

// Magic type that when used at sites where generic types are inferred from, will prevent those sites from being involved in the inference.
// https://github.com/microsoft/TypeScript/issues/14829
export type NoInfer<T> = [T][T extends any ? 0 : never];

export type SliceId = Brand<string, 'SliceId'>;
export type FieldId = Brand<string, 'FieldId'>;

/**
 * If T is a subset of U, return Y, otherwise return N.
 */
export type IfSubset<T, U, Y, N = never> = [T] extends [U] ? Y : N;

export type IfEquals<T, U, Y = unknown, N = never> = (<G>() => G extends T
  ? 1
  : 2) extends <G>() => G extends U ? 1 : 2
  ? Y
  : N;

export const expectType = <Expected, Actual>(
  _actual: IfEquals<Actual, Expected, Actual>,
) => void 0;

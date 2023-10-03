export function throwValidationError(message: string): never {
  throw new Error(message);
}

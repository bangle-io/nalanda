import { EffectStore } from './effect';
import { OperationStore } from './operation';
import { throwValidationError } from '../helpers/throw-error';

export type CleanupCallback = () => void | Promise<void>;

export function cleanup(
  store: EffectStore | OperationStore,
  cb: CleanupCallback,
): void {
  if (store instanceof EffectStore) {
    store._getRunInstance().addCleanup(cb);
    return;
  }

  if (store instanceof OperationStore) {
    store._addCleanup(cb);
    return;
  }

  throwValidationError(
    `Invalid store. 'cleanup()' can only be used with an effect or operation`,
  );
}

import { OperationStore } from './operation';
import { throwValidationError } from '../helpers/throw-error';
import { EffectStore } from './effect-store';
import { EffectCleanupCallback } from './types';

export function cleanup(
  store: EffectStore | OperationStore,
  cb: EffectCleanupCallback,
): void {
  if (store instanceof EffectStore) {
    store._addCleanup(cb);
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

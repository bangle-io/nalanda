import { actionRegistry } from '../action';
import { testOnlyResetIdGeneration } from './id_generation';

/**
 * @internal
 */
export function testCleanup() {
  testOnlyResetIdGeneration();
  actionRegistry.clear();
}

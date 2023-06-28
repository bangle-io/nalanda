import { Effect, effect } from '../effect';
import { testCleanup } from '../test-cleanup';

beforeEach(() => {
  testCleanup();
});

describe('effect', () => {
  test('returns an instance of Effect', () => {
    const callback = jest.fn();
    const effectInstance = effect(callback);
    expect(effectInstance).toBeInstanceOf(Effect);
  });
});

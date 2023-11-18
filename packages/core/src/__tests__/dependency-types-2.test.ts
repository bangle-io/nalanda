import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { createKey } from '../slice/key';

const sliceAKey = createKey('sliceA', []);

const widescreenField = sliceAKey.field(false);

const sliceA = sliceAKey.slice({
  widescreen: widescreenField,
});

const sliceUIKey = createKey('slice-ui', [sliceA]);

const widescreenFieldExported = sliceUIKey.derive((state) => {
  return sliceA.getField(state, 'widescreen');
});

const sliceUI = sliceUIKey.slice({
  widescreen: widescreenFieldExported,
});

test('should error as sliceUI is not a dependency of sliceB', () => {
  const sliceBKey = createKey('sliceB', []);

  const sliceB = sliceBKey.slice({});
  sliceBKey.effect((store) => {
    // @ts-expect-error - should error as sliceUI is not a dependency of sliceB
    const { widescreen } = sliceUI.track(store);
    // @ts-expect-error - should error as sliceUI is not a dependency of sliceB
    sliceUI.get(store.state);
    // @ts-expect-error - should error as sliceUI is not a dependency of sliceB
    sliceUI.getField(store.state, 'widescreen');
  });
});

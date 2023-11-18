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

test('should allow this as sliceUI is a dependency of sliceB', () => {
  const sliceBKey = createKey('sliceB', [sliceUI]);

  const sliceB = sliceBKey.slice({});
  sliceBKey.effect((store) => {
    // should allow this as sliceUI is a dependency of sliceB
    const { widescreen } = sliceUI.track(store);
    sliceUI.get(store.state);

    sliceUI.getField(store.state, 'widescreen');
  });
});

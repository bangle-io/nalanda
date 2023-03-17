import waitForExpect from 'wait-for-expect';
import {
  createDispatchSpy,
  createSlice,
  Slice,
  timeoutSchedular,
  Transaction,
} from '../../vanilla';
import {
  createSyncState,
  createSyncStore,
  MainChannel,
  MainStoreInfo,
  ReplicaChannel,
  ReplicaStoreInfo,
  sliceKeyToReplicaStoreLookup,
} from '../sync-store';
import { BareSlice } from '../../vanilla/slice';
import { changeEffect } from '../../effects';
import { InternalStoreState } from '../../vanilla/state';
function sleep(t = 20): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}
const testSlice1 = createSlice([], {
  name: 'testSlice1',
  initState: {
    counter: 0,
  },
  actions: {
    increment: () => (state) => ({
      ...state,
      counter: state.counter + 1,
    }),
  },
  selectors: {},
});

const testSlice2 = createSlice([], {
  name: 'testSlice2',
  initState: {
    name: 'kj',
  },
  actions: {
    prefix: (prefix: string) => (state) => {
      return { ...state, name: prefix + state.name };
    },
    padEnd: (length: number, pad: string) => (state) => {
      return { ...state, name: state.name.padEnd(length, pad) };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toUpperCase() };
    },
  },
  selectors: {},
});

const depOnTestSlice1Slice = createSlice([testSlice1], {
  name: 'depOnTestSlice1Slice',
  initState: {
    dep: 4,
  },
  actions: {
    increment: () => (state, storeState) => ({
      ...state,
      dep: state.dep + 1 + testSlice1.getState(storeState).counter,
    }),
  },
  selectors: {
    added: (state, storeState) => {
      return state.dep + testSlice1.getState(storeState).counter;
    },
  },
});

type Ref<T> = {
  current: T | undefined;
};

class MyMainChannel implements MainChannel {
  constructor(
    public replicaRefs: Ref<MyReplicaChannel>[],
    public opts: {
      // the time to wait before sending tx to replicas
      sendDelay?: number | undefined;
      // the time to wait before sending store info
      setupDelay?: number | undefined;
    } = {},
  ) {}

  _mainStoreInfo!: () => MainStoreInfo;
  _receiveTx!: (tx: Transaction<any, any>) => void;

  private _getReplicaChannel = (name: string) => {
    const match = this.replicaRefs.find(
      (ref) => ref.current?.opts.replicaStoreName === name,
    );

    if (!match?.current) {
      throw new Error('replicaRef is not set');
    }

    return match.current;
  };

  provideMainStoreInfo(cb: () => MainStoreInfo): void {
    this._mainStoreInfo = cb;
  }

  destroy(): void {}

  getReplicaStoreInfo(replicaStoreName: string) {
    return sleep(this.opts?.setupDelay || 0).then(() =>
      this._getReplicaChannel(replicaStoreName)._replicaStoreInfo(),
    );
  }

  receiveTx(cb: (tx: Transaction<any, any>) => void): void {
    this._receiveTx = cb;
  }

  sendTxToReplicas(replicaStoreName: string, tx: Transaction<any, any>): void {
    if (this.opts?.sendDelay != null) {
      sleep(this.opts.sendDelay)
        .then(() => {
          this._getReplicaChannel(replicaStoreName)._receiveTx(tx);
        })
        .catch(() => {});
    } else {
      this._getReplicaChannel(replicaStoreName)._receiveTx(tx);
    }
  }
}

class MyReplicaChannel implements ReplicaChannel {
  constructor(
    public mainRef: Ref<MyMainChannel>,
    public opts: {
      replicaStoreName: string;
      // the time to wait before sending tx to main
      sendDelay?: number | undefined;
      // the time to wait before sending replica info
      setupDelay?: number | undefined;
    },
  ) {}

  _replicaStoreInfo!: () => ReplicaStoreInfo;
  _receiveTx!: (tx: Transaction<any, any>) => void;

  private _getMainChannel = () => {
    const current = this.mainRef.current;
    if (!current) {
      throw new Error('mainRef is not set');
    }

    return current;
  };

  provideReplicaStoreInfo(cb: () => ReplicaStoreInfo): void {
    this._replicaStoreInfo = cb;
  }

  destroy(): void {}

  getMainStoreInfo() {
    return sleep(this.opts?.setupDelay || 0).then(() => {
      return this._getMainChannel()._mainStoreInfo();
    });
  }

  receiveTx(cb: (tx: Transaction<any, any>) => void): void {
    this._receiveTx = cb;
  }

  sendTxToMain(tx: Transaction<any, any>): void {
    if (this.opts?.sendDelay != null) {
      sleep(this.opts.sendDelay)
        .then(() => {
          this._getMainChannel()._receiveTx(tx);
        })
        .catch(() => {});
    } else {
      this._getMainChannel()._receiveTx(tx);
    }
  }
}

const createBasicPair = ({
  main = {},
  replica = {},
}: {
  main?: {
    slices?: BareSlice[];
    syncSlices?: BareSlice[];
    replicaStores?: string[];
    setupDelay?: number;
    sendDelay?: number;
  };
  replica?: {
    mainStore?: string;
    slices?: BareSlice[];
    syncSlices?: BareSlice[];
    setupDelay?: number;
    sendDelay?: number;
  };
}) => {
  let mainOnSyncError = jest.fn((error) => {
    console.error(error);
  });
  let mainOnSyncReady = jest.fn();
  let replicaOnSyncError = jest.fn((error) => {
    console.error(error);
  });
  let replicaOnSyncReady = jest.fn();

  const replicaStoreName = 'test-replica-store-1';
  let mainRef: Ref<MyMainChannel> = { current: undefined };
  let replicaRef: Ref<MyReplicaChannel> = { current: undefined };

  mainRef.current = new MyMainChannel([replicaRef], {
    setupDelay: main.setupDelay,
    sendDelay: main.sendDelay,
  });
  replicaRef.current = new MyReplicaChannel(mainRef, {
    replicaStoreName,
    setupDelay: replica.setupDelay,
    sendDelay: replica.sendDelay,
  });

  let mainDispatchSpy = createDispatchSpy();

  const replicaStores = main.replicaStores || ['test-replica-store-1'];

  const mainStore = createSyncStore({
    storeName: 'test-main',
    scheduler: timeoutSchedular(0),
    sync: {
      type: 'main',
      channel: mainRef.current,
      replicaStores,
      slices: main.syncSlices || [],
    },
    slices: main.slices || [],
    debug: mainDispatchSpy.debug,
    dispatchTx: mainDispatchSpy.dispatch,
    onSyncError: mainOnSyncError,
    onSyncReady: mainOnSyncReady,
  });

  let replicaDispatchSpy = createDispatchSpy();

  const replicaStore = createSyncStore({
    storeName: replicaStoreName,
    scheduler: timeoutSchedular(0),
    sync: {
      type: 'replica',
      channel: replicaRef.current,
      mainStore: replica.mainStore || 'test-main',
      slices: replica.syncSlices || [],
    },
    slices: replica.slices || [],
    debug: replicaDispatchSpy.debug,
    dispatchTx: replicaDispatchSpy.dispatch,
    onSyncError: replicaOnSyncError,
    onSyncReady: replicaOnSyncReady,
  });

  return {
    mainDispatchSpy,
    replicaDispatchSpy,
    replicaRef,
    mainRef,
    mainStore,
    replicaStore,
    mainOnSyncError,
    replicaOnSyncError,
    mainOnSyncReady,
    replicaOnSyncReady,
  };
};

describe('basic test', () => {
  test('empty works', async () => {
    const result = createBasicPair({});
    await waitForExpect(() => {
      expect(result.mainDispatchSpy.getDebugLogItems()).toHaveLength(0);
    });

    expect(await result.replicaRef.current?.getMainStoreInfo())
      .toMatchInlineSnapshot(`
      {
        "replicaStoreNames": [
          "test-replica-store-1",
        ],
        "storeName": "test-main",
        "syncSliceKeys": [],
      }
    `);

    expect(
      await result.mainRef.current?.getReplicaStoreInfo('test-replica-store-1'),
    ).toMatchInlineSnapshot(`
      {
        "mainStoreName": "test-main",
        "storeName": "test-replica-store-1",
        "syncSliceKeys": [],
      }
    `);
  });

  test('erroring - sync slice missing in main', async () => {
    const result = createBasicPair({
      main: {
        syncSlices: [],
        slices: [testSlice2],
      },
      replica: {
        syncSlices: [testSlice1],
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await waitForExpect(() => {
      expect(result.mainOnSyncError).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncError).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(0);
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(0);

      expect(result.mainOnSyncError.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `[Error: Invalid Sync setup. Slice "key_testSlice1" is defined in replica store "test-replica-store-1" but not in main store "test-main".]`,
      );
    });
  });

  test('erroring - in main , a slice is defined in sync and other slice', () => {
    expect(() =>
      createBasicPair({
        main: {
          syncSlices: [testSlice2],
          slices: [testSlice2],
        },
        replica: {},
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate slice keys key_testSlice2"`,
    );
  });

  test('erroring - in replica , a slice is defined in sync and other slice', () => {
    expect(() =>
      createBasicPair({
        main: {},
        replica: {
          syncSlices: [testSlice2],
          slices: [testSlice2],
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate slice keys key_testSlice2"`,
    );
  });

  // main's sync slice having no corresponding replica slice
  // is allowed.
  test('having a sync slice in main but no replica', async () => {
    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
        slices: [],
      },
      replica: {
        syncSlices: [],
        slices: [testSlice2],
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 1,
    });
  });

  test('additional slices work in main', async () => {
    const mySlice = new Slice({
      name: 'mySlice',
      initState: {},
      actions: {},
      dependencies: [],
      selectors: {},
      _additionalSlices: [testSlice1],
    });

    const result = createBasicPair({
      main: {
        syncSlices: [mySlice],
        slices: [testSlice2],
      },
      replica: {
        syncSlices: [testSlice1],
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 1,
    });

    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 1,
    });
  });

  test('one slice sync - case 1', async () => {
    const watcherSlice = changeEffect(
      'watch-in-main',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter === 1) {
          dispatch(testSlice1.actions.increment());
        }
      },
    );
    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
        slices: [depOnTestSlice1Slice, watcherSlice],
      },
      replica: {
        syncSlices: [testSlice1],
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 1,
    });

    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(testSlice1.getState(result.replicaStore.state)).toEqual({
        counter: 2,
      });
    });

    expect(result.mainDispatchSpy.getDebugLogItems()).toMatchSnapshot();
    expect(result.replicaDispatchSpy.getDebugLogItems()).toMatchInlineSnapshot(`
      [
        {
          "actionId": "increment",
          "dispatcher": undefined,
          "payload": [],
          "sourceSliceKey": "key_testSlice1",
          "store": "test-main",
          "targetSliceKey": "key_testSlice1",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "actionId": "increment",
          "dispatcher": undefined,
          "payload": [],
          "sourceSliceKey": "key_testSlice1",
          "store": "test-main",
          "targetSliceKey": "key_testSlice1",
          "txId": "<txId>",
          "type": "TX",
        },
      ]
    `);
  });

  test('one slice sync - case 2 - replica slice depends on sync slice', async () => {
    const watcherSlice = changeEffect(
      'watch-in-replica-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter === 1) {
          dispatch(testSlice1.actions.increment());
        }
      },
    );

    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
      },
      replica: {
        syncSlices: [testSlice1],
        slices: [watcherSlice],
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 1,
    });

    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(testSlice1.getState(result.replicaStore.state)).toEqual({
        counter: 2,
      });
    });

    expect(result.replicaDispatchSpy.getDebugLogItems()).toMatchSnapshot();
  });
});

describe('sync queuing', () => {
  test('with a setup delay in replica', async () => {
    const replicaEffectCalled = jest.fn();
    const watcherSlice = changeEffect(
      'watch-in-replica-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter === 1) {
          dispatch(testSlice1.actions.increment());
          dispatch(testSlice1.actions.increment());
          replicaEffectCalled();
        }
      },
    );

    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
        slices: [testSlice2],
      },
      replica: {
        syncSlices: [testSlice1],
        slices: [watcherSlice],
        setupDelay: 300,
      },
    });

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(0);
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await sleep(50);
    expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(0);

    // replica effect should still be called, since we have only delayed the
    // getMainStoreInfo call in replica, which will prevent tx from replica
    // going to main
    expect(replicaEffectCalled).toBeCalledTimes(1);

    // even waiting for 50 the state shouldnt update, as we have queued the
    // txs in replica for 300ms
    await sleep(50);

    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 1,
    });

    await sleep(200);

    expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);

    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 3,
    });
  });

  test('with a setup delay in main', async () => {
    const mainEffectCalled = jest.fn();
    const watcherSlice = changeEffect(
      'watch-in-replica-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter === 1) {
          dispatch(testSlice1.actions.increment());
          dispatch(testSlice1.actions.increment());
          mainEffectCalled();
        }
      },
    );

    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1, watcherSlice],
        slices: [testSlice2],
        setupDelay: 300,
      },
      replica: {
        syncSlices: [testSlice1],
      },
    });

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(0);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await sleep(10);

    // main store shouldn't be blocked, it should get the update still
    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 3,
    });

    // replica store should still be blocked
    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
    });

    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 3,
    });
  });

  test('with a setup delay in main & replica', async () => {
    const mainEffectCalled = jest.fn();
    const replicaEffectCalled = jest.fn();
    const watcherMainSlice = changeEffect(
      'watch-in-main-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter === 1) {
          dispatch(testSlice1.actions.increment());
          mainEffectCalled();
        }
      },
    );

    const watcherReplicaSlice = changeEffect(
      'watch-in-replica-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter === 2) {
          dispatch(testSlice1.actions.increment());
          replicaEffectCalled();
        }
      },
    );

    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
        slices: [watcherMainSlice],
        setupDelay: 300,
      },
      replica: {
        syncSlices: [testSlice1],
        slices: [watcherReplicaSlice],
        setupDelay: 300,
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 3,
    });
    expect(testSlice1.getState(result.replicaStore.state)).toEqual({
      counter: 3,
    });
  });
});

describe('createSyncState', () => {
  test('works', () => {
    const result = createSyncState({
      type: 'main',
      syncSlices: [testSlice1],
      otherSlices: [testSlice2],
    });

    expect(result.syncSliceKeys).toMatchInlineSnapshot(`
      Set {
        "key_testSlice1",
      }
    `);

    expect((result.state as InternalStoreState)._slices.map((r) => r.key))
      .toMatchInlineSnapshot(`
      [
        "key_testSlice1",
        "key_testSlice2",
      ]
    `);
  });

  test('additional slice are expanded', () => {
    const result = createSyncState({
      type: 'main',
      syncSlices: [
        new Slice({
          name: 'mySlice1',
          initState: {},
          actions: {},
          dependencies: [],
          selectors: {},
          _additionalSlices: [testSlice1],
        }),
      ],
      otherSlices: [
        new Slice({
          name: 'mySlice2',
          initState: {},
          actions: {},
          dependencies: [],
          selectors: {},
          _additionalSlices: [testSlice2],
        }),
      ],
    });

    expect(result.syncSliceKeys).toMatchInlineSnapshot(`
      Set {
        "key_testSlice1",
        "key_mySlice1",
      }
    `);
    expect((result.state as InternalStoreState)._slices.map((r) => r.key))
      .toMatchInlineSnapshot(`
      [
        "key_testSlice1",
        "key_mySlice1",
        "key_testSlice2",
        "key_mySlice2",
      ]
    `);
  });

  test('effects are removed in replica', () => {
    const result = createSyncState({
      type: 'replica',
      syncSlices: [
        new Slice({
          name: 'mySlice1',
          initState: {},
          actions: {},
          dependencies: [],
          selectors: {},
        }),
        changeEffect('test-effect-1', {}, () => {}),
      ],
      otherSlices: [changeEffect('test-effect-2', {}, () => {})],
    });

    expect(
      (result.state as InternalStoreState)._slices.map((r) => [
        r.key,
        r.spec.effects,
      ]),
    ).toEqual([
      ['key_mySlice1', []],
      ['key_test-effect-1', []],
      // non sync slice effects are not removed
      [
        'key_test-effect-2',
        [
          expect.objectContaining({
            destroy: expect.any(Function),
            init: expect.any(Function),
            update: expect.any(Function),
          }),
        ],
      ],
    ]);
  });
});

describe('sliceKeyToReplicaStoreLookup', () => {
  test('works', () => {
    expect(
      sliceKeyToReplicaStoreLookup({
        'store-a': {
          mainStoreName: 'main-store',
          storeName: 'store-a',
          syncSliceKeys: ['key_testSlice1', 'key_testSlice2'],
        },

        'store-b': {
          mainStoreName: 'main-store',
          storeName: 'store-b',
          syncSliceKeys: ['key_testSlice1'],
        },
      }),
    ).toEqual({
      key_testSlice1: ['store-a', 'store-b'],
      key_testSlice2: ['store-a'],
    });

    expect(sliceKeyToReplicaStoreLookup({})).toEqual({});

    expect(
      sliceKeyToReplicaStoreLookup({
        'store-a': {
          mainStoreName: 'main-store',
          storeName: 'store-a',
          syncSliceKeys: ['key_testSlice1', 'key_testSlice2'],
        },
      }),
    ).toEqual({
      key_testSlice1: ['store-a'],
      key_testSlice2: ['store-a'],
    });
  });
});

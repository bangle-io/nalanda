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
} from '../sync-store';
import { BareSlice } from '../../vanilla/slice';
import { changeEffect } from '../../effects';
import { InternalStoreState } from '../../vanilla/state';

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
  constructor(public replicaRef: Ref<MyReplicaChannel>) {}

  _mainStoreInfo!: () => MainStoreInfo;
  _receiveTx!: (tx: Transaction<any, any>) => void;

  private _getReplicaChannel = () => {
    const current = this.replicaRef.current;
    if (!current) {
      throw new Error('replicaRef is not set');
    }

    return current;
  };

  provideMainStoreInfo(cb: () => MainStoreInfo): void {
    this._mainStoreInfo = cb;
  }

  destroy(): void {}

  getReplicaStoreInfo(replicaStoreName: string) {
    return Promise.resolve().then(() =>
      this._getReplicaChannel()._replicaStoreInfo(),
    );
  }

  receiveTx(cb: (tx: Transaction<any, any>) => void): void {
    this._receiveTx = cb;
  }

  sendTxToReplicas(tx: Transaction<any, any>): void {
    this._getReplicaChannel()._receiveTx(tx);
  }
}

class MyReplicaChannel implements ReplicaChannel {
  constructor(public mainRef: Ref<MyMainChannel>) {}

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
    return Promise.resolve().then(() => {
      return this._getMainChannel()._mainStoreInfo();
    });
  }

  receiveTx(cb: (tx: Transaction<any, any>) => void): void {
    this._receiveTx = cb;
  }

  sendTxToMain(tx: Transaction<any, any>): void {
    this._getMainChannel()._receiveTx(tx);
  }
}

describe('basic test', () => {
  const createPair = ({
    main = {},
    replica = {},
  }: {
    main?: {
      slices?: BareSlice[];
      syncSlices?: BareSlice[];
      replicaStores?: string[];
    };
    replica?: {
      mainStore?: string;
      slices?: BareSlice[];
      syncSlices?: BareSlice[];
    };
  }) => {
    let mainOnSyncError = jest.fn();
    let mainOnSyncReady = jest.fn();
    let replicaOnSyncError = jest.fn();
    let replicaOnSyncReady = jest.fn();

    let mainRef: Ref<MyMainChannel> = { current: undefined };
    let replicaRef: Ref<MyReplicaChannel> = { current: undefined };

    mainRef.current = new MyMainChannel(replicaRef);
    replicaRef.current = new MyReplicaChannel(mainRef);

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
      storeName: 'test-replica-store-1',
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

  test('empty works', async () => {
    const result = createPair({});
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
    const result = createPair({
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

      expect(result.mainOnSyncError.mock.calls[0][0]).toMatchInlineSnapshot(
        `[Error: Invalid Sync setup. Slice "key_testSlice1" is defined in replica store "test-replica-store-1" but not in main store "test-main".]`,
      );
    });
  });

  test('erroring - in main , a slice is defined in sync and other slice', async () => {
    expect(() =>
      createPair({
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

  test('erroring - in replica , a slice is defined in sync and other slice', async () => {
    expect(() =>
      createPair({
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

  // main's sync slice has no corresponding replica slice, it is fine
  test('having a sync slice in main but no replica', async () => {
    const result = createPair({
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

    const result = createPair({
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
    const result = createPair({
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

    const result = createPair({
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

import waitForExpect from 'wait-for-expect';
import {
  createDispatchSpy,
  createSlice,
  Slice,
  Store,
  timeoutSchedular,
  Transaction,
} from '../../vanilla';
import { createSyncStore, SyncMessage } from '../sync-store';
import { BareSlice } from '../../vanilla/slice';
import { changeEffect, syncChangeEffect } from '../../effects';
import { abortableSetTimeout, getReplicaLookup, SyncManager } from '../helpers';
import { createStableSliceId } from '../../vanilla/internal-types';
import { mergeAll } from '../../merge';
import { PayloadParser, PayloadSerializer } from '../../vanilla/transaction';

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
    update: (num: number) => (state) => ({
      ...state,
      counter: state.counter + num,
    }),
  },
  selector: () => {},
});

let aborter = new AbortController();

const defaultPayloadSerializer: PayloadSerializer = (p) => p;
const defaultPayloadParser: PayloadParser = (p) => {
  if (Array.isArray(p)) {
    return p;
  }
  throw new Error('invalid payload');
};

beforeEach(() => {
  aborter = new AbortController();
});

afterEach(async () => {
  aborter.abort();
  await sleep(0);
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
  selector: () => {},
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
  selector: (state, storeState) => ({
    added: state.dep + testSlice1.getState(storeState).counter,
  }),
});

const createBasicPair = ({
  main = {},
  replica = {},
}: {
  main?: {
    slices?: BareSlice[];
    syncSlices?: BareSlice[];
    replicaStores?: string[];
    sendDelay?: number;
    payloadParser?: typeof defaultPayloadParser;
    payloadSerializer?: typeof defaultPayloadSerializer;
  };
  replica?: {
    mainStore?: string;
    slices?: BareSlice[];
    syncSlices?: BareSlice[];
    setupDelay?: number;
    sendDelay?: number;
    payloadParser?: typeof defaultPayloadParser;
    payloadSerializer?: typeof defaultPayloadSerializer;
  };
}) => {
  let sendMessages: SyncMessage[] = [];

  const cleanMessages = (message: SyncMessage) => {
    message = JSON.parse(
      JSON.stringify(message, (key, value) => {
        if (key === 'uid') {
          return '<<UID>>';
        }
        return value;
      }),
    );
    return message;
  };

  let mainOnSyncError = jest.fn((error) => {});
  let mainOnSyncReady = jest.fn();
  let replicaOnSyncError = jest.fn((error) => {});
  let replicaOnSyncReady = jest.fn();

  const replicaStoreName = 'test-replica-store-1';

  let mainDispatchSpy = createDispatchSpy();

  const replicaStores = main.replicaStores || ['test-replica-store-1'];

  const mainStore = createSyncStore({
    storeName: 'test-main',
    scheduler: timeoutSchedular(0),
    sync: {
      type: 'main',
      replicaStores,
      slices: main.syncSlices || [],
      payloadParser: main.payloadParser || defaultPayloadParser,
      payloadSerializer: main.payloadSerializer || defaultPayloadSerializer,
      sendMessage: (message) => {
        sendMessages.push(cleanMessages(message));
        if (main.sendDelay) {
          abortableSetTimeout(
            () => {
              replicaStore.receiveMessage(message);
            },
            mainStore.store.destroySignal,
            main.sendDelay,
          );
        } else {
          replicaStore.receiveMessage(message);
        }
      },
    },
    slices: main.slices || [],
    debug: mainDispatchSpy.debug,
    dispatchTx: mainDispatchSpy.dispatch,
    onSyncError: mainOnSyncError,
    onSyncReady: mainOnSyncReady,
  });

  let replicaDispatchSpy = createDispatchSpy();

  let replicaStore: any;

  const setupReplica = () => {
    let _replicaStore = createSyncStore({
      storeName: replicaStoreName,
      scheduler: timeoutSchedular(0),
      sync: {
        type: 'replica',
        payloadParser: replica.payloadParser || defaultPayloadParser,
        payloadSerializer:
          replica.payloadSerializer || defaultPayloadSerializer,
        mainStore: replica.mainStore || 'test-main',
        slices: replica.syncSlices || [],
        sendMessage: (message) => {
          sendMessages.push(cleanMessages(message));
          if (replica.sendDelay) {
            abortableSetTimeout(
              () => {
                mainStore.receiveMessage(message);
              },
              mainStore.store.destroySignal,
              replica.sendDelay,
            );
          } else {
            mainStore.receiveMessage(message);
          }
        },
      },
      slices: replica.slices || [],
      debug: replicaDispatchSpy.debug,
      dispatchTx: replicaDispatchSpy.dispatch,
      onSyncError: replicaOnSyncError,
      onSyncReady: replicaOnSyncReady,
    });

    replicaStore = _replicaStore;
  };

  if (replica.setupDelay) {
    abortableSetTimeout(
      () => {
        setupReplica();
      },
      mainStore.store.destroySignal,
      replica.setupDelay,
    );
  } else {
    setupReplica();
  }

  aborter.signal.addEventListener(
    'abort',
    () => {
      mainStore?.store.destroy();
      replicaStore?.store.destroy();
    },
    { once: true },
  );

  return {
    mainDispatchSpy,
    replicaDispatchSpy,
    sendMessages,
    mainStore: mainStore.store,
    getReplicaStore: () => {
      return replicaStore.store;
    },
    mainOnSyncError,
    replicaOnSyncError,
    mainOnSyncReady,
    replicaOnSyncReady,
  };
};

describe('basic test', () => {
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

    result.getReplicaStore().dispatch(testSlice1.actions.increment());

    await waitForExpect(() => {
      expect(result.mainOnSyncError).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncError).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(0);
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(0);

      expect(result.mainOnSyncError.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `[Error: Invalid Sync setup. Slice "testSlice1" is defined in replica store "test-replica-store-1" but not in main store "test-main".]`,
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
      `"Sync slices and other slices are not unique. Please ensure that slices have unique name."`,
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
      `"Sync slices and other slices are not unique. Please ensure that slices have unique name."`,
    );
  });

  test('erroring - in replica , a slice is defined in sync and other slice', () => {
    expect(() =>
      createBasicPair({
        main: {},
        replica: {
          syncSlices: [
            new Slice({
              name: 'mySlice1',
              initState: {},
              actions: {},
              dependencies: [],
              selector: () => {},
              reducer: (s) => s,
              beforeSlices: [testSlice1, testSlice1],
            }),
          ],

          slices: [testSlice2],
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate slice keys key_testSlice1"`,
    );
  });

  // main's sync slice having no corresponding replica slice
  // is allowed.
  test('having a sync slice in main but no replica', async () => {
    const result = createBasicPair({
      main: {
        slices: [],
        syncSlices: [testSlice1],
      },
      replica: {
        slices: [testSlice2],
        syncSlices: [],
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
    expect(result.sendMessages).toMatchSnapshot();
  });

  test('incorrect slice path results in error', async () => {
    // testSlice1 is inside mySlice but the same order is not there in
    // replica
    const mySlice = new Slice({
      name: 'mySlice',
      initState: {},
      actions: {},
      dependencies: [],
      selector: () => {},
      reducer: (s) => s,
      beforeSlices: [testSlice1],
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

    await waitForExpect(() => {
      expect(result.mainOnSyncError).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncError).toHaveBeenCalledTimes(1);
    });

    expect(result.mainOnSyncError.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `[Error: Invalid Sync setup. Slice "testSlice1" is defined in replica store "test-replica-store-1" but not in main store "test-main".]`,
    );
    expect(result.replicaOnSyncError.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `[Error: Handshake error]`,
    );
  });

  test('additional slices work in main', async () => {
    const mySlice = new Slice({
      name: 'mySlice',
      initState: {},
      actions: {},
      dependencies: [],
      selector: () => {},
      reducer: (s) => s,
      beforeSlices: [testSlice1],
    });

    const result = createBasicPair({
      main: {
        syncSlices: [mySlice],
        slices: [testSlice2],
      },
      replica: {
        syncSlices: [mySlice],
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

    expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
      counter: 1,
    });

    expect(result.sendMessages).toMatchSnapshot();
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

    expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
        counter: 2,
      });
    });

    expect(result.mainDispatchSpy.getDebugLogItems()).toMatchSnapshot();
    expect(result.replicaDispatchSpy.getDebugLogItems()).toMatchInlineSnapshot(`
      [
        {
          "actionId": "increment",
          "payload": [],
          "sourceSliceLineage": "l_testSlice1$",
          "store": "test-main",
          "targetSliceLineage": "l_testSlice1$",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "actionId": "increment",
          "dispatcher": "l_watch-in-main$",
          "payload": [],
          "sourceSliceLineage": "l_testSlice1$",
          "store": "test-main",
          "targetSliceLineage": "l_testSlice1$",
          "txId": "<txId>",
          "type": "TX",
        },
      ]
    `);

    expect(result.sendMessages).toMatchSnapshot();
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

    expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
      counter: 0,
    });

    await waitForExpect(() => {
      expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
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
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(0);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(0);
    });

    result.mainStore.dispatch(testSlice1.actions.increment());

    await sleep(50);
    expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(0);

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 1,
    });

    await sleep(300);

    expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);

    expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
      counter: 3,
    });
  });

  test('with a send delay in main & replica', async () => {
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
        sendDelay: 10,
      },
      replica: {
        syncSlices: [testSlice1],
        slices: [watcherReplicaSlice],
        sendDelay: 10,
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());
    await sleep(100);

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 3,
    });
    expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
      counter: 3,
    });

    expect(
      result.sendMessages.map((r) => {
        if (r.type === 'tx') {
          return {
            ...r,
            body: {
              ...r.body,
              tx: {
                ...r.body.tx,
                metadata: {
                  ...r.body.tx.metadata,
                  TX_META_DESERIALIZED_FROM: '<txMetaDeserializedFrom>',
                },
              },
            },
          };
        }
        return r;
      }),
    ).toMatchSnapshot();
  });

  test('both count to 100, with replica starting first', async () => {
    const watcherMainSlice = changeEffect(
      'watch-in-main-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter >= 100) {
          return;
        }

        if (counter % 2 === 1) {
          dispatch(testSlice1.actions.increment());
        }
      },
    );

    const watcherReplicaSlice = changeEffect(
      'watch-in-replica-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter >= 100) {
          return;
        }
        if (counter % 2 === 0) {
          dispatch(testSlice1.actions.increment());
        }
      },
    );

    const fiveSlice = createSlice([], {
      name: 'five',
      initState: {
        fives: 0,
      },
      actions: {
        count: () => (state) => ({
          ...state,
          fives: state.fives + 1,
        }),
      },
      selector: () => {},
    });

    const fiveWatch = syncChangeEffect(
      'watch-five-replica',
      {
        fiveSlice: fiveSlice.passivePick((state) => state.fives),
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter % 5 === 0) {
          dispatch(fiveSlice.actions.count());
        }
      },
    );

    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
        slices: [watcherMainSlice],
        sendDelay: 2,
      },
      replica: {
        syncSlices: [testSlice1],
        slices: [fiveSlice, fiveWatch, watcherReplicaSlice],
        sendDelay: 3,
      },
    });

    await sleep(100);

    await waitForExpect(() => {
      expect(testSlice1.getState(result.mainStore.state)).toEqual({
        counter: 100,
      });
      expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
        counter: 100,
      });

      expect(fiveSlice.getState(result.getReplicaStore().state)).toEqual({
        fives: 21,
      });
    });

    expect(result.sendMessages.find((r) => r.type === 'tx')).toEqual({
      body: {
        tx: expect.objectContaining({
          actionId: 'increment',
        }),
      },
      from: 'test-replica-store-1',
      to: 'test-main',
      type: 'tx',
    });
  });

  test('both count to 100, with main starting first', async () => {
    const watcherMainSlice = changeEffect(
      'watch-in-main-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter >= 100) {
          return;
        }

        if (counter % 2 === 0) {
          dispatch(testSlice1.actions.increment());
        }
      },
    );

    const fiveSlice = createSlice([], {
      name: 'five',
      initState: {
        fives: 0,
      },
      actions: {
        count: () => (state) => ({
          ...state,
          fives: state.fives + 1,
        }),
      },
      selector: () => {},
    });

    const fiveWatch = syncChangeEffect(
      'watch-five-replica',
      {
        fiveSlice: fiveSlice.passivePick((state) => state.fives),
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter % 5 === 0) {
          dispatch(fiveSlice.actions.count());
        }
      },
    );

    const watcherReplicaSlice = changeEffect(
      'watch-in-replica-store',
      {
        counter: testSlice1.pick((state) => state.counter),
      },
      ({ counter }, dispatch) => {
        if (counter >= 100) {
          return;
        }
        if (counter % 2 === 1) {
          dispatch(testSlice1.actions.increment());
        }
      },
    );

    const result = createBasicPair({
      main: {
        syncSlices: [testSlice1],
        slices: [watcherMainSlice, fiveSlice, fiveWatch],
        sendDelay: 1,
      },
      replica: {
        syncSlices: [testSlice1],
        slices: [watcherReplicaSlice],
        sendDelay: 2,
      },
    });

    await sleep(100);

    await waitForExpect(() => {
      expect(testSlice1.getState(result.mainStore.state)).toEqual({
        counter: 100,
      });
      expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
        counter: 100,
      });
      expect(fiveSlice.getState(result.mainStore.state)).toEqual({
        fives: 21,
      });
    });
    // first should be main
    expect(result.sendMessages.find((r) => r.type === 'tx')).toEqual({
      body: {
        tx: expect.objectContaining({
          actionId: 'increment',
        }),
      },
      from: 'test-main',
      to: 'test-replica-store-1',
      type: 'tx',
    });
  });
});

describe('SyncManager', () => {
  test('works', () => {
    const result = new SyncManager({
      storeName: 'test',
      sync: {
        type: 'main',
        slices: [testSlice1],
        replicaStores: [],
        sendMessage: () => {},
        payloadParser: defaultPayloadParser,
        payloadSerializer: defaultPayloadSerializer,
      },
      otherSlices: [testSlice2],
    });

    expect(result.syncSlices.map((r) => r.lineageId)).toMatchInlineSnapshot(`
      [
        "l_testSlice1$",
      ]
    `);
    expect(result.syncSliceIds).toMatchInlineSnapshot(`
      [
        "testSlice1",
      ]
    `);
  });

  test('additional slice are expanded', () => {
    const result = new SyncManager({
      storeName: 'test',
      sync: {
        payloadParser: defaultPayloadParser,
        payloadSerializer: defaultPayloadSerializer,
        type: 'main',
        slices: [
          new Slice({
            name: 'mySlice1',
            initState: {},
            actions: {},
            dependencies: [],
            selector: () => {},
            reducer: (s) => s,
            beforeSlices: [testSlice1],
          }),
        ],
        replicaStores: [],
        sendMessage: () => {},
      },
      otherSlices: [testSlice2],
    });

    expect(result.syncSliceIds).toMatchInlineSnapshot(`
      [
        "mySlice1",
        "mySlice1.testSlice1",
      ]
    `);
    expect(result.otherSlices.map((r) => r.lineageId)).toMatchInlineSnapshot(`
      [
        "l_testSlice2$",
      ]
    `);
  });

  test('effects are removed in replica', () => {
    const result = new SyncManager({
      storeName: 'test',
      sync: {
        type: 'replica',
        mainStore: 'main-store',
        slices: [
          new Slice({
            name: 'mySlice1',
            initState: {},
            actions: {},
            dependencies: [],
            selector: () => {},
            reducer: (s) => s,
          }),
          changeEffect('test-effect-1', {}, () => {}),
        ],
        sendMessage: () => {},
        payloadSerializer: (p) => p,
        payloadParser: (p) => {
          if (Array.isArray(p)) {
            return p;
          }
          throw new Error('invalid payload');
        },
      },
      otherSlices: [changeEffect('test-effect-2', {}, () => {})],
    });

    expect(result.syncSlices.map((r) => [r.lineageId, r.spec.effects])).toEqual(
      [
        [expect.stringMatching(/^l_mySlice1\$/), []],
        [expect.stringMatching(/^l_test-effect-1\$/), []],
      ],
    );
    expect(
      result.otherSlices.map((r) => [r.lineageId, r.spec.effects]),
    ).toEqual(
      // non sync slice effects are not removed
      [
        [
          'l_test-effect-2$',
          [
            expect.objectContaining({
              destroy: expect.any(Function),
              init: expect.any(Function),
              update: expect.any(Function),
              name: 'test-effect-2(changeEffect)',
            }),
          ],
        ],
      ],
    );
  });
});

describe('serialization', () => {
  test('correctly calls', async () => {
    const mainParser = jest.fn((p) => p);
    const mainSerializer = jest.fn((p) => p);

    const replicaParser = jest.fn((p) => p);
    const replicaSerializer = jest.fn((p) => p);

    const result = createBasicPair({
      main: {
        slices: [],
        syncSlices: [testSlice1],
        payloadParser: mainParser,
        payloadSerializer: mainSerializer,
      },
      replica: {
        slices: [],
        syncSlices: [testSlice1],
        payloadParser: replicaParser,
        payloadSerializer: replicaSerializer,
      },
    });

    result.mainStore.dispatch(testSlice1.actions.increment());
    result.mainStore.dispatch(testSlice1.actions.update(3));

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    // expect(mainParser).toHaveBeenCalledTimes(1);
    expect(mainSerializer).toHaveBeenCalledTimes(2);
    expect(mainSerializer).nthCalledWith(1, [], expect.any(Transaction));
    expect(mainSerializer).nthCalledWith(2, [3], expect.any(Transaction));

    expect(replicaParser).toHaveBeenCalledTimes(2);
    expect(replicaParser).nthCalledWith(
      1,
      [],
      expect.anything(),
      expect.any(Store),
    );
    expect(replicaParser).nthCalledWith(
      2,
      [3],
      expect.anything(),
      expect.any(Store),
    );
  });
});

describe('getReplicaLookup', () => {
  const syncManager = new SyncManager({
    storeName: 'test',
    sync: {
      type: 'main',
      slices: [testSlice1],
      replicaStores: [],
      sendMessage: () => {},
      payloadParser: defaultPayloadParser,
      payloadSerializer: defaultPayloadSerializer,
    },
    otherSlices: [testSlice2],
  });

  const lookup = getReplicaLookup(syncManager, {
    'store-a': {
      mainStoreName: 'main-store',
      storeName: 'store-a',
      syncSliceIds: [
        createStableSliceId(testSlice1.name),
        createStableSliceId(testSlice2.name),
      ],
    },
    'store-b': {
      mainStoreName: 'main-store',
      storeName: 'store-b',
      syncSliceIds: [createStableSliceId(testSlice1.name)],
    },
    'store-c': {
      mainStoreName: 'main-store',
      storeName: 'store-c',
      syncSliceIds: [],
    },
  });

  expect(lookup).toMatchInlineSnapshot(`
    {
      "l_testSlice1$": [
        "store-a",
        "store-b",
      ],
      "l_testSlice2$": [
        "store-a",
      ],
    }
  `);
});

describe('works with merged slice', () => {
  test('nested', async () => {
    const forwarded1 = mergeAll([testSlice1, testSlice2], {
      name: 'test-merged',
    });

    const result = createBasicPair({
      main: {
        syncSlices: [forwarded1],
        slices: [depOnTestSlice1Slice],
      },
      replica: {
        syncSlices: [forwarded1],
      },
    });

    result.mainStore.dispatch(forwarded1.actions.increment());
    result.mainStore.dispatch(forwarded1.actions.padEnd(5, 'padding'));

    expect(testSlice1.getState(result.mainStore.state)).toEqual({
      counter: 1,
    });

    expect(forwarded1.resolveState(result.mainStore.state)).toEqual({
      counter: 1,
      name: 'kjpad',
    });

    await waitForExpect(() => {
      expect(result.mainOnSyncReady).toHaveBeenCalledTimes(1);
      expect(result.replicaOnSyncReady).toHaveBeenCalledTimes(1);
    });

    expect(testSlice1.getState(result.getReplicaStore().state)).toEqual({
      counter: 1,
    });
    expect(testSlice2.getState(result.getReplicaStore().state)).toEqual({
      name: 'kjpad',
    });
    expect(forwarded1.resolveState(result.getReplicaStore().state)).toEqual({
      counter: 1,
      name: 'kjpad',
    });

    result.mainStore.dispatch(forwarded1.actions.uppercase());

    expect(forwarded1.resolveState(result.getReplicaStore().state)).toEqual({
      counter: 1,
      name: 'KJPAD',
    });

    await waitForExpect(() => {
      expect(forwarded1.resolveState(result.getReplicaStore().state)).toEqual({
        counter: 1,
        name: 'KJPAD',
      });
    });
  });
});

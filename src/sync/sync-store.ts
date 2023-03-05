import { Store, Transaction } from '../vanilla';
import { idleCallbackScheduler, Scheduler } from '../vanilla/effect';
import { BareStore } from '../vanilla/public-types';
import { BareSlice } from '../vanilla/slice';
import { DispatchTx } from '../vanilla/store';
import { DebugFunc } from '../vanilla/transaction';

interface Channel {
  send: (data: any) => void;
  receive: (cb: (data: any) => void) => void;
}

export function SyncStore<SbSync extends BareSlice, SbOther extends BareSlice>({
  scheduler = idleCallbackScheduler(10),
  type,
  syncSlices,
  otherSlices,
  storeName,
  debug,
  channel,
}: {
  type: 'replica' | 'main';
  disableSideEffects?: boolean;
  dispatchTx?: DispatchTx<Transaction<any, any>>;
  scheduler: Scheduler;
  syncSlices: SbSync[];
  otherSlices: SbOther[];
  storeName: string;
  channel: Channel;
  debug?: DebugFunc;
}): BareStore<SbSync | SbOther> {
  // do a handshake before dispatching transactions

  const _dispatchTx: DispatchTx<Transaction<any, any>> = (store, tx) => {
    channel.send(tx);

    let newState = store.state.applyTransaction(tx);

    if (newState === store.state) {
      console.debug('No state change, skipping update', tx.targetSliceKey);

      return;
    }

    store.updateState(newState, tx);
  };

  const store = Store.create({
    disableSideEffects: false,
    dispatchTx: _dispatchTx,
    state: [...syncSlices, ...otherSlices],
    storeName,
    scheduler,
    debug,
  });

  channel.receive((data) => {
    const tx = data as Transaction<any, any>;

    store.dispatch(tx);
  });

  return store;
}

/**
 * @jest-environment jsdom
 */
import React, { useState } from 'react';
import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  Store,
  StoreState,
  createKey,
  createStore,
  EffectScheduler,
} from '@nalanda/core';
import { createContext, useContext, useRef } from 'react';
import { useTrack, useTrackField } from '../react';

const zeroTimeoutScheduler: EffectScheduler = (cb, opts) => {
  setTimeout(() => {
    cb();
  }, 0);
};

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const setup = () => {
  const key = createKey('mySliceName', []);

  const counter = key.field(0);
  const counterNegative = key.field(-1);

  const counterSlice = key.slice({
    fields: { counter, counterNegative },
  });

  function increment() {
    return counter.update((c) => c + 1);
  }

  function incrementNegativeCounter() {
    return counterNegative.update((c) => c - 1);
  }

  const StoreContext = createContext<Store<any> | null>(null);

  const StoreProvider = ({ children }: { children: React.ReactNode }) => {
    const storeRef = useRef<Store<any>>();
    if (!storeRef.current) {
      storeRef.current = createStore({
        slices: [counterSlice],
        name: 'test-store',
        overrides: {
          effectScheduler: zeroTimeoutScheduler,
        },
      });
    }

    return (
      <StoreContext.Provider value={storeRef.current}>
        {children}
      </StoreContext.Provider>
    );
  };

  const useStore = () => {
    const store = useContext(StoreContext);
    if (!store) {
      throw new Error('Missing StoreProvider');
    }
    return store;
  };

  return {
    StoreProvider,
    useStore,
    counterSlice,
    increment,
    incrementNegativeCounter,
  };
};

test('gets value', () => {
  const { StoreProvider, useStore, counterSlice } = setup();

  function MyComponent() {
    const store = useStore();
    return <div>counter={counterSlice.get(store.state).counter}</div>;
  }

  render(
    <StoreProvider>
      <MyComponent />
    </StoreProvider>,
  );

  expect(screen.getByText('counter=0')).toBeDefined();
});

describe('useTrack', () => {
  test('updates values', async () => {
    const { StoreProvider, useStore, counterSlice, increment } = setup();

    let _store: Store<any>;
    function MyComponent() {
      const store = useStore();
      _store = store;

      const { counter } = useTrack(counterSlice, store);

      return <div>counter={counter}</div>;
    }

    render(
      <StoreProvider>
        <MyComponent />
      </StoreProvider>,
    );

    expect(screen.getByText('counter=0')).toBeDefined();

    act(() => {
      _store.dispatch(increment());
    });

    await waitFor(() => {
      expect(screen.getByText('counter=1')).toBeDefined();
    });
  });

  test('does not update if component is not tracking a field', async () => {
    const {
      StoreProvider,
      useStore,
      counterSlice,
      increment,
      incrementNegativeCounter,
    } = setup();

    let _store: Store<any>;
    let renderCount = 0;
    function MyComponent() {
      const store = useStore();
      _store = store;
      const { counterNegative } = useTrack(counterSlice, store);
      renderCount++;

      return <div>counterNegative={counterNegative}</div>;
    }

    render(
      <StoreProvider>
        <MyComponent />
      </StoreProvider>,
    );
    expect(renderCount).toBe(1);

    // let effects run, since the first render is by react
    // second is by effect
    await act(async () => {
      await sleep(2);
    });

    expect(renderCount).toBe(2);

    expect(screen.getByText('counterNegative=-1')).toBeDefined();

    await act(async () => {
      _store.dispatch(increment());

      await sleep(20);
    });
    // should not render since the component is not tracking the field
    expect(renderCount).toBe(2);
    // should not update
    expect(screen.getByText('counterNegative=-1')).toBeDefined();

    // dispatch txn which updates the field
    act(() => {
      _store.dispatch(incrementNegativeCounter());
    });

    await waitFor(() => {
      expect(screen.getByText('counterNegative=-2')).toBeDefined();
    });

    expect(renderCount).toBe(3);
  });
});

describe('useTrackField', () => {
  test('updates values', async () => {
    const { StoreProvider, useStore, counterSlice, increment } = setup();

    let _store: Store<any>;
    function MyComponent() {
      const store = useStore();
      _store = store;

      const counter = useTrackField(counterSlice, 'counter', store);

      return <div>counter={counter}</div>;
    }

    render(
      <StoreProvider>
        <MyComponent />
      </StoreProvider>,
    );

    expect(screen.getByText('counter=0')).toBeDefined();

    act(() => {
      _store.dispatch(increment());
    });

    await waitFor(() => {
      expect(screen.getByText('counter=1')).toBeDefined();
    });
  });
});

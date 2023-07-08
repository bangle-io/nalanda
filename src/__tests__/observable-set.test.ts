import { ObservableSet } from '../helpers/observable-set';

describe('ObservableSet', () => {
  let set: ObservableSet<number>;
  let mockListener: jest.Mock;

  let unsubscribe = () => {};

  beforeEach(() => {
    set = new ObservableSet<number>();
    mockListener = jest.fn();
    unsubscribe = set.subscribe(mockListener);
  });

  it('should notify listeners when a value is added', () => {
    set.add(1);
    expect(mockListener).toHaveBeenCalledWith('ADD', set.getSet());
  });

  it('should notify listeners when a value is removed', () => {
    set.add(1);

    set.delete(1);
    expect(mockListener).toHaveBeenCalledWith('ADD', set.getSet());
    expect(mockListener).toHaveBeenCalledTimes(2);
  });

  it('should notify listeners when the set is cleared', () => {
    set.add(1);
    set.clear();
    expect(mockListener).nthCalledWith(1, 'ADD', set.getSet());
    expect(mockListener).nthCalledWith(2, 'REMOVE', set.getSet());

    expect(mockListener).toHaveBeenCalledTimes(2);
  });

  it('should not notify unsubscribed listeners', () => {
    unsubscribe();
    set.add(1);
    expect(mockListener).not.toHaveBeenCalled();
  });

  it('should contain added values', () => {
    set.add(1);
    expect([...set.getSet()]).toContain(1);
  });

  it('should not contain deleted values', () => {
    set.add(1);
    set.delete(1);
    expect([...set.getSet()]).not.toContain(1);
  });

  it('should not contain any values after clear', () => {
    set.add(1);
    set.clear();
    expect([...set.getSet()]).toHaveLength(0);
  });
});

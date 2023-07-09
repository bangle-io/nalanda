import { slice } from '../../slice';
import { AnySlice } from '../../types';
import { RunInstance } from '../run-instance';

// describe('RunInstance', () => {
//   let sliceA: AnySlice;
//   let sliceB: AnySlice;

//   beforeEach(() => {
//     // Initialize your slices here. The actual initialization depends on your implementation
//     sliceA = slice([], {
//       name: 'slice1',
//       state: {
//         foo: 'bar',
//       },
//     });
//     sliceB = slice([], {
//       name: 'slice2',
//       state: {
//         foo: 'bar',
//       },
//     });
//   });

//   describe('isDependency', () => {
//     it('should identify tracked slice correctly', () => {
//       let runInstance = new RunInstance();

//       runInstance.addTrackedField(sliceA, 'foo', 'bar');

//       expect(runInstance.isDependency(sliceA)).toBe(true);
//       expect(runInstance.isDependency(sliceB)).toBe(false);
//     });
//   });

//   describe('didDependenciesStateChange', () => {
//     it('should return false for a blank instance', () => {
//       let runInstance1 = new RunInstance();

//       expect(runInstance1.didDependenciesStateChange()).toBe(false);
//     });

//     it('should return true for an instance with dependencies but no prev dependencies', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');

//       expect(runInstance1.didDependenciesStateChange()).toBe(true);
//       expect(runInstance1.isDependency(sliceA)).toBe(true);
//     });

//     it('should return true if dependencies have been added', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');

//       let runInstance2 = runInstance1.newRun();
//       expect(runInstance2.isDependency(sliceA)).toBe(false);

//       runInstance2.addTrackedField(sliceA, 'foo', 'xyz');

//       expect(runInstance2.isDependency(sliceA)).toBe(true);

//       expect(runInstance1.didDependenciesStateChange()).toBe(true);
//     });

//     it('should return false if previous and current dependencies are the same', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');
//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'bar');

//       expect(runInstance2.didDependenciesStateChange()).toBe(false);
//     });

//     it('should return false if previous and current dependencies are the same', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');
//       runInstance1.addTrackedField(sliceB, 'xyz', 'abc');

//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'bar');
//       runInstance2.addTrackedField(sliceB, 'xyz', 'abc');

//       expect(runInstance2.didDependenciesStateChange()).toBe(false);
//     });

//     it('should return false if tracking same field with different non-primitive values, same value different instances', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', { prop: 'bar' });

//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', { prop: 'bar' });

//       expect(runInstance2.didDependenciesStateChange()).toBe(true);
//     });

//     it('should return false if tracking same field with different non-primitive values, same value different instances', () => {
//       let runInstance1 = new RunInstance();

//       const val = { prop: 'bar' };
//       runInstance1.addTrackedField(sliceA, 'foo', val);

//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', val);

//       expect(runInstance2.didDependenciesStateChange()).toBe(false);
//     });

//     it('should return true if current dependencies changed value', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');
//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'baz');

//       expect(runInstance2.didDependenciesStateChange()).toBe(true);
//     });

//     it('should return true if a field was added to current dependencies', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');
//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'bar');
//       runInstance2.addTrackedField(sliceA, 'baz', 'qux');

//       expect(runInstance2.didDependenciesStateChange()).toBe(true);
//     });

//     it('should return true if a slice was added to current dependencies and is being tracked', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');
//       runInstance1.addTrackedField(sliceB, 'baz', 'qux');
//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'bar');
//       runInstance2.addTrackedField(sliceB, 'baz', 'quux');

//       expect(runInstance2.didDependenciesStateChange()).toBe(true);
//     });

//     it('should return false if a slice was added to prev dependencies but is not being tracked currently', () => {
//       let runInstance1 = new RunInstance();
//       runInstance1.addTrackedField(sliceA, 'foo', 'bar');

//       let runInstance2 = runInstance1.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'bar');
//       runInstance2.addTrackedField(sliceB, 'baz', 'qux');

//       let runInstance3 = runInstance2.newRun();
//       runInstance2.addTrackedField(sliceA, 'foo', 'bar');

//       expect(runInstance3.didDependenciesStateChange()).toBe(false);

//       runInstance3.addTrackedField(sliceA, 'foo', 'barrr');

//       expect(runInstance3.didDependenciesStateChange()).toBe(true);
//     });
//   });

//   describe('#newRun', () => {
//     it('executes all cleanup callbacks on creating a new RunInstance', () => {
//       const runInstance = new RunInstance();
//       const cleanupCallback1 = jest.fn();
//       const cleanupCallback2 = jest.fn();

//       runInstance.addCleanup(cleanupCallback1);
//       runInstance.addCleanup(cleanupCallback2);

//       expect(runInstance.newRun()).toBeInstanceOf(RunInstance);

//       expect(cleanupCallback1).toBeCalled();
//       expect(cleanupCallback2).toBeCalled();
//     });

//     it('creates a fresh RunInstance  without carrying forward any tracked fields', () => {
//       const initialRunInstance = new RunInstance();
//       initialRunInstance.addTrackedField(sliceA, 'property', 'value');
//       expect(initialRunInstance.isDependency(sliceA)).toBe(true);

//       const newRunInstance = initialRunInstance.newRun();

//       expect(newRunInstance.isDependency(sliceA)).toBe(false);
//     });

//     it('creates a new RunInstance without carrying forward cleanup callbacks', () => {
//       const initialRunInstance = new RunInstance();
//       initialRunInstance.addCleanup(() => {});

//       expect(initialRunInstance.cleanups.size).toBe(1);

//       const newRunInstance = initialRunInstance.newRun();

//       expect(newRunInstance.cleanups.size).toBe(0);
//     });
//   });
// });

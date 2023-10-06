/* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
import { describe, test } from '@jest/globals';
import { IfSubset, expectType } from '../types';

describe('IfSubset', () => {
  test('works', () => {
    expectType<
      IfSubset<'kushan', 'kushan' | 'joshi' | 'test', 'yes', 'no'>,
      'yes'
    >('yes');
    expectType<IfSubset<'kushan', 'kushan' | 'joshi', 'yes', 'no'>, 'yes'>(
      'yes',
    );
    expectType<IfSubset<'kushan', 'kushan', 'yes', 'no'>, 'yes'>('yes');

    expectType<IfSubset<'kushan', '', 'yes', 'no'>, 'no'>('no');
    expectType<
      IfSubset<'kushan' | 'joshi', 'kushan' | 'c' | 'joshi' | 'c', 'yes', 'no'>,
      'yes'
    >('yes');

    expectType<
      IfSubset<
        'kushan' | 'joshi' | 'k',
        'kushan' | 'c' | 'joshi' | 'c',
        'yes',
        'no'
      >,
      'no'
    >('no');

    expectType<
      IfSubset<
        'kushan' | 'joshi' | 'k',
        'kushan' | 'c' | 'joshi' | 'c' | 'k',
        'yes',
        'no'
      >,
      'yes'
    >('yes');
  });
});

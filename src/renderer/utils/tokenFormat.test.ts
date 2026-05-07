import { expect, test } from 'vitest';

import { formatTokenCount } from './tokenFormat';

test('formatTokenCount: values below 1000 returned as-is', () => {
  expect(formatTokenCount(0)).toBe('0');
  expect(formatTokenCount(1)).toBe('1');
  expect(formatTokenCount(647)).toBe('647');
  expect(formatTokenCount(999)).toBe('999');
});

test('formatTokenCount: values in thousands formatted as k', () => {
  expect(formatTokenCount(1000)).toBe('1k');
  expect(formatTokenCount(1200)).toBe('1.2k');
  expect(formatTokenCount(29600)).toBe('29.6k');
  expect(formatTokenCount(128000)).toBe('128k');
  expect(formatTokenCount(200000)).toBe('200k');
});

test('formatTokenCount: values in millions formatted as M', () => {
  expect(formatTokenCount(1000000)).toBe('1M');
  expect(formatTokenCount(1500000)).toBe('1.5M');
  expect(formatTokenCount(2000000)).toBe('2M');
});

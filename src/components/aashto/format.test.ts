// Number formats of the screens: quantities (ft, sq ft, each) and shares (%).
import { describe, expect, it } from 'vitest';
import { formatPct, formatQty } from './format';

describe('formatQty: thousands separator for integers, up to two decimals otherwise (trailing zeros dropped)', () => {
  it('integers', () => {
    expect(formatQty(8316)).toBe('8,316');
    expect(formatQty(4)).toBe('4');
    expect(formatQty(0)).toBe('0');
  });

  it('decimals', () => {
    expect(formatQty(70.34)).toBe('70.34');
    expect(formatQty(80.25)).toBe('80.25');
    expect(formatQty(35.17)).toBe('35.17');
    expect(formatQty(1230.5)).toBe('1,230.5');
    expect(formatQty(2.0000001)).toBe('2');
  });

  it('a dash when not a number', () => {
    expect(formatQty(Number.NaN)).toBe('—');
    expect(formatQty(null)).toBe('—');
    expect(formatQty(undefined)).toBe('—');
  });
});

describe('formatPct: share (0-1) to a one-decimal percentage', () => {
  it('ordinary values get one decimal', () => {
    expect(formatPct(0.004)).toBe('0.4%');
    expect(formatPct(0.996)).toBe('99.6%');
    expect(formatPct(8304 / 8316)).toBe('99.9%');
    expect(formatPct(0.25)).toBe('25.0%');
  });

  it('0 and 1 are integers; above 0 but under 0.1% gives <0.1%', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(1)).toBe('100%');
    expect(formatPct(0.0004)).toBe('<0.1%');
  });

  it('gives >99.9% when rounding would reach 100%, so a remainder never reads as 100%', () => {
    expect(formatPct(0.99996)).toBe('>99.9%');
  });
});

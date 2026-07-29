import { describe, expect, it } from 'vitest';
import { resolveMontageMode } from './montage-policy';

describe('service montage capability matrix', () => {
  it.each([
    ['digital', undefined, 'disabled'],
    ['digital', 'optional', 'optional'],
    ['digital', 'required', 'required'],
    ['offset', 'optional', 'optional'],
    ['offset', 'required', 'required'],
    ['other', 'optional', 'disabled'],
    ['other', 'required', 'disabled'],
  ] as const)('%s + %s resolves to %s', (printCategory, montageMode, expected) => {
    expect(resolveMontageMode({ printCategory }, { montageMode })).toBe(expected);
  });
});


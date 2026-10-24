import { describe, expect, it } from 'vitest';

import { isSiteModulePath, resolveModule } from './module-path';

describe('resolveModule', () => {
  it('reads the map and the list from their own addresses', () => {
    expect(resolveModule('/map')).toBe('map');
    expect(resolveModule('/map/ticket')).toBe('map');
    expect(resolveModule('/list')).toBe('list');
    expect(resolveModule('/list/ticket')).toBe('list');
  });

  it('reads every other page as the map', () => {
    expect(resolveModule('/')).toBe('map');
    expect(resolveModule('/briefing')).toBe('map');
    expect(resolveModule('/listing')).toBe('map');
  });
});

describe('isSiteModulePath', () => {
  it('holds only on the map’s and the list’s own pages', () => {
    expect(isSiteModulePath('/map')).toBe(true);
    expect(isSiteModulePath('/list/station')).toBe(true);
    expect(isSiteModulePath('/')).toBe(false);
    expect(isSiteModulePath('/briefing')).toBe(false);
    expect(isSiteModulePath('/no-such-page')).toBe(false);
    expect(isSiteModulePath('/listing')).toBe(false);
  });
});

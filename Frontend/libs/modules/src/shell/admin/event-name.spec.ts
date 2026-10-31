import { describe, expect, it } from 'vitest';

import { sidebarEventName } from './event-name';

describe('sidebarEventName', () => {
  const name = '花蓮馬太鞍溪堰塞湖專案';

  it('shows the short name, with the full name to hover', () => {
    expect(sidebarEventName({ name, short_name: '花蓮馬太鞍溪' })).toEqual({
      label: '花蓮馬太鞍溪',
      fullName: name,
    });
  });

  it('shows the full name when there is no short name', () => {
    expect(sidebarEventName({ name, short_name: null })).toEqual({
      label: name,
      fullName: name,
    });
    expect(sidebarEventName({ name, short_name: '  ' })).toEqual({
      label: name,
      fullName: name,
    });
  });

  it('names nothing until the settings name the event', () => {
    expect(sidebarEventName(undefined)).toBeNull();
    expect(sidebarEventName({ name: null, short_name: null })).toBeNull();
  });
});

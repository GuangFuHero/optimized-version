import { describe, expect, it } from 'vitest';

import { PLATFORM_NAME, siteBrandName } from './event-name';

describe('siteBrandName', () => {
  it('names the event by its short name, with the full name to hover', () => {
    expect(
      siteBrandName({
        name: '花蓮馬太鞍溪堰塞湖專案',
        shortName: '花蓮馬太鞍溪',
      }),
    ).toEqual({ label: '花蓮馬太鞍溪', fullName: '花蓮馬太鞍溪堰塞湖專案' });
  });

  it('uses the full name when there is no short name', () => {
    const named = {
      label: '花蓮馬太鞍溪堰塞湖專案',
      fullName: '花蓮馬太鞍溪堰塞湖專案',
    };

    expect(
      siteBrandName({ name: '花蓮馬太鞍溪堰塞湖專案', shortName: null }),
    ).toEqual(named);
    expect(siteBrandName({ name: '花蓮馬太鞍溪堰塞湖專案' })).toEqual(named);
    expect(
      siteBrandName({ name: '花蓮馬太鞍溪堰塞湖專案', shortName: '  ' }),
    ).toEqual(named);
  });

  it('keeps the platform’s name until the event is set, or when it fails to load', () => {
    expect(siteBrandName(null)).toEqual({
      label: PLATFORM_NAME,
      fullName: null,
    });
    expect(siteBrandName(undefined)).toEqual({
      label: PLATFORM_NAME,
      fullName: null,
    });
    expect(PLATFORM_NAME).toBe('島嶼守望');
  });

  it('leaves the name blank while the event loads', () => {
    expect(siteBrandName(undefined, { pending: true })).toEqual({
      label: '',
      fullName: null,
    });
  });

  it('blanks the name only while there is no answer yet', () => {
    expect(
      siteBrandName(
        { name: '花蓮馬太鞍溪堰塞湖專案', shortName: '花蓮馬太鞍溪' },
        { pending: true },
      ),
    ).toEqual({ label: '花蓮馬太鞍溪', fullName: '花蓮馬太鞍溪堰塞湖專案' });
    expect(siteBrandName(null, { pending: true })).toEqual({
      label: PLATFORM_NAME,
      fullName: null,
    });
  });
});

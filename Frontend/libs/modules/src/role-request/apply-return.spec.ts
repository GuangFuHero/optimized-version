import { describe, expect, it } from 'vitest';

import {
  buildPhoneStepUpHref,
  readApplyReturn,
  stripApplyReturn,
} from './apply-return';

describe('buildPhoneStepUpHref', () => {
  it('goes to LINE for this one action, and back to the same page with the drawer to open', () => {
    const href = new URL(
      buildPhoneStepUpHref({
        pathname: '/map/osm-direct/station/@23.66,121.42,16z',
        search: '?id=s-1',
      }),
      'http://site.invalid',
    );

    expect(href.pathname).toBe('/api/v1/auth/oauth/line/start');
    expect(href.searchParams.get('purpose')).toBe('step_up');
    expect(href.searchParams.get('action')).toBe('add_contact');
    expect(href.searchParams.get('app')).toBe('site');
    expect(href.searchParams.get('return_to')).toBe(
      '/map/osm-direct/station/@23.66,121.42,16z?id=s-1&apply=1',
    );
  });

  it('does not carry the last trip back into the next', () => {
    const href = new URL(
      buildPhoneStepUpHref({
        pathname: '/list',
        search: '?apply=1&step_up_error=oauth_cancelled',
      }),
      'http://site.invalid',
    );

    expect(href.searchParams.get('return_to')).toBe('/list?apply=1');
  });
});

describe('readApplyReturn', () => {
  it('reads the proof, or what went wrong at LINE', () => {
    expect(readApplyReturn(new URLSearchParams('apply=1&step_up=ok'))).toEqual({
      stepUp: 'ok',
    });
    expect(
      readApplyReturn(
        new URLSearchParams('apply=1&step_up_error=oauth_cancelled'),
      ),
    ).toEqual({ stepUp: { error: 'oauth_cancelled' } });
    expect(readApplyReturn(new URLSearchParams('apply=1'))).toEqual({
      stepUp: null,
    });
  });

  it('reads nothing from an address without the marker', () => {
    expect(readApplyReturn(new URLSearchParams('step_up=ok'))).toBeNull();
  });
});

describe('stripApplyReturn', () => {
  it('takes the way back off and keeps the rest', () => {
    expect(stripApplyReturn('/list?q=a&apply=1&step_up=ok#top')).toBe(
      '/list?q=a#top',
    );
  });

  it('hands an address without it back as it came', () => {
    expect(stripApplyReturn('/list?q=a%20b')).toBe('/list?q=a%20b');
  });
});

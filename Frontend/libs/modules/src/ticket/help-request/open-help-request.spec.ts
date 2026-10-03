import { describe, expect, it, vi } from 'vitest';

import { onOpenHelpRequest, openHelpRequest } from './open-help-request';

describe('openHelpRequest', () => {
  it('asks for the drawer with no point from a button, so the drawer finds where the person is', () => {
    const host = vi.fn();
    const stop = onOpenHelpRequest(host);

    openHelpRequest();

    expect(host).toHaveBeenCalledWith(null);
    stop();
  });

  it('carries the point picked on the map, for the drawer to start from', () => {
    const host = vi.fn();
    const stop = onOpenHelpRequest(host);

    openHelpRequest({ lat: 23.6725, lng: 121.4235 });

    expect(host).toHaveBeenCalledWith({ lat: 23.6725, lng: 121.4235 });
    stop();
  });

  it('stops reaching a host that has gone', () => {
    const host = vi.fn();
    const stop = onOpenHelpRequest(host);

    stop();
    openHelpRequest();

    expect(host).not.toHaveBeenCalled();
  });
});

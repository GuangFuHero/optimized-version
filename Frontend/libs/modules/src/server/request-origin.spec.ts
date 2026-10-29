import { describe, expect, it } from 'vitest';

import { originFromHeaders } from './request-origin';

describe('originFromHeaders', () => {
  it('takes the host and scheme the proxy forwarded', () => {
    expect(
      originFromHeaders(
        new Headers({
          host: 'demo:3000',
          'x-forwarded-host': 'site.example',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://site.example');
  });

  it('falls back to the host it was called on, over http', () => {
    expect(originFromHeaders(new Headers({ host: 'localhost:3200' }))).toBe(
      'http://localhost:3200',
    );
  });

  it('names localhost when the request names no host at all', () => {
    expect(originFromHeaders(new Headers())).toBe('http://localhost:3000');
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('zod-jitless', () => {
  it('turns off zod\'s eval probe for every schema built afterwards', async () => {
    await import('./zod-jitless');

    expect(z.config().jitless).toBe(true);
  });
});

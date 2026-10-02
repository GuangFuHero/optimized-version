import { describe, expect, it } from 'vitest';

import { pointForMetadata } from './document-metadata';

const ticket = { id: 'ticket-1', title: '需要清淤人力' };

describe('pointForMetadata', () => {
  it('names the point that is open, once it has been read', () => {
    expect(pointForMetadata('ticket-1', ticket)).toBe(ticket);
  });

  it("gives the page's own when nothing is open", () => {
    expect(pointForMetadata(undefined, null)).toBeNull();
    expect(pointForMetadata(null, null)).toBeNull();
    expect(pointForMetadata('', null)).toBeNull();
  });

  it('leaves the title be while the open point is still being read', () => {
    // A link straight to a ticket past the loaded pages: the server named it on the page load,
    // and the page's own title in the meantime would be a flash of the wrong one.
    expect(pointForMetadata('ticket-1', null)).toBe('reading');
  });
});

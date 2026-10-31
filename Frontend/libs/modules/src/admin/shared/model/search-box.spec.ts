import { describe, expect, it } from 'vitest';

import { followUrl, initialSearchBox, type SearchBox } from './search-box';

const typed = (box: SearchBox, draft: string): SearchBox => ({ ...box, draft });
const sent = (box: SearchBox, value: string): SearchBox => ({
  ...box,
  sent: value.trim(),
});

describe('followUrl', () => {
  it('keeps the typing while its own query has not reached the URL yet', () => {
    let box = sent(typed(initialSearchBox(''), '光復'), '光復');
    box = followUrl(box, '');
    expect(box.draft).toBe('光復');

    box = typed(box, '光復鄉');
    box = followUrl(box, '光復');
    expect(box.draft).toBe('光復鄉');
  });

  it('keeps a trailing space once the trimmed query lands', () => {
    let box = sent(typed(initialSearchBox(''), '光復 '), '光復 ');
    box = followUrl(box, '光復');
    expect(box.draft).toBe('光復 ');
    expect(followUrl(box, '光復')).toBe(box);
  });

  it('follows the URL when it changes from elsewhere', () => {
    let box = sent(typed(initialSearchBox(''), '光復'), '光復');
    box = followUrl(box, '光復');
    expect(followUrl(box, '')).toEqual(initialSearchBox(''));
    expect(followUrl(box, '花蓮')).toEqual(initialSearchBox('花蓮'));
  });
});

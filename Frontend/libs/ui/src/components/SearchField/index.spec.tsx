import { describe, expect, it } from 'vitest';

import { openingTag, render } from '../../testing/markup';
import { SearchField } from './index';

describe('SearchField', () => {
  it('names the input itself, not the box around it', () => {
    const { markup } = render(<SearchField aria-label="搜尋任務單" />);

    expect(openingTag(markup, /<input[^>]*>/)).toContain(
      'aria-label="搜尋任務單"',
    );
    expect(openingTag(markup, /<div[^>]*>/)).not.toContain('aria-label');
  });

  it('still takes a name through inputProps', () => {
    const { markup } = render(
      <SearchField inputProps={{ 'aria-label': '搜尋站點' }} />,
    );

    expect(openingTag(markup, /<input[^>]*>/)).toContain(
      'aria-label="搜尋站點"',
    );
  });

  it('is a search box (INP-103)', () => {
    expect(
      openingTag(
        render(<SearchField aria-label="搜尋" />).markup,
        /<input[^>]*>/,
      ),
    ).toContain('type="search"');
  });

  it('describes the input with its hint', () => {
    const { markup } = render(
      <SearchField aria-label="搜尋" hint="至少輸入 2 個字" />,
    );
    const id = openingTag(markup, /<input[^>]*>/).match(
      /aria-describedby="([^"]+)"/,
    )?.[1];

    expect(id).toBeDefined();
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toMatch(new RegExp(`id="${id}"[^>]*>至少輸入 2 個字<`));
  });

  it('has no description without a hint', () => {
    expect(
      openingTag(
        render(<SearchField aria-label="搜尋" />).markup,
        /<input[^>]*>/,
      ),
    ).not.toContain('aria-describedby');
  });
});

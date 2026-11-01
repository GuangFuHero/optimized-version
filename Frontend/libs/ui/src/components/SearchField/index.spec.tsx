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
});

import { describe, expect, it } from 'vitest';

import { openingTag, render } from '../../testing/markup';
import { SplitButton } from './index';

const noop = () => undefined;
const items = [
  { label: '新增一個', onClick: noop },
  { label: '從 CSV／Excel 匯入多個', onClick: noop },
];

describe('SplitButton', () => {
  it('is a plain button, with no ▾, without items', () => {
    const { markup } = render(<SplitButton label="新增站點" onClick={noop} />);

    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).not.toContain('aria-haspopup');
  });

  it('is a plain button for an empty list too', () => {
    expect(
      render(
        <SplitButton label="新增站點" onClick={noop} items={[]} />,
      ).markup.match(/<button/g),
    ).toHaveLength(1);
  });

  it('adds a ▾ that names and opens the menu, closed at first (BTN-112)', () => {
    const { markup } = render(
      <SplitButton label="新增站點" onClick={noop} items={items} />,
    );
    const arrow = openingTag(markup, /<button[^>]*aria-haspopup[^>]*>/);

    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(arrow).toContain('aria-haspopup="menu"');
    expect(arrow).toContain('aria-expanded="false"');
    expect(arrow).toContain('aria-label="更多新增方式"');
    expect(markup).not.toContain('從 CSV／Excel 匯入多個');
  });

  it('disables both halves', () => {
    const { markup } = render(
      <SplitButton label="新增站點" onClick={noop} items={items} disabled />,
    );

    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});

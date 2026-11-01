import { describe, expect, it } from 'vitest';

import { openingTag, render } from '../../testing/markup';
import { designTokens, withAlpha } from '../../theme';
import { Tag, tagColors } from './index';

const { color } = designTokens;

describe('tagColors', () => {
  it('is a pale ground with dark words by default', () => {
    expect(tagColors({ tone: 'warning' })).toEqual({
      fg: color.fg.warning,
      bg: color.bg.warning.subtle,
    });
  });

  it('fills solid only when asked to (TAG-103)', () => {
    expect(tagColors({ tone: 'danger', fill: 'solid' })).toEqual({
      fg: color.fg.onDanger,
      bg: color.bg.danger.default,
    });
  });

  it('has no ground when quiet, in grey words unless strong (TAG-105)', () => {
    expect(tagColors({ fill: 'quiet' })).toEqual({
      fg: color.fg.neutral.muted,
      bg: 'transparent',
    });
    expect(tagColors({ fill: 'quiet', strong: true }).fg).toBe(
      color.fg.neutral.default,
    );
  });

  it('takes its own hue over the tone, on the hue at a tenth', () => {
    expect(tagColors({ tone: 'danger', hue: '#2592B9' })).toEqual({
      fg: '#2592B9',
      bg: withAlpha('#2592B9', 0.1),
    });
  });
});

describe('Tag', () => {
  const noop = () => undefined;

  it('is words, not a control, unless it can be removed (TAG-101)', () => {
    expect(render(<Tag>官方</Tag>).markup).not.toContain('<button');
  });

  it('names its × for a screen reader (TAG-106)', () => {
    expect(
      openingTag(
        render(<Tag onRemove={noop}>水災</Tag>).markup,
        /<button[^>]*>/,
      ),
    ).toContain('aria-label="移除"');
    expect(
      openingTag(
        render(
          <Tag onRemove={noop} removeLabel="移除條件：水災">
            水災
          </Tag>,
        ).markup,
        /<button[^>]*>/,
      ),
    ).toContain('aria-label="移除條件：水災"');
  });

  it('keeps its dot out of what is read, the words saying it all (TAG-104)', () => {
    const { markup } = render(<Tag dot>待處理</Tag>);

    expect(markup).toMatch(/<span[^>]*aria-hidden="true"[^>]*><\/span>待處理/);
  });
});

import { describe, expect, it } from 'vitest';

import { designTokens, withAlpha } from '../../theme';
import { tagColors } from './index';

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

import { describe, expect, it } from 'vitest';

import { openingTag, render } from '../../testing/markup';
import { Progress, readProgress } from './index';

describe('readProgress', () => {
  it('reads the share taken, and says how many are still needed (PRG-105)', () => {
    expect(readProgress(3, 8)).toEqual({
      hasMax: true,
      done: false,
      percent: 38,
      text: '3/8 · 還缺 5 人',
    });
  });

  it('is done once every place is taken, and says it is full', () => {
    expect(readProgress(4, 4)).toMatchObject({
      done: true,
      percent: 100,
      text: '已滿 4/4',
    });
  });

  it('is not done when told so, though every place is taken (PRG-102)', () => {
    expect(readProgress(3, 3, false)).toMatchObject({
      done: false,
      percent: 100,
      text: '已滿 3/3',
    });
  });

  it('says full by the count alone: done changes the colour, not the words (PRG-105)', () => {
    expect(readProgress(3, 8, true)).toMatchObject({
      done: true,
      text: '3/8 · 還缺 5 人',
    });
  });

  it('says it has ended when it closed short (PRG-105)', () => {
    expect(readProgress(3, 8, undefined, true)).toMatchObject({
      done: false,
      text: '已結束 · 3/8',
    });
    expect(readProgress(8, 8, undefined, true).text).toBe('已滿 8/8');
  });

  it('draws no bar without a total, and says how many there are (PRG-104)', () => {
    expect(readProgress(2)).toEqual({
      hasMax: false,
      done: false,
      percent: 0,
      text: '已有 2 人',
    });
    expect(readProgress(2, 0).hasMax).toBe(false);
  });

  it('keeps the bar to its full length when more have come than asked for, and says full', () => {
    expect(readProgress(10, 8)).toMatchObject({
      done: true,
      percent: 100,
      text: '已滿 10/8',
    });
  });
});

describe('Progress', () => {
  const bar = (markup: string) =>
    openingTag(markup, /<div[^>]*role="progressbar"[^>]*>/);

  it('names its bar by its label', () => {
    const { markup } = render(
      <Progress value={3} max={8} label="承接進度" tone="neutral" size="sm" />,
    );
    const id = bar(markup).match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(markup).toMatch(new RegExp(`id="${id}"[^>]*>承接進度<`));
  });

  it('names its bar by its numbers when it has no label', () => {
    const { markup } = render(<Progress value={3} max={8} />);
    const id = bar(markup).match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(markup).toMatch(new RegExp(`id="${id}"[^>]*>3/8 · 還缺 5 人<`));
  });

  it('says its value within its range, though more have come than asked for', () => {
    const tag = bar(render(<Progress value={5} max={4} />).markup);

    expect(tag).toContain('aria-valuenow="4"');
    expect(tag).toContain('aria-valuemin="0"');
    expect(tag).toContain('aria-valuemax="4"');
  });

  it('always shows its numbers (PRG-103)', () => {
    expect(render(<Progress value={3} max={8} />).markup).toContain(
      '>3/8 · 還缺 5 人<',
    );
  });

  it('draws no bar without a total (PRG-104)', () => {
    const { markup } = render(<Progress value={2} />);

    expect(markup).not.toContain('role="progressbar"');
    expect(markup).toContain('已有 2 人');
  });
});

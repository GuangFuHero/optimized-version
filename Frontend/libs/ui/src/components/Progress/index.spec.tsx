import { describe, expect, it } from 'vitest';

import { openingTag, render } from '../../testing/markup';
import { Progress, readProgress } from './index';

describe('readProgress', () => {
  it('reads the share taken, as a number and a length', () => {
    expect(readProgress(3, 8)).toEqual({
      hasMax: true,
      done: false,
      percent: 38,
      text: '3/8',
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
      text: '3/3',
    });
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

  it('keeps the bar to its full length when more have come than asked for', () => {
    expect(readProgress(5, 4).percent).toBe(100);
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

    expect(markup).toMatch(new RegExp(`id="${id}"[^>]*>3/8<`));
  });

  it('says its value within its range, though more have come than asked for', () => {
    const tag = bar(render(<Progress value={5} max={4} />).markup);

    expect(tag).toContain('aria-valuenow="4"');
    expect(tag).toContain('aria-valuemin="0"');
    expect(tag).toContain('aria-valuemax="4"');
  });

  it('always shows its numbers (PRG-103)', () => {
    expect(render(<Progress value={3} max={8} />).markup).toContain('>3/8<');
  });

  it('draws no bar without a total (PRG-104)', () => {
    const { markup } = render(<Progress value={2} />);

    expect(markup).not.toContain('role="progressbar"');
    expect(markup).toContain('已有 2 人');
  });
});

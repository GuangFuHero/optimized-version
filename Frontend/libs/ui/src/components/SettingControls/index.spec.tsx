import { describe, expect, it } from 'vitest';

import { openingTag, render } from '../../testing/markup';
import { NativeSelect, RadioCards, SettingRow } from './index';

const noop = () => undefined;
const options = [
  { value: 'auto', title: '自動', description: '系統判斷' },
  { value: 'manual', title: '手動' },
] as const;

describe('SettingRow', () => {
  it('names the setting and says what it does, beside its control (SET-101)', () => {
    const { markup } = render(
      <SettingRow title="公開到前台" description="一按就生效">
        <input type="checkbox" />
      </SettingRow>,
    );

    expect(markup).toContain('公開到前台');
    expect(markup).toContain('一按就生效');
    expect(markup).toContain('type="checkbox"');
  });
});

describe('RadioCards', () => {
  it('is a named radio group (SET-103)', () => {
    const { markup } = render(
      <RadioCards
        name="mode"
        value="auto"
        options={options}
        onChange={noop}
        aria-label="判斷方式"
      />,
    );
    const group = openingTag(markup, /<div[^>]*role="radiogroup"[^>]*>/);

    expect(group).toContain('aria-label="判斷方式"');
  });

  it('can take its name from a heading', () => {
    const { markup } = render(
      <RadioCards
        name="mode"
        value="auto"
        options={options}
        onChange={noop}
        aria-labelledby="mode-title"
      />,
    );

    expect(openingTag(markup, /<div[^>]*role="radiogroup"[^>]*>/)).toContain(
      'aria-labelledby="mode-title"',
    );
  });

  it('checks the one chosen, every radio in the same group', () => {
    const { markup } = render(
      <RadioCards
        name="mode"
        value="manual"
        options={options}
        onChange={noop}
        aria-label="判斷方式"
      />,
    );
    const radios = markup.match(/<input[^>]*>/g) ?? [];

    expect(radios).toHaveLength(2);
    expect(radios.every((radio) => radio.includes('name="mode"'))).toBe(true);
    expect(radios[0]).not.toContain('checked');
    expect(radios[1]).toContain('checked');
  });
});

describe('NativeSelect', () => {
  it('is a native select, named, with its options (SET-104)', () => {
    const { markup } = render(
      <NativeSelect
        aria-label="災害類型"
        defaultValue="flood"
        options={[
          ['flood', '水災'],
          ['quake', '地震'],
        ]}
      />,
    );

    expect(openingTag(markup, /<select[^>]*>/)).toContain(
      'aria-label="災害類型"',
    );
    expect(markup).toMatch(/<option value="flood"[^>]*>水災<\/option>/);
    expect(markup).toMatch(/<option value="quake"[^>]*>地震<\/option>/);
  });
});

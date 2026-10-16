import { describe, expect, it } from 'vitest';

import { checkPhotoLink, PHOTO_LINK_MAX } from './photo-links';

const link = (n: number) => `https://duk.tw/scene${n}.jpg`;
const links = (count: number) =>
  Array.from({ length: count }, (_, i) => link(i + 1));

describe('checkPhotoLink', () => {
  it('takes an https link, trimmed as the server stores it', () => {
    expect(checkPhotoLink('  https://duk.tw/a.jpg ', [])).toEqual({
      ok: true,
      link: 'https://duk.tw/a.jpg',
      notice: null,
    });
  });

  it('says nothing about an empty box: there is nothing to add yet', () => {
    expect(checkPhotoLink('   ', [])).toEqual({ ok: false, error: null });
  });

  it('refuses a link that is not https, and says why (TM-IMG-121)', () => {
    const refused = {
      ok: false,
      error:
        '網址要以 https:// 開頭。http:// 的圖會被瀏覽器擋掉，畫面上只會是一片空白。',
    };

    expect(checkPhotoLink('http://duk.tw/a.jpg', [])).toEqual(refused);
    expect(checkPhotoLink('duk.tw/a.jpg', [])).toEqual(refused);
    expect(checkPhotoLink('https://', [])).toEqual(refused);
  });

  it('refuses a link longer than the server keeps (500 characters)', () => {
    expect(checkPhotoLink(`https://duk.tw/${'a'.repeat(500)}`, [])).toEqual({
      ok: false,
      error: '這條網址太長了，最多 500 個字。',
    });
  });

  it('refuses one more past the limit, counting it in (TM-IMG-122)', () => {
    expect(checkPhotoLink(link(11), links(PHOTO_LINK_MAX))).toEqual({
      ok: false,
      error: '最多 10 條（11／10）。請先移除一條再貼。',
    });
  });

  it('takes the tenth', () => {
    expect(checkPhotoLink(link(10), links(9))).toMatchObject({ ok: true });
  });

  it('takes a link already there, and says so rather than refusing (TM-IMG-125)', () => {
    expect(checkPhotoLink(link(1), links(2))).toEqual({
      ok: true,
      link: link(1),
      notice: '這條網址已經在上面了，還是加上去了。',
    });
  });
});

/**
 * Scene photos as links (spec S8; prototype `Design/前台/js/shared/wg-photos.jsx`, TM-FEAT-010):
 * the platform keeps no image, only a link to one kept elsewhere (TM-IMG-101). One source for the
 * rules, so the request form and the ticket's drawer cannot drift into two ways of failing.
 */

/** Links one request may carry — the backend's `HELP_REQUEST_PHOTO_MAX` (使用者 2026-10-01). */
export const PHOTO_LINK_MAX = 10;

/** `photos.url` is String(500); a longer link is refused there, the whole request with it. */
const PHOTO_LINK_MAX_LENGTH = 500;

/**
 * How long a thumbnail may stay blank before it counts as one that will not load: a server that
 * takes the connection and never answers leaves an empty box with nothing to click (prototype
 * `TK_PHOTO_TIMEOUT_MS`, the designer's own pick).
 */
export const PHOTO_LOAD_TIMEOUT_MS = 8000;

/**
 * Where to put a photo to get a link for it (prototype `TK_UPLOAD_HOST`, 2026-09-21): it hands
 * back a link that is the image itself, asks for no captcha, and keeps it for good. Three steps,
 * no tutorial.
 */
export const PHOTO_UPLOAD_HOST = {
  name: 'duk.tw',
  url: 'https://duk.tw/',
  steps: [
    '開 duk.tw，把照片拖進去',
    '按「開始上傳」',
    '複製它給的網址，貼回這裡',
  ],
} as const;

export type PhotoLinkCheck =
  | {
      ok: true;
      /** As it will be sent, and as the server will store it. */
      link: string;
      /** Worth saying, though the link goes in. */
      notice: string | null;
    }
  | {
      ok: false;
      /** Why not; null for an empty box, which there is nothing to say about. */
      error: string | null;
    };

/**
 * Whether a pasted link may go on the request, checked as the backend's `normalize_photo_url`
 * will, so a link that would refuse the whole request never gets in. Https only (TM-IMG-121): an
 * http image is blocked as mixed content and shows as a blank, with no error. Past the limit the
 * count says so (TM-IMG-122). A repeated link goes in anyway, with a word (TM-IMG-125).
 */
export function checkPhotoLink(
  draft: string,
  existing: readonly string[],
): PhotoLinkCheck {
  const link = draft.trim();

  if (!link) {
    return { ok: false, error: null };
  }

  if (!/^https:\/\/\S+$/i.test(link)) {
    return {
      ok: false,
      error:
        '網址要以 https:// 開頭。http:// 的圖會被瀏覽器擋掉，畫面上只會是一片空白。',
    };
  }

  if (link.length > PHOTO_LINK_MAX_LENGTH) {
    return {
      ok: false,
      error: `這條網址太長了，最多 ${PHOTO_LINK_MAX_LENGTH} 個字。`,
    };
  }

  if (existing.length >= PHOTO_LINK_MAX) {
    return {
      ok: false,
      error: `最多 ${PHOTO_LINK_MAX} 條（${existing.length + 1}／${PHOTO_LINK_MAX}）。請先移除一條再貼。`,
    };
  }

  return {
    ok: true,
    link,
    notice: existing.includes(link)
      ? '這條網址已經在上面了，還是加上去了。'
      : null,
  };
}

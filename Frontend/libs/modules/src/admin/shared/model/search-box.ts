/**
 * The search box's text against the URL's `?q=`. `draft` is what the box shows, `sent` the last
 * query it sent (trimmed, as the page writes `?q=`) and `seen` the last `?q=` it saw.
 */
export interface SearchBox {
  draft: string;
  sent: string;
  seen: string;
}

export function initialSearchBox(query: string): SearchBox {
  return { draft: query, sent: query, seen: query };
}

/**
 * Follow `?q=` only when it changes from elsewhere (清除, back). Nothing happens until the URL
 * itself changes, and the box's own query landing keeps what was typed since, so neither a
 * render before `router.replace` lands nor a trailing space undoes the typing.
 */
export function followUrl(box: SearchBox, query: string): SearchBox {
  if (query === box.seen) return box;
  if (query === box.sent) return { ...box, seen: query };
  return initialSearchBox(query);
}

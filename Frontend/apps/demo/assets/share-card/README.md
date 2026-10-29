# Share card fonts

The site's link-preview card (`src/app/(site)/share-card.png/route.tsx`) is drawn by Satori, which
reads TTF or OTF but not WOFF2, and has no CJK glyphs of its own. These two files are Noto Sans TC
from the design system (`Design/前台/_ds/wan-guard-design-system-…/fonts/`), cut down to the
characters the card draws: a few kilobytes instead of 5.9 MB each. Noto Sans TC is under the SIL Open
Font License; the subset keeps the font's name table, which carries it.

Change the card's `TITLE` or `SUBTITLE` and cut them again from the repository root, or the new
characters are drawn as empty boxes:

```sh
uvx --from fonttools pyftsubset \
  "Design/前台/_ds/wan-guard-design-system-9c8f68e7-f87a-466d-9430-b41c578b2001/fonts/NotoSansTC-Bold.otf" \
  --text="<TITLE>" --name-IDs="*" --name-languages="*" \
  --output-file=Frontend/apps/demo/assets/share-card/NotoSansTC-Bold.subset.otf

uvx --from fonttools pyftsubset \
  "Design/前台/_ds/wan-guard-design-system-9c8f68e7-f87a-466d-9430-b41c578b2001/fonts/NotoSansTC-Regular.otf" \
  --text="<SUBTITLE>" --name-IDs="*" --name-languages="*" \
  --output-file=Frontend/apps/demo/assets/share-card/NotoSansTC-Regular.subset.otf
```

# Share card fonts

The site's link-preview card (`src/app/(site)/share-card.png/route.tsx`) is drawn by Satori, which
reads TTF or OTF but not WOFF2, and has no CJK glyphs of its own. These two files are Noto Sans TC
from the design system, cut down to the characters the card draws: a few kilobytes instead of 5.9 MB
each. The full fonts are only on the designer's branch `sucrelindesign`, under
`Design/前台/_ds/wan-guard-design-system-…/fonts/`. Noto Sans TC is under the SIL Open Font License;
the subset keeps the font's name table, which carries it.

Change the card's `TITLE` or `SUBTITLE` and cut them again from the repository root, or the new
characters are drawn as empty boxes. First copy the full fonts out of the design branch into a
temporary folder:

```sh
git fetch origin sucrelindesign
fonts="Design/前台/_ds/wan-guard-design-system-9c8f68e7-f87a-466d-9430-b41c578b2001/fonts"
tmp="$(mktemp -d)"
git show "origin/sucrelindesign:$fonts/NotoSansTC-Bold.otf" > "$tmp/NotoSansTC-Bold.otf"
git show "origin/sucrelindesign:$fonts/NotoSansTC-Regular.otf" > "$tmp/NotoSansTC-Regular.otf"
```

Then cut them:

```sh
uvx --from fonttools pyftsubset "$tmp/NotoSansTC-Bold.otf" \
  --text="<TITLE>" --name-IDs="*" --name-languages="*" \
  --output-file=Frontend/apps/demo/assets/share-card/NotoSansTC-Bold.subset.otf

uvx --from fonttools pyftsubset "$tmp/NotoSansTC-Regular.otf" \
  --text="<SUBTITLE>" --name-IDs="*" --name-languages="*" \
  --output-file=Frontend/apps/demo/assets/share-card/NotoSansTC-Regular.subset.otf
```

Then raise the version in `SITE_SHARE_CARD.url` (`libs/modules/src/point-share/share-card.ts`), as for any
change to the card, or LINE and Facebook go on showing the copy they kept.

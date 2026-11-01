# Shared icons

`Icons` uses Lucide for interface icons. The registry renders each icon through MUI `SvgIcon` (`themedIcon`) so shared components can use the theme's `sx`, `color`, and `fontSize` props. Google, LINE, Facebook, X, and the custom avatar mark use the SVG assets in `generated/`.

## Where things stand

- The back office and the public site both use Lucide. The frontend no longer depends on `@mui/icons-material`.
- A station type's icon comes from `libs/modules/src/station/station-type-icon.tsx`, the designer's table, not from `Icons`.

## For new code

Use `Icons`, for example `Icons.search`. If the icon you need is not in `Icons` yet, add it there, named as Lucide names it. Back-office components can import icons directly from `lucide-react`. Use `size` for a fixed size, or render the icon with MUI `Box` when it needs `sx` styles; `themedIcon` wraps a Lucide icon kept outside `Icons` so it takes `sx` too.

# Shared icons

`Icons` uses Lucide for interface icons. The registry renders each icon through MUI `SvgIcon` so shared components can use the theme's `sx`, `color`, and `fontSize` props. Google, LINE, and the custom avatar mark use the SVG assets in `generated/`.

## Where things stand

- The back office uses Lucide.
- The public site mostly uses MUI's Rounded icons (`@mui/icons-material/*Rounded`), with a few Outlined ones. Its map controls, layer panel, and location panels already use Lucide.
- The public site will move to Lucide. Until it does, both sets appear side by side there.

## For new code

Use `Icons`, for example `Icons.search`. If the icon you need is not in `Icons` yet, add it there instead of importing from `@mui/icons-material`. Back-office components can import icons directly from `lucide-react`. Use `size` for a fixed size, or render the icon with MUI `Box` when it needs `sx` styles.

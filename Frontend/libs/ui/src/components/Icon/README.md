# Shared icons

`Icons` uses Lucide for interface icons. The registry renders each icon through MUI `SvgIcon` so shared components can use the theme's `sx`, `color`, and `fontSize` props. Google, LINE, and the custom avatar mark use the SVG assets in `generated/`.

Use `Icons.search` for a shared themed icon. Admin components can import icons directly from `lucide-react`. Use `size` for a fixed size, or render the icon with MUI `Box` when it needs `sx` styles.

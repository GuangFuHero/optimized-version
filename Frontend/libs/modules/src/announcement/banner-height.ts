/**
 * The announcement banner's height, written on the document while it shows (the prototype's
 * `--wg-banner-h`, `an-banner.jsx:61-79`). Whatever fills the screen takes it off, so the banner
 * pushes the page down without pushing its foot off the screen. Nothing there, it is 0.
 */
export const SITE_BANNER_HEIGHT_VAR = '--site-banner-height';

export const SITE_BANNER_HEIGHT = `var(${SITE_BANNER_HEIGHT_VAR}, 0px)`;

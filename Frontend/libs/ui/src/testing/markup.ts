import { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * A component's HTML as a server renders it, for specs that check what it says to a screen reader.
 * Emotion writes each style as a `<style>` beside the element; `markup` leaves those out, so a
 * selector such as `[aria-busy="true"]` in the CSS is not mistaken for the attribute. `styles` is
 * the CSS alone.
 */
export function render(node: ReactNode): { markup: string; styles: string } {
  const html = renderToStaticMarkup(node);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join('\n');

  return { markup: html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ''), styles };
}

/** The opening tag of the first element `pattern` matches inside, e.g. `/<input[^>]*>/`. */
export function openingTag(markup: string, pattern: RegExp): string {
  const tag = markup.match(pattern)?.[0];
  if (!tag) throw new Error(`No tag matches ${pattern} in ${markup}`);
  return tag;
}

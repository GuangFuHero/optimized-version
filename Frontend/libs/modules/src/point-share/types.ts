// SPDX-License-Identifier: GPL-3.0-only
export interface PointShareTarget {
  title: string;
  description: string;
  url: string;
}

export type PointShareChannel = 'line' | 'facebook' | 'threads' | 'x';

declare const shareHref: unique symbol;

/** A share page built in `share-links.ts`: the only kind of address a new window opens. */
export type ShareHref = string & { readonly [shareHref]: true };

export interface PointShareLink {
  channel: PointShareChannel;
  label: string;
  href: ShareHref;
}

export interface PointShareTarget {
  title: string;
  description: string;
  url: string;
}

export type PointShareChannel = 'line' | 'facebook' | 'threads' | 'x';

export interface PointShareLink {
  channel: PointShareChannel;
  label: string;
  href: string;
}

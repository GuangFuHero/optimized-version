/** Station counts per operational status, from `/analytics/stations/data` (x=category). */
export function parseStatusCounts(data: {
  x_values: readonly (string | null)[];
  series: readonly { name?: string; values: readonly number[] }[];
}): Record<string, number> {
  const values = data.series[0]?.values ?? [];
  return Object.fromEntries(
    data.x_values.map((x, i) => [x ?? 'unknown', values[i] ?? 0]),
  );
}

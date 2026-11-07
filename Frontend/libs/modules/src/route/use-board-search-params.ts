'use client';

import { useSearchParams } from 'next/navigation';
import { parseAsString, useQueryStates } from 'nuqs';

const parsers = {
  view: parseAsString,
  page: parseAsString,
  q: parseAsString,
  type: parseAsString,
  status: parseAsString,
  area: parseAsString,
  team: parseAsString,
  official: parseAsString,
  est: parseAsString,
  fresh: parseAsString,
  priority: parseAsString,
  task: parseAsString,
  county: parseAsString,
  town: parseAsString,
  time: parseAsString,
  ticket: parseAsString,
  station: parseAsString,
  space: parseAsString,
};

/** Keeps the existing board URL contract while nuqs batches updates and follows browser history. */
export function useBoardSearchParams() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useQueryStates(parsers, { shallow: false });
  const params = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(query)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const setParam = (key: keyof typeof parsers, value: string | null) => {
    void setQuery({ [key]: value || null });
  };
  const replaceParams = (next: URLSearchParams) => {
    void setQuery(
      Object.fromEntries(
        Object.keys(parsers).map((key) => [key, next.get(key)]),
      ),
    );
  };
  return { params, setParam, replaceParams };
}

'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useEventCallback } from 'usehooks-ts';

const parsers = {
  apply: parseAsString,
  resume: parseAsString,
  step_up: parseAsString,
  step_up_error: parseAsString,
  suggest: parseAsString,
  help: parseAsString,
  helpBuilding: parseAsString,
  helpFloor: parseAsString,
  claim: parseAsString,
};

/** Removes consumed sign-in markers without changing the current history entry or other query keys. */
export function useReturnQuery() {
  const [, setQuery] = useQueryStates(parsers);
  return useEventCallback((keys: readonly (keyof typeof parsers)[]) => {
    void setQuery(Object.fromEntries(keys.map((key) => [key, null])));
  });
}

// SPDX-License-Identifier: GPL-3.0-only
import type { Query } from '@tanstack/react-query';
import { isPermissionError, SILENT_ERROR_META } from '../query-client';

export function forbidsPage(query: Query) {
  return (
    query.meta?.[SILENT_ERROR_META] !== true &&
    isPermissionError(query.state.error)
  );
}

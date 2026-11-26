// SPDX-License-Identifier: GPL-3.0-only
import { create } from 'zustand';

export const useMyStationReportsOpen = create(() => false);

export function openMyStationReports(): void {
  useMyStationReportsOpen.setState(true, true);
}

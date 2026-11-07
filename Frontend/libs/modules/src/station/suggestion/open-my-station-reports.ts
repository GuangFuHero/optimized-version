import { create } from 'zustand';

export const useMyStationReportsOpen = create(() => false);

export function openMyStationReports(): void {
  useMyStationReportsOpen.setState(true, true);
}

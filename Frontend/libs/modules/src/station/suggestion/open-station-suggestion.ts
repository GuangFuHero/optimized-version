import { create } from 'zustand';

interface StationSuggestionState {
  opening: { id: number; stationUuid: string } | null;
  open: boolean;
  submitError: string | null;
}

export const useStationSuggestionState = create<StationSuggestionState>(() => ({
  opening: null,
  open: false,
  submitError: null,
}));

export function openStationSuggestion(stationUuid: string): void {
  useStationSuggestionState.setState(({ opening }) => ({
    opening: { id: (opening?.id ?? 0) + 1, stationUuid },
    open: true,
    submitError: null,
  }));
}

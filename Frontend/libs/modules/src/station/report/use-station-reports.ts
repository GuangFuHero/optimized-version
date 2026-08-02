'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RescueMapMarkerItem } from '../../map/types';
import {
  createStationReportRecord,
  groupStationReportsByStationId,
  readStationReports,
  writeStationReports,
  type StationReportFormValues,
  type StationReportRecord,
} from './model';

export function useStationReports() {
  const [reports, setReports] = useState<readonly StationReportRecord[]>([]);

  useEffect(() => {
    setReports(readStationReports());
  }, []);

  const reportsByStationId = useMemo(
    () => groupStationReportsByStationId(reports),
    [reports],
  );

  const submitStationReport = useCallback(
    (station: RescueMapMarkerItem, values: StationReportFormValues) => {
      const report = createStationReportRecord(station, values);

      setReports((currentReports) => {
        const nextReports = [report, ...currentReports];

        writeStationReports(nextReports);
        return nextReports;
      });

      return report;
    },
    [],
  );

  return {
    reports,
    reportsByStationId,
    submitStationReport,
  };
}

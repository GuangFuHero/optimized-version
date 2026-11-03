'use client';

import { Box, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useQuery } from 'urql';

import { MyStationSuggestionsDocument } from '@rescue-frontend/data-access';
import {
  Badge,
  designTokens,
  displayTextSize,
  Icons,
  RowAction,
} from '@rescue-frontend/ui';

import { useSiteRouteState } from '../../route';
import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import {
  openReportedStation,
  readMyStationReports,
  reportedStationHref,
  STATION_REPORT_OUTCOME_LOOKS,
  type StationReport,
} from './my-station-reports';
import { onOpenMyStationReports } from './open-my-station-reports';

const { color, iconSize, radius, typography } = designTokens;

// The list's own loading line inside the drawer rather than suspending the page behind it.
const QUERY_CONTEXT = { suspense: false } as const;

/**
 * One report (prototype `StationReportsDrawer`): when it was sent, the station, how it came out,
 * and the field as 「現值 → 建議值」 — the suggested value alone would not tell, a while later, what
 * was changed from what was there. No 優先送審 tag: the backend keeps no such thing.
 */
function StationReportRow({
  report,
  onOpen,
}: {
  report: StationReport;
  onOpen: (event: MouseEvent<HTMLElement>, stationUuid: string) => void;
}) {
  const look = STATION_REPORT_OUTCOME_LOOKS[report.outcome];
  const { stationUuid } = report;

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Stack
        direction="row"
        sx={{
          gap: 1,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {report.sentAgo ? (
            <Typography
              sx={{
                color: color.fg.neutral.muted,
                fontFamily: typography.data[300].fontFamily,
                fontSize: displayTextSize[11],
                lineHeight: 1.4,
              }}
            >
              {report.sentAgo}
            </Typography>
          ) : null}
          <Typography
            sx={{
              mt: 0.25,
              color: stationUuid
                ? color.fg.neutral.default
                : color.fg.neutral.subtle,
              fontSize: displayTextSize[15],
              lineHeight: 1.4,
              fontWeight: 700,
              textWrap: 'pretty',
            }}
          >
            {report.stationName}
          </Typography>
        </Box>
        <Badge tone={look.tone} variant="subtle">
          {look.label}
        </Badge>
      </Stack>

      <Stack
        direction="row"
        sx={{
          mt: 1.5,
          gap: 0.75,
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: displayTextSize[13],
          lineHeight: 1.6,
        }}
      >
        <Typography
          component="span"
          sx={{ color: color.fg.neutral.subtle, fontSize: 'inherit' }}
        >
          {report.fieldLabel}：
        </Typography>
        {report.previous !== null ? (
          <>
            <Typography
              component="span"
              sx={{
                color: color.fg.neutral.muted,
                fontSize: 'inherit',
                textDecoration: 'line-through',
              }}
            >
              {report.previous}
            </Typography>
          </>
        ) : null}
        {/* The arrow wraps with the value it points to, never alone at a line's end. */}
        <Stack
          direction="row"
          sx={{ gap: 0.75, alignItems: 'center', minWidth: 0 }}
        >
          {report.previous !== null ? (
            <Icons.arrowRight
              aria-label="改成"
              sx={{
                flexShrink: 0,
                fontSize: iconSize.sm,
                color: color.fg.neutral.muted,
              }}
            />
          ) : null}
          <Typography
            component="span"
            sx={{
              color: color.fg.neutral.default,
              fontSize: 'inherit',
              fontWeight: 700,
              textWrap: 'pretty',
            }}
          >
            {report.suggested}
          </Typography>
        </Stack>
      </Stack>

      {report.comment ? (
        <Typography
          sx={{
            mt: 1,
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
            textWrap: 'pretty',
          }}
        >
          {report.comment}
        </Typography>
      ) : null}

      {stationUuid ? (
        <Stack direction="row" sx={{ mt: 1.5, gap: 1 }}>
          <RowAction
            LinkComponent={Link}
            href={reportedStationHref(stationUuid)}
            onClick={(event) => onOpen(event, stationUuid)}
            label="看這個站點"
            aria-label={`看這個站點：${report.stationName}`}
          />
        </Stack>
      ) : null}
    </Box>
  );
}

function Notice({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Stack
      sx={{ alignItems: 'center', gap: 1.5, py: 4, px: 2, textAlign: 'center' }}
    >
      {icon}
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[13],
          lineHeight: 1.6,
          textWrap: 'pretty',
        }}
      >
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * What the drawer holds. Mounted at each opening — the drawer's content unmounts once closed — so
 * a result decided since the last look is read.
 */
function MyStationReportsContent({ onClose }: { onClose: () => void }) {
  const route = useSiteRouteState();
  const [{ data, fetching, error }] = useQuery({
    query: MyStationSuggestionsDocument,
    requestPolicy: 'network-only',
    context: QUERY_CONTEXT,
  });

  const openStation = (event: MouseEvent<HTMLElement>, stationUuid: string) => {
    const opening = openReportedStation(route, stationUuid);

    if ('select' in opening) {
      // Already on the station list: the link would change only `?id=`, which it does not reread.
      event.preventDefault();
      route.replace(opening.select);
    }

    onClose();
  };

  if (!data) {
    return (
      <Notice>
        {fetching || !error
          ? '載入中…'
          : '讀不到你回報的站點，請稍後再試一次。'}
      </Notice>
    );
  }

  const reports = readMyStationReports(data.myStationSuggestions);

  if (reports.length === 0) {
    return (
      <Notice
        icon={
          <Icons.clipboardCheck
            sx={{ fontSize: iconSize.lg, color: color.fg.neutral.muted }}
          />
        }
      >
        你還沒有回報過站點。看到站點資訊不對（例如已經關了、水沒了），在該站點的詳情裡按「建議修改」。
      </Notice>
    );
  }

  return (
    <Stack spacing={1.5}>
      {reports.map((report) => (
        <StationReportRow
          key={report.uuid}
          report={report}
          onOpen={openStation}
        />
      ))}
    </Stack>
  );
}

/**
 * 我回報的站點 (prototype `StationReportsDrawer`), its own entry in the account menu beside
 * 我的任務: a task is someone coming or going to help, a report is public data that was wrong.
 * Kept once in the site shell and opened through `openMyStationReports`.
 */
export function MyStationReportsHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => onOpenMyStationReports(() => setOpen(true)), []);

  return (
    <SiteActionDrawer
      open={open}
      title="我回報的站點"
      subtitle="你對資源站點提出的修改建議，以及審核結果"
      onClose={() => setOpen(false)}
    >
      <MyStationReportsContent onClose={() => setOpen(false)} />
    </SiteActionDrawer>
  );
}

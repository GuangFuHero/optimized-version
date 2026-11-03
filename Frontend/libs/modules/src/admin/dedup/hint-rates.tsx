'use client';

import { ClickAwayListener, IconButton, Stack, Tooltip } from '@mui/material';
import { Info } from 'lucide-react';
import { useState } from 'react';

import { useDuplicateHintRates } from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import { statCountsFailed } from '../shared/model/stat-tiles';
import { StatTiles, StatTilesRetry } from '../shared/stat-tiles';
import type { PairTab } from './model';
import { muted } from './parts';
import { RATE_KIND, rateTexts } from './rates';

const { iconSize, typography } = designTokens;

/**
 * An ⓘ whose notes open on hover and on a click, for whoever uses a trackpad or a tablet
 * (handoff for #242).
 */
function InfoTip({ label, notes }: { label: string; notes: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <span>
        <Tooltip
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          slotProps={{ tooltip: { sx: { maxWidth: 360 } } }}
          title={
            <Stack component="ul" sx={{ m: 0, pl: 2, gap: 0.5 }}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </Stack>
          }
        >
          <IconButton
            size="small"
            aria-label={`${label}的說明`}
            onClick={() => setOpen((was) => !was)}
          >
            <Info size={iconSize.sm} />
          </IconButton>
        </Tooltip>
      </span>
    </ClickAwayListener>
  );
}

/**
 * 提示率 and 誤報率 of the fast layer for the tab's kind, over the last 30 days (#242, Spec 025
 * ADR-458). Two show-only tiles, each with its ⓘ, and the lines that say what the numbers mean.
 */
export function HintRates({ tab }: { tab: PairTab }) {
  const rates = useDuplicateHintRates();
  const failed = statCountsFailed(rates);
  const row = failed
    ? undefined
    : rates.data?.items.find((item) => item.entity_kind === RATE_KIND[tab]);
  const texts = row ? rateTexts(row, tab) : null;

  return (
    <Stack sx={{ gap: 0.75 }} data-dedup-rates>
      {failed ? (
        <StatTilesRetry
          retrying={rates.isFetching}
          onRetry={() => void rates.refetch()}
        />
      ) : null}
      <StatTiles
        items={[]}
        value={null}
        onChange={() => undefined}
        extras={[
          {
            label: '提示率',
            count: texts ? { main: texts.hint.value } : null,
            icon: texts ? (
              <InfoTip label="提示率" notes={texts.hint.notes} />
            ) : undefined,
          },
          {
            label: '誤報率',
            count: texts ? { main: texts.falseAlarm.value } : null,
            icon: texts ? (
              <InfoTip label="誤報率" notes={texts.falseAlarm.notes} />
            ) : undefined,
          },
        ]}
      />
      {texts ? (
        <Stack sx={{ gap: 0.25, ...typography.body[300] }}>
          <span>{texts.hint.line}</span>
          <span>{texts.falseAlarm.line}</span>
          <span style={muted}>{texts.falseAlarm.basis}</span>
        </Stack>
      ) : null}
    </Stack>
  );
}

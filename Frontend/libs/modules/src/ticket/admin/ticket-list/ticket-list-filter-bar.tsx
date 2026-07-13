'use client';

import { useMemo, useState, type MouseEvent } from 'react';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Box, ButtonBase, Popover, Stack, Typography } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';
import { TicketListIconSlot, ticketListPalette } from './ticket-list-primitives';
import type {
  TicketListFilterBarProps,
  TicketListFilterItem,
  TicketListFilterPanelItem,
  TicketListIndicatorAction,
} from './types';

const AiAnalysisIcon = Icons.aiAnalysis;
const CheckIcon = CheckRoundedIcon;

function createDefaultFilters(): readonly TicketListFilterItem[] {
  return [
    { id: 'region', label: '地區' },
    { id: 'task-type', label: '任務類型' },
    { id: 'disaster-type', label: '災害類型' },
    { id: 'status', label: '狀態' },
    { id: 'priority', label: '優先級' },
  ];
}

function FilterSelectorPill({
  label,
  selected,
  ariaLabel,
  onClick,
}: Omit<TicketListFilterItem, 'onClick'> & {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <ButtonBase
      disableRipple
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      sx={{
        height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: '17px',
        borderRadius: '999px',
        border: `1px solid ${selected ? ticketListPalette.activeBorder : ticketListPalette.frameBorder}`,
        bgcolor: selected
          ? ticketListPalette.filterSelected
          : ticketListPalette.actionSurface,
        color: ticketListPalette.strongText,
        whiteSpace: 'nowrap',
      }}
    >
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: 400,
        }}
      >
        {label}
      </Typography>
      <ExpandMoreRoundedIcon sx={{ width: 20, height: 20, color: 'inherit' }} />
    </ButtonBase>
  );
}

function FilterPanelOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      disableRipple
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        px: 1.5,
        py: 0.75,
        borderRadius: '8px',
        color: selected
          ? ticketListPalette.activeBorder
          : ticketListPalette.strongText,
        bgcolor: selected ? ticketListPalette.filterSelected : 'transparent',
        '&:hover': {
          bgcolor: selected ? ticketListPalette.filterSelected : '#F6FAFF',
        },
      }}
    >
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: selected ? 700 : 500,
          textAlign: 'left',
        }}
      >
        {label}
      </Typography>
      {selected ? <CheckIcon sx={{ width: 17, height: 17 }} /> : null}
    </ButtonBase>
  );
}

function AiReviewIndicator({
  label,
  icon,
  ariaLabel,
  onClick,
}: TicketListIndicatorAction) {
  return (
    <ButtonBase
      disableRipple
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      sx={{
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.25,
        borderRadius: '999px',
        border: `1px solid ${ticketListPalette.frameBorder}`,
        color: ticketListPalette.bodyText,
      }}
    >
      <TicketListIconSlot
        icon={icon}
        width={13}
        height={13}
        color={ticketListPalette.bodyText}
      />
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 10,
          lineHeight: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

export function TicketListFilterBar({
  items = createDefaultFilters(),
  panels,
  selectedValues,
  onFilterChange,
  clearLabel = '清除篩選',
  onClear,
}: TicketListFilterBarProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const panelById = useMemo(
    () => new Map((panels ?? []).map((panel) => [panel.id, panel])),
    [panels],
  );
  const activePanel = activePanelId ? panelById.get(activePanelId) : undefined;

  const closePanel = () => {
    setAnchorEl(null);
    setActivePanelId(null);
  };

  const openPanel = (
    event: MouseEvent<HTMLButtonElement>,
    item: TicketListFilterItem,
  ) => {
    item.onClick?.();

    if (!panelById.has(item.id)) {
      return;
    }

    setAnchorEl(event.currentTarget);
    setActivePanelId(item.id);
  };

  const selectPanelValue = (
    panel: TicketListFilterPanelItem,
    value?: string,
  ) => {
    onFilterChange?.(panel.id, value);
    closePanel();
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          px: { mobile: 2, tablet: 3, desktop: 4 },
          py: 1,
          borderBottom: `1px solid ${ticketListPalette.frameBorder}`,
          bgcolor: ticketListPalette.canvas,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 1,
          }}
        >
          {items.map((item) => (
            <FilterSelectorPill
              key={item.id}
              {...item}
              onClick={(event) => openPanel(event, item)}
            />
          ))}

          <ButtonBase disableRipple onClick={onClear} sx={{ px: 1, py: 0.5 }}>
            <Typography
              sx={{
                color: ticketListPalette.bodyText,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 500,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              {clearLabel}
            </Typography>
          </ButtonBase>
        </Stack>

        {/* <AiReviewIndicator {...aiReviewIndicator} /> */}
      </Box>

      <Popover
        open={Boolean(anchorEl && activePanel)}
        anchorEl={anchorEl}
        onClose={closePanel}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              width: 260,
              borderRadius: '8px',
              border: `1px solid ${ticketListPalette.frameBorder}`,
              boxShadow: '0 14px 28px rgba(21, 28, 34, 0.14)',
            },
          },
        }}
      >
        {activePanel ? (
          <Box sx={{ p: 1.25 }}>
            <Typography
              sx={{
                px: 1,
                pb: 0.75,
                color: ticketListPalette.bodyText,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 700,
                letterSpacing: '0.6px',
              }}
            >
              {activePanel.label}
            </Typography>

            <Stack role="menu" spacing={0.25}>
              <FilterPanelOption
                label="全部"
                selected={!selectedValues?.[activePanel.id]}
                onClick={() => selectPanelValue(activePanel)}
              />
              {activePanel.options.map((option) => (
                <FilterPanelOption
                  key={option.value}
                  label={option.label}
                  selected={selectedValues?.[activePanel.id] === option.value}
                  onClick={() => selectPanelValue(activePanel, option.value)}
                />
              ))}
            </Stack>
          </Box>
        ) : null}
      </Popover>
    </>
  );
}

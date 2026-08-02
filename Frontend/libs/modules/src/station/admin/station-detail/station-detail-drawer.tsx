'use client';

import type { ReactNode } from 'react';

import { Box, Stack, Typography } from '@mui/material';

import { AdminDetailModalFrame } from '../../../admin/shared/detail-modal-frame';

import {
  stationDetailDimensions,
  useStationDetailColorScheme,
  type StationDetailColorScheme,
} from './constants';
import { StationCapacityBar } from './station-capacity-bar';
import { StationDetailFooterAction } from './station-detail-footer-action';
import { StationDetailHeader } from './station-detail-header';
import { StationDetailInfoPanel } from './station-detail-info-panel';
import { StationDetailTabs } from './station-detail-tabs';
import type {
  StationDetailDrawerProps,
  StationDetailTabId,
  StationSummaryProps,
} from './types';

function renderFallbackPanel(
  activeTab: StationDetailTabId,
  label: string,
  stationDetailPalette: StationDetailColorScheme,
) {
  return (
    <Box
      sx={{
        p: 3,
        borderRadius: '32px',
        bgcolor: stationDetailPalette.cardSurface,
        border: `1px solid ${stationDetailPalette.cardBorder}`,
      }}
    >
      <Stack spacing={1}>
        <Typography
          sx={{
            color: stationDetailPalette.heading,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 600,
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            color: stationDetailPalette.bodyText,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 400,
          }}
        >
          {activeTab === 'history'
            ? '這裡可由外部 consumer 注入歷史記錄檢視內容。'
            : '這裡可由外部 consumer 注入待處理檢視內容。'}
        </Typography>
      </Stack>
    </Box>
  );
}

function resolveActivePanel({
  activeTab,
  activeLabel,
  tabPanels,
  stationSummary,
  contactCard,
  resources,
  stationDetailPalette,
}: {
  activeTab: StationDetailTabId;
  activeLabel: string;
  tabPanels: StationDetailDrawerProps['tabPanels'];
  stationSummary: StationSummaryProps;
  contactCard: StationDetailDrawerProps['contactCard'];
  resources: StationDetailDrawerProps['resources'];
  stationDetailPalette: StationDetailColorScheme;
}): ReactNode {
  const injectedPanel = tabPanels?.[activeTab];

  if (injectedPanel) {
    return injectedPanel;
  }

  if (activeTab === 'info') {
    return (
      <StationDetailInfoPanel
        stationSummary={stationSummary}
        contactCard={contactCard}
        resources={resources}
      />
    );
  }

  return renderFallbackPanel(activeTab, activeLabel, stationDetailPalette);
}

export function StationDetailDrawer({
  stationSummary,
  capacity,
  tabs,
  activeTab,
  editAction,
  secondaryAction,
  onTabChange,
  contactCard,
  resources,
  tabPanels,
  footerAction,
  closeAction,
  width = stationDetailDimensions.width,
  height,
  minHeight = stationDetailDimensions.minHeight,
}: StationDetailDrawerProps) {
  const stationDetailPalette = useStationDetailColorScheme();
  const activeLabel =
    tabs.find((item) => item.id === activeTab)?.label ?? '資訊';

  const activePanel = resolveActivePanel({
    activeTab,
    activeLabel,
    tabPanels,
    stationSummary,
    contactCard,
    resources,
    stationDetailPalette,
  });

  return (
    <AdminDetailModalFrame
      containerSx={{
        width,
        height,
        minHeight,
        bgcolor: stationDetailPalette.frame,
        borderLeft: `1px solid ${stationDetailPalette.border}`,
      }}
      header={
        <Stack
          spacing={1.5}
          sx={{
            px: 2.5,
            height: 75,
            justifyContent: 'center',
            borderBottom: `1px solid ${stationDetailPalette.border}`,
          }}
        >
          <StationDetailHeader
            stationSummary={stationSummary}
            closeAction={closeAction}
          />
          {capacity ? <StationCapacityBar {...capacity} /> : null}
        </Stack>
      }
      tabs={
        tabs.length > 1 ? (
          <StationDetailTabs
            items={tabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        ) : undefined
      }
      footer={
        <StationDetailFooterAction
          actions={[secondaryAction, editAction, footerAction]}
        />
      }
    >
      {activePanel}
    </AdminDetailModalFrame>
  );
}

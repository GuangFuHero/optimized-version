'use client';

import type { ReactNode } from 'react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';

import { AdminDetailModalFrame } from '../../../admin/shared/detail-modal-frame';

const ticketDetailPalette = {
  frame: '#F6FAFF',
  frameBorder: '#DCC1B1',
  surface: '#E7EFF7',
  heading: '#BA1A1A',
  summary: '#151C22',
  label: '#564337',
  body: '#151C22',
  tabActiveSurface: '#DBE3EC',
  tabActiveText: '#954900',
  tabInactiveText: '#564337',
  badgeIconSurface: '#E3791E',
  badgeAccent: '#954900',
  neutralActionText: '#151C22',
  danger: '#BA1A1A',
} as const;

const CloseIcon = Icons.close;
const DetailsIcon = Icons.details;
const LogisticsIcon = Icons.logistics;
const AiAnalysisIcon = Icons.aiAnalysis;
const WarningIcon = Icons.warning;
const PinIcon = Icons.pin;
const PersonIcon = Icons.person;

export interface TicketDetailCloseActionProps {
  ariaLabel?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface TicketDetailTabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

export type TicketDetailTabsVariant = 'default' | 'station';

export interface TicketDetailStatusBadgeProps {
  eyebrow?: string;
  label: string;
  icon?: ReactNode;
  accentColor?: string;
  iconBackgroundColor?: string;
  iconColor?: string;
}

export interface TicketDetailFieldRowProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  showDivider?: boolean;
  valueColor?: string;
}

export interface TicketDetailNotesCardProps {
  label: string;
  value: ReactNode;
}

export interface TicketDetailDetailsPaneProps {
  statusBadge?: TicketDetailStatusBadgeProps;
  locationLabel?: string;
  locationLines?: readonly string[];
  locationIcon?: ReactNode;
  taskLabel?: string;
  taskValue?: ReactNode;
  requesterLabel?: string;
  requesterValue?: ReactNode;
  requesterIcon?: ReactNode;
  notesLabel?: string;
  notesValue?: ReactNode;
}

export interface TicketDetailFooterActionItem {
  id: string;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  intent?: 'neutral' | 'danger';
  placement?: 'inline' | 'block';
  onClick?: () => void;
}

export interface TicketDetailHeaderProps {
  title: string;
  summaryLine?: string;
  closeAction?: TicketDetailCloseActionProps;
}

export interface TicketDetailTabsProps {
  items: readonly TicketDetailTabItem[];
  variant?: TicketDetailTabsVariant;
}

export interface TicketDetailFooterActionsProps {
  items: readonly TicketDetailFooterActionItem[];
}

export interface TicketDetailDrawerProps {
  title?: string;
  summaryLine?: string;
  closeAction?: TicketDetailCloseActionProps;
  tabs?: readonly TicketDetailTabItem[];
  detailsPane?: TicketDetailDetailsPaneProps;
  content?: ReactNode;
  footerActions?: readonly TicketDetailFooterActionItem[];
  tabsVariant?: TicketDetailTabsVariant;
  width?: number | string;
  height?: number | string;
  minHeight?: number | string;
}

function createDefaultCloseAction(): TicketDetailCloseActionProps {
  return {
    ariaLabel: '關閉事件詳情',
    icon: <CloseIcon />,
  };
}

function createDefaultTabs(): readonly TicketDetailTabItem[] {
  return [
    {
      id: 'details',
      label: '詳情',
      icon: <DetailsIcon />,
      selected: true,
    },
    {
      id: 'logistics',
      label: '後勤',
      icon: <LogisticsIcon />,
    },
    {
      id: 'ai-analysis',
      label: '人工智慧分析',
      icon: <AiAnalysisIcon />,
    },
  ];
}

function createDefaultDetailsPane(): TicketDetailDetailsPaneProps {
  return {
    statusBadge: {
      eyebrow: '當前狀態',
      label: '危險',
      icon: <WarningIcon />,
    },
    locationLabel: '位置',
    locationLines: ['北橋街 124 號', '第 7G 區'],
    locationIcon: <PinIcon />,
    taskLabel: '任務類型',
    taskValue: '醫療物資運送',
    requesterLabel: '請求者',
    requesterValue: '約翰·多（現場代理）',
    requesterIcon: <PersonIcon />,
    notesLabel: '註記',
    notesValue: '南大街路段封閉，請從北橋側進入。12 名平民急需醫療包。',
  };
}

function createDefaultFooterActions(): readonly TicketDetailFooterActionItem[] {
  return [
    {
      id: 'edit',
      label: '編輯',
    },
    {
      id: 'change-status',
      label: '更改狀態',
    },
    {
      id: 'delete-ticket',
      label: '刪除工單',
      intent: 'danger',
      placement: 'block',
    },
  ];
}

function TicketDetailIconSlot({
  icon,
  width,
  height,
  color,
}: {
  icon?: ReactNode;
  width: number;
  height: number;
  color: string;
}) {
  if (!icon) {
    return null;
  }

  return (
    <Box
      sx={{
        width,
        height,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        '& > *': {
          width: '100%',
          height: '100%',
        },
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%',
        },
      }}
    >
      {icon}
    </Box>
  );
}

export function TicketDetailHeader({
  title,
  summaryLine,
  closeAction = createDefaultCloseAction(),
}: TicketDetailHeaderProps) {
  return (
    <Stack
      sx={{
        borderBottom: `1px solid ${ticketDetailPalette.frameBorder}`,
        px: 2.5,
        height: 75,
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Typography
          sx={{
            color: ticketDetailPalette.heading,
            fontSize: 18,
            lineHeight: '24px',
            fontWeight: 600,
          }}
        >
          {title}
        </Typography>
        <ButtonBase
          disableRipple
          aria-label={closeAction.ariaLabel ?? 'Close'}
          onClick={closeAction.onClick}
          sx={{
            width: 40,
            height: 40,
            mt: -1,
            borderRadius: '999px',
            color: ticketDetailPalette.summary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TicketDetailIconSlot
            icon={closeAction.icon}
            width={16}
            height={16}
            color={ticketDetailPalette.summary}
          />
        </ButtonBase>
      </Box>
      {summaryLine ? (
        <Typography
          sx={{
            mt: 0.75,
            color: ticketDetailPalette.summary,
            fontSize: 13,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '1.1px',
          }}
        >
          {summaryLine}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function TicketDetailTabs({
  items,
  variant = 'default',
}: TicketDetailTabsProps) {
  if (variant === 'station') {
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          height: 76,
          bgcolor: ticketDetailPalette.surface,
          borderTop: `1px solid ${ticketDetailPalette.frameBorder}`,
          borderBottom: `1px solid ${ticketDetailPalette.frameBorder}`,
        }}
      >
        {items.map((item) => {
          const active = Boolean(item.selected);
          const color = active
            ? ticketDetailPalette.tabActiveText
            : ticketDetailPalette.tabInactiveText;

          return (
            <ButtonBase
              key={item.id}
              disableRipple
              aria-label={item.ariaLabel ?? item.label}
              onClick={item.onClick}
              sx={{
                minWidth: 0,
                px: 1.5,
                pt: 1.25,
                pb: 1.75,
                bgcolor: active
                  ? ticketDetailPalette.tabActiveSurface
                  : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                boxShadow: active
                  ? `inset 0 -3px 0 0 ${ticketDetailPalette.tabActiveText}`
                  : 'none',
              }}
            >
              <TicketDetailIconSlot
                icon={item.icon}
                width={18}
                height={18}
                color={color}
              />
              <Typography
                sx={{
                  color,
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 600,
                  letterSpacing: '0.6px',
                  textAlign: 'center',
                  whiteSpace: 'pre-line',
                }}
              >
                {item.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${ticketDetailPalette.frameBorder}`,
      }}
    >
      {items.map((item) => {
        const color = item.selected
          ? ticketDetailPalette.tabActiveText
          : ticketDetailPalette.tabInactiveText;

        return (
          <ButtonBase
            key={item.id}
            disableRipple
            aria-label={item.ariaLabel ?? item.label}
            onClick={item.onClick}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              pt: 2,
              pb: '18px',
              bgcolor: item.selected
                ? ticketDetailPalette.tabActiveSurface
                : 'transparent',
              borderBottom: item.selected
                ? `2px solid ${ticketDetailPalette.tabActiveText}`
                : '2px solid transparent',
            }}
          >
            <TicketDetailIconSlot
              icon={item.icon}
              width={16.667}
              height={16.667}
              color={color}
            />
            <Typography
              sx={{
                color,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 600,
                letterSpacing: '0.6px',
                textAlign: 'center',
              }}
            >
              {item.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export function TicketDetailStatusBadge({
  eyebrow = '當前狀態',
  label,
  icon = <WarningIcon />,
  accentColor = ticketDetailPalette.badgeAccent,
  iconBackgroundColor = ticketDetailPalette.badgeIconSurface,
  iconColor = '#FFFFFF',
}: TicketDetailStatusBadgeProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: '17px',
        py: '17px',
        border: `1px solid ${ticketDetailPalette.frameBorder}`,
        borderRadius: '32px',
        bgcolor: ticketDetailPalette.surface,
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 35,
          borderRadius: '999px',
          bgcolor: iconBackgroundColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <TicketDetailIconSlot
          icon={icon}
          width={22}
          height={19}
          color={iconColor}
        />
      </Box>
      <Stack spacing={0}>
        <Typography
          sx={{
            color: ticketDetailPalette.label,
            fontSize: 10,
            lineHeight: '12px',
            fontWeight: 700,
            letterSpacing: '0.8px',
          }}
        >
          {eyebrow}
        </Typography>
        <Typography
          sx={{
            color: accentColor,
            fontSize: 20,
            lineHeight: '28px',
            fontWeight: 600,
          }}
        >
          {label}
        </Typography>
      </Stack>
    </Box>
  );
}

export function TicketDetailFieldRow({
  label,
  value,
  icon,
  showDivider = true,
  valueColor = ticketDetailPalette.body,
}: TicketDetailFieldRowProps) {
  return (
    <Stack
      spacing={'4px'}
      sx={{
        pb: showDivider ? '9px' : 0,
        borderBottom: showDivider
          ? `1px solid ${ticketDetailPalette.frameBorder}`
          : 'none',
      }}
    >
      <Typography
        sx={{
          color: ticketDetailPalette.label,
          fontSize: 10,
          lineHeight: '12px',
          fontWeight: 700,
          letterSpacing: '0.8px',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <TicketDetailIconSlot
          icon={icon}
          width={12}
          height={16}
          color={valueColor}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {typeof value === 'string' ? (
            <Typography
              sx={{
                color: valueColor,
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 400,
              }}
            >
              {value}
            </Typography>
          ) : (
            value
          )}
        </Box>
      </Box>
    </Stack>
  );
}

export function TicketDetailNotesCard({
  label,
  value,
}: TicketDetailNotesCardProps) {
  return (
    <Stack spacing={'4px'}>
      <Typography
        sx={{
          color: ticketDetailPalette.label,
          fontSize: 10,
          lineHeight: '12px',
          fontWeight: 700,
          letterSpacing: '0.8px',
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          px: '9px',
          py: '9px',
          bgcolor: ticketDetailPalette.surface,
          border: `1px solid ${ticketDetailPalette.frameBorder}`,
        }}
      >
        {typeof value === 'string' ? (
          <Typography
            sx={{
              color: ticketDetailPalette.label,
              fontSize: 14,
              lineHeight: '20px',
              fontWeight: 400,
            }}
          >
            {value}
          </Typography>
        ) : (
          value
        )}
      </Box>
    </Stack>
  );
}

export function TicketDetailDetailsPane({
  statusBadge = createDefaultDetailsPane().statusBadge,
  locationLabel = '位置',
  locationLines = createDefaultDetailsPane().locationLines,
  locationIcon = <PinIcon />,
  taskLabel = '任務類型',
  taskValue = '醫療物資運送',
  requesterLabel = '請求者',
  requesterValue = '約翰·多（現場代理）',
  requesterIcon = <PersonIcon />,
  notesLabel = '註記',
  notesValue = createDefaultDetailsPane().notesValue,
}: TicketDetailDetailsPaneProps) {
  return (
    <Stack spacing={3}>
      {statusBadge ? <TicketDetailStatusBadge {...statusBadge} /> : null}
      <Stack spacing={2}>
        <TicketDetailFieldRow
          label={locationLabel}
          icon={locationIcon}
          value={
            <Box>
              {(locationLines ?? []).map((line) => (
                <Typography
                  key={line}
                  sx={{
                    color: ticketDetailPalette.body,
                    fontSize: 16,
                    lineHeight: '24px',
                    fontWeight: 400,
                  }}
                >
                  {line}
                </Typography>
              ))}
            </Box>
          }
        />
        <TicketDetailFieldRow label={taskLabel} value={taskValue} />
        <TicketDetailFieldRow
          label={requesterLabel}
          icon={requesterIcon}
          value={requesterValue}
        />
        <TicketDetailNotesCard label={notesLabel} value={notesValue} />
      </Stack>
    </Stack>
  );
}

function TicketDetailFooterButton({
  item,
  fullWidth,
}: {
  item: TicketDetailFooterActionItem;
  fullWidth?: boolean;
}) {
  const isDanger = item.intent === 'danger';

  return (
    <ButtonBase
      disableRipple
      aria-label={item.ariaLabel ?? item.label}
      disabled={item.disabled}
      onClick={item.onClick}
      sx={{
        flex: fullWidth ? '0 0 auto' : 1,
        width: fullWidth ? '100%' : 'auto',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 1,
        py: '9px',
        bgcolor: isDanger ? 'transparent' : ticketDetailPalette.surface,
        border: `1px solid ${isDanger ? ticketDetailPalette.danger : ticketDetailPalette.frameBorder}`,
        color: item.disabled
          ? '#7D8790'
          : isDanger
            ? ticketDetailPalette.danger
            : ticketDetailPalette.neutralActionText,
      }}
    >
      <TicketDetailIconSlot
        icon={item.icon}
        width={14}
        height={14}
        color={
          item.disabled
            ? '#7D8790'
            : isDanger
              ? ticketDetailPalette.danger
              : ticketDetailPalette.neutralActionText
        }
      />
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.6px',
          textAlign: 'center',
        }}
      >
        {item.label}
      </Typography>
    </ButtonBase>
  );
}

export function TicketDetailFooterActions({
  items,
}: TicketDetailFooterActionsProps) {
  const inlineItems = items.filter(
    (item) => item.placement !== 'block' && item.intent !== 'danger',
  );
  const blockItems = items.filter(
    (item) => item.placement === 'block' || item.intent === 'danger',
  );

  return (
    <Stack
      spacing={2}
      sx={{
        borderTop: `1px solid ${ticketDetailPalette.frameBorder}`,
        px: 2.5,
        pt: 2,
        pb: 2.25,
        bgcolor: ticketDetailPalette.frame,
      }}
    >
      {inlineItems.length > 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1.5 }}>
          {inlineItems.map((item) => (
            <TicketDetailFooterButton key={item.id} item={item} />
          ))}
        </Box>
      ) : null}
      {blockItems.map((item) => (
        <TicketDetailFooterButton key={item.id} item={item} fullWidth />
      ))}
    </Stack>
  );
}

export function TicketDetailDrawer({
  title = '事件詳情',
  summaryLine,
  closeAction = createDefaultCloseAction(),
  tabs = createDefaultTabs(),
  detailsPane = createDefaultDetailsPane(),
  content,
  footerActions = createDefaultFooterActions(),
  tabsVariant = 'default',
  width = 400,
  height,
  minHeight = 1024,
}: TicketDetailDrawerProps) {
  return (
    <AdminDetailModalFrame
      containerSx={{
        width,
        height,
        minHeight,
        bgcolor: ticketDetailPalette.frame,
        borderLeft: `1px solid ${ticketDetailPalette.frameBorder}`,
      }}
      header={
        <TicketDetailHeader
          title={title}
          summaryLine={summaryLine}
          closeAction={closeAction}
        />
      }
      tabs={<TicketDetailTabs items={tabs} variant={tabsVariant} />}
      footer={<TicketDetailFooterActions items={footerActions} />}
    >
      {content ?? <TicketDetailDetailsPane {...detailsPane} />}
    </AdminDetailModalFrame>
  );
}

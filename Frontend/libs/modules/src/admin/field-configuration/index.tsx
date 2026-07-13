'use client';

import type { ReactNode } from 'react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

const CloseIcon = Icons.close;
const CheckIcon = Icons.check;

export type AdminFieldConfigurationToggleVariant = 'core' | 'standard';
export type AdminFieldConfigurationFieldTone = 'default' | 'muted';
export type AdminFieldConfigurationFooterActionVariant =
  | 'contained'
  | 'outlined';

export interface AdminFieldConfigurationIconAction {
  ariaLabel?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface AdminFieldConfigurationHeaderProps {
  title: string;
  disasterLabel: string;
  closeAction?: AdminFieldConfigurationIconAction;
}

export interface AdminFieldConfigurationToggleProps {
  checked: boolean;
  variant?: AdminFieldConfigurationToggleVariant;
  ariaLabel?: string;
  onToggle?: (checked: boolean) => void;
}

export interface AdminFieldConfigurationFieldRowProps {
  id: string;
  label: string;
  metadata?: string;
  toggle: AdminFieldConfigurationToggleProps;
  tone?: AdminFieldConfigurationFieldTone;
}

export interface AdminFieldConfigurationSectionProps {
  title: string;
  rows: readonly AdminFieldConfigurationFieldRowProps[];
}

export interface AdminFieldConfigurationExtensionCardProps {
  title: string;
  subtitleLines?: readonly string[];
  badgeLabel?: string;
  rows: readonly AdminFieldConfigurationFieldRowProps[];
  helperText?: string;
  highlighted?: boolean;
}

export interface AdminFieldConfigurationTaskTypeCardProps {
  id: string;
  title: string;
  badgeLabel?: string;
  rows: readonly AdminFieldConfigurationFieldRowProps[];
  helperText?: string;
}

export interface AdminFieldConfigurationTaskTypeSectionProps {
  title: string;
  cards: readonly AdminFieldConfigurationTaskTypeCardProps[];
}

export interface AdminFieldConfigurationFooterAction {
  id: string;
  label: string;
  variant?: AdminFieldConfigurationFooterActionVariant;
  ariaLabel?: string;
  onClick?: () => void;
}

export interface AdminFieldConfigurationFooterProps {
  actions?: readonly AdminFieldConfigurationFooterAction[];
  helperText?: string;
}

export interface AdminFieldConfigurationPanelProps {
  header?: AdminFieldConfigurationHeaderProps;
  coreSection?: AdminFieldConfigurationSectionProps;
  locationSection?: AdminFieldConfigurationSectionProps;
  searchRescueExtension?: AdminFieldConfigurationExtensionCardProps | null;
  taskTypeSection?: AdminFieldConfigurationTaskTypeSectionProps | null;
  footer?: AdminFieldConfigurationFooterProps;
  width?: number | string;
  minHeight?: number | string;
}

function createDefaultHeader(): AdminFieldConfigurationHeaderProps {
  return {
    title: '欄位設定',
    disasterLabel: '目前災害：🌍 地震',
    closeAction: {
      ariaLabel: '關閉欄位設定面板',
      onClick: () => undefined,
    },
  };
}

function createCoreRows(): readonly AdminFieldConfigurationFieldRowProps[] {
  return [
    '任務ID',
    '任務類型',
    '災害類型',
    '標題',
    '描述',
    '狀態',
    '優先級',
    '建立時間',
  ].map((label) => ({
    id: label,
    label,
    metadata: '(必要)',
    toggle: {
      checked: true,
      variant: 'core',
      onToggle: () => undefined,
    },
  }));
}

function createLocationRows(): readonly AdminFieldConfigurationFieldRowProps[] {
  return [
    { id: 'address', label: '地址', checked: true },
    { id: 'utility-pole', label: '電線桿編號', checked: false },
    { id: 'source', label: '資料來源', checked: true },
    { id: 'visibility', label: '可見性', checked: true },
    { id: 'photos', label: '現場照片', checked: true },
  ].map(({ id, label, checked }) => ({
    id,
    label,
    toggle: {
      checked,
      variant: 'standard',
      onToggle: () => undefined,
    },
  }));
}

function createSearchRescueRows(): readonly AdminFieldConfigurationFieldRowProps[] {
  return ['受影響人數', '樓層資訊', '房號', '危險說明'].map((label) => ({
    id: label,
    label,
    toggle: {
      checked: true,
      variant: 'standard',
      onToggle: () => undefined,
    },
  }));
}

function createTransportRows(): readonly AdminFieldConfigurationFieldRowProps[] {
  return ['目的地', '載具需求', '運送內容', '運送數量'].map((label) => ({
    id: label,
    label,
    tone: 'muted',
    toggle: {
      checked: false,
      variant: 'standard',
      onToggle: () => undefined,
    },
  }));
}

function createCleanupRows(): readonly AdminFieldConfigurationFieldRowProps[] {
  return ['清理類型', '所需工具'].map((label) => ({
    id: label,
    label,
    tone: 'muted',
    toggle: {
      checked: false,
      variant: 'standard',
      onToggle: () => undefined,
    },
  }));
}

function createDefaultCoreSection(): AdminFieldConfigurationSectionProps {
  return {
    title: '核心欄位（固定啟用）',
    rows: createCoreRows(),
  };
}

function createDefaultLocationSection(): AdminFieldConfigurationSectionProps {
  return {
    title: '位置與來源',
    rows: createLocationRows(),
  };
}

function createDefaultSearchRescueExtension(): AdminFieldConfigurationExtensionCardProps {
  return {
    title: '搜救擴充欄位',
    subtitleLines: ['搜救任務', '延伸欄位'],
    badgeLabel: '系統自動啟用 · 地震',
    rows: createSearchRescueRows(),
    helperText: '切換災害類型將重設此區塊的自動啟用狀態',
    highlighted: true,
  };
}

function createDefaultTaskTypeSection(): AdminFieldConfigurationTaskTypeSectionProps {
  return {
    title: '任務類型擴充欄位',
    cards: [
      {
        id: 'transport',
        title: '🚛 運輸欄位',
        badgeLabel: '依任務類型啟用',
        rows: createTransportRows(),
        helperText: '物資配送/人員接駁任務自動啟用',
      },
      {
        id: 'cleanup',
        title: '🧹 清理修復欄位',
        badgeLabel: '依任務類型啟用',
        rows: createCleanupRows(),
        helperText: '清理/修復任務自動啟用',
      },
    ],
  };
}

function createDefaultFooterActions(): readonly AdminFieldConfigurationFooterAction[] {
  return [
    {
      id: 'reset',
      label: '重設預設值',
      variant: 'outlined',
      onClick: () => undefined,
    },
    {
      id: 'apply',
      label: '儲存並套用',
      variant: 'contained',
      onClick: () => undefined,
    },
  ];
}

function createDefaultFooter(): AdminFieldConfigurationFooterProps {
  return {
    actions: createDefaultFooterActions(),
    helperText: '設定將套用至當前災害事件的所有新建任務',
  };
}

function AdminFieldConfigurationIconSlot({
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

function useFieldConfigurationPalette() {
  return getRescueColorScheme(useTheme()).adminPanels.fieldConfiguration;
}

function resolveFieldColor(
  tone: AdminFieldConfigurationFieldTone = 'default',
  fieldConfigurationPalette: ReturnType<typeof useFieldConfigurationPalette>,
) {
  return tone === 'muted'
    ? fieldConfigurationPalette.mutedBodyText
    : fieldConfigurationPalette.bodyText;
}

export function AdminFieldConfigurationToggle({
  checked,
  variant = 'standard',
  ariaLabel,
  onToggle,
}: AdminFieldConfigurationToggleProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();
  const knobSize = checked ? (variant === 'core' ? 24 : 20) : 16;
  const knobOffset = checked ? (variant === 'core' ? -4 : -2) : 0;

  return (
    <ButtonBase
      disableRipple
      aria-label={ariaLabel ?? '切換欄位顯示'}
      aria-pressed={checked}
      onClick={() => onToggle?.(!checked)}
      sx={{
        width: 40,
        display: 'inline-flex',
        justifyContent: 'flex-end',
        px: 0,
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 16,
          position: 'relative',
          borderRadius: '999px',
          bgcolor: checked
            ? fieldConfigurationPalette.trackOn
            : fieldConfigurationPalette.trackOff,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: knobOffset,
            left: checked ? 'auto' : 0,
            right: checked ? knobOffset : 'auto',
            width: knobSize,
            height: knobSize,
            borderRadius: '999px',
            bgcolor: checked
              ? fieldConfigurationPalette.knobOn
              : fieldConfigurationPalette.knobOff,
            border: checked
              ? `${variant === 'core' ? 4 : 2}px solid transparent`
              : `2px solid ${fieldConfigurationPalette.border}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          {checked ? (
            <AdminFieldConfigurationIconSlot
              icon={<CheckIcon />}
              width={16}
              height={16}
              color="#FFFFFF"
            />
          ) : null}
        </Box>
      </Box>
    </ButtonBase>
  );
}

export function AdminFieldConfigurationFieldRow({
  label,
  metadata,
  toggle,
  tone = 'default',
}: AdminFieldConfigurationFieldRowProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        width: '100%',
      }}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
        <Typography
          sx={{
            color: resolveFieldColor(tone, fieldConfigurationPalette),
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>

        {metadata ? (
          <Typography
            sx={{
              color: fieldConfigurationPalette.metadataText,
              fontSize: 10,
              lineHeight: '20px',
              ml: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            {metadata}
          </Typography>
        ) : null}
      </Box>

      <AdminFieldConfigurationToggle {...toggle} />
    </Box>
  );
}

export function AdminFieldConfigurationSection({
  title,
  rows,
}: AdminFieldConfigurationSectionProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();

  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      <Box
        sx={{
          borderBottom: `1px solid ${fieldConfigurationPalette.sectionBorder}`,
          pb: '5px',
        }}
      >
        <Typography
          sx={{
            color: fieldConfigurationPalette.heading,
            fontSize: 14,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '0.7px',
          }}
        >
          {title}
        </Typography>
      </Box>

      <Stack spacing={1} sx={{ width: '100%' }}>
        {rows.map((row) => (
          <AdminFieldConfigurationFieldRow key={row.id} {...row} />
        ))}
      </Stack>
    </Stack>
  );
}

export function AdminFieldConfigurationExtensionCard({
  title,
  subtitleLines = [],
  badgeLabel,
  rows,
  helperText,
  highlighted = false,
}: AdminFieldConfigurationExtensionCardProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();
  const badgeSurface = highlighted
    ? fieldConfigurationPalette.actionSurface
    : fieldConfigurationPalette.neutralBadgeSurface;
  const badgeTextColor = highlighted
    ? '#FFFFFF'
    : fieldConfigurationPalette.neutralBadgeText;

  return (
    <Stack
      spacing={highlighted ? 1 : 0.5}
      sx={{
        width: '100%',
        p: '9px',
        bgcolor: highlighted
          ? fieldConfigurationPalette.extensionHighlightSurface
          : fieldConfigurationPalette.surface,
        border: `1px solid ${
          highlighted
            ? fieldConfigurationPalette.extensionHighlightBorder
            : fieldConfigurationPalette.sectionBorder
        }`,
        borderRadius: '12px',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: highlighted ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: 2,
          borderBottom: highlighted
            ? `1px solid ${fieldConfigurationPalette.sectionBorder}`
            : 'none',
          pb: highlighted ? '5px' : 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              color: fieldConfigurationPalette.heading,
              fontSize: highlighted ? 14 : 12,
              lineHeight: highlighted ? '16px' : '16px',
              fontWeight: 500,
              letterSpacing: highlighted ? '0.7px' : '0.6px',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </Typography>

          {subtitleLines.map((line) => (
            <Typography
              key={line}
              sx={{
                color: fieldConfigurationPalette.mutedBodyText,
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 400,
              }}
            >
              {line}
            </Typography>
          ))}
        </Box>

        {badgeLabel ? (
          <Box
            sx={{
              px: '8px',
              py: '4px',
              borderRadius: '999px',
              bgcolor: badgeSurface,
              alignSelf: highlighted ? 'flex-start' : 'center',
            }}
          >
            <Typography
              sx={{
                color: badgeTextColor,
                fontSize: 10,
                lineHeight: '15px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {badgeLabel}
            </Typography>
          </Box>
        ) : null}
      </Box>

      <Stack spacing={0.5} sx={{ width: '100%' }}>
        {rows.map((row) => (
          <AdminFieldConfigurationFieldRow key={row.id} {...row} />
        ))}
      </Stack>

      {helperText ? (
        <Typography
          sx={{
            color: highlighted
              ? fieldConfigurationPalette.helperText
              : fieldConfigurationPalette.helperTextMuted,
            fontSize: 10,
            lineHeight: '12px',
            fontWeight: 500,
          }}
        >
          {helperText}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function AdminFieldConfigurationTaskTypeSection({
  title,
  cards,
}: AdminFieldConfigurationTaskTypeSectionProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();

  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      <Box
        sx={{
          borderBottom: `1px solid ${fieldConfigurationPalette.sectionBorder}`,
          pb: '5px',
        }}
      >
        <Typography
          sx={{
            color: fieldConfigurationPalette.heading,
            fontSize: 14,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '0.7px',
          }}
        >
          {title}
        </Typography>
      </Box>

      <Stack spacing={2} sx={{ width: '100%' }}>
        {cards.map((card) => (
          <AdminFieldConfigurationExtensionCard
            key={card.id}
            title={card.title}
            badgeLabel={card.badgeLabel}
            rows={card.rows}
            helperText={card.helperText}
          />
        ))}
      </Stack>
    </Stack>
  );
}

export function AdminFieldConfigurationHeader({
  title,
  disasterLabel,
  closeAction,
}: AdminFieldConfigurationHeaderProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();

  return (
    <Box
      sx={{
        bgcolor: fieldConfigurationPalette.headerSurface,
        px: 2,
        py: 2,
      }}
    >
      <Stack spacing={0.5}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Typography
            sx={{
              color: fieldConfigurationPalette.headerText,
              fontSize: 20,
              lineHeight: '28px',
              fontWeight: 700,
            }}
          >
            {title}
          </Typography>

          <ButtonBase
            disableRipple
            aria-label={closeAction?.ariaLabel ?? '關閉面板'}
            onClick={closeAction?.onClick}
            sx={{ color: fieldConfigurationPalette.headerText }}
          >
            <AdminFieldConfigurationIconSlot
              icon={closeAction?.icon ?? <CloseIcon />}
              width={14}
              height={14}
              color={fieldConfigurationPalette.headerText}
            />
          </ButtonBase>
        </Box>

        <Typography
          sx={{
            color: fieldConfigurationPalette.contextText,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 400,
          }}
        >
          {disasterLabel}
        </Typography>
      </Stack>
    </Box>
  );
}

export function AdminFieldConfigurationFooter({
  actions = createDefaultFooterActions(),
  helperText,
}: AdminFieldConfigurationFooterProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();

  return (
    <Box
      sx={{
        bgcolor: fieldConfigurationPalette.footerSurface,
        borderTop: `1px solid ${fieldConfigurationPalette.sectionBorder}`,
        px: 2,
        pt: '17px',
        pb: 2,
      }}
    >
      <Stack spacing={1}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {actions.map((action) => {
            const isContained = action.variant === 'contained';

            return (
              <ButtonBase
                key={action.id}
                disableRipple
                aria-label={action.ariaLabel ?? action.label}
                onClick={action.onClick}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  py: isContained ? '8.5px' : '9px',
                  px: 1,
                  borderRadius: '999px',
                  border: isContained
                    ? '1px solid transparent'
                    : `1px solid ${fieldConfigurationPalette.sectionBorder}`,
                  bgcolor: isContained
                    ? fieldConfigurationPalette.actionSurface
                    : fieldConfigurationPalette.surface,
                  color: isContained
                    ? '#FFFFFF'
                    : fieldConfigurationPalette.heading,
                  '&:hover': {
                    bgcolor: isContained
                      ? fieldConfigurationPalette.actionSurfaceHover
                      : fieldConfigurationPalette.surface,
                  },
                }}
              >
                <Typography
                  sx={{
                    color: isContained
                      ? '#FFFFFF'
                      : fieldConfigurationPalette.heading,
                    fontSize: 12,
                    lineHeight: '16px',
                    fontWeight: 600,
                    letterSpacing: '0.6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {action.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>

        {helperText ? (
          <Typography
            sx={{
              color: fieldConfigurationPalette.helperText,
              fontSize: 10,
              lineHeight: '12px',
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            {helperText}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export function AdminFieldConfigurationPanel({
  header = createDefaultHeader(),
  coreSection = createDefaultCoreSection(),
  locationSection = createDefaultLocationSection(),
  searchRescueExtension = createDefaultSearchRescueExtension(),
  taskTypeSection = createDefaultTaskTypeSection(),
  footer = createDefaultFooter(),
  width = 320,
  minHeight = 2048,
}: AdminFieldConfigurationPanelProps) {
  const fieldConfigurationPalette = useFieldConfigurationPalette();

  return (
    <Box
      component="aside"
      sx={{
        width,
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: fieldConfigurationPalette.surface,
        borderLeft: `1px solid ${fieldConfigurationPalette.sectionBorder}`,
        boxShadow: fieldConfigurationPalette.shadow,
      }}
    >
      <AdminFieldConfigurationHeader {...header} />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          bgcolor: fieldConfigurationPalette.bodySurface,
          px: 2,
          py: 2,
        }}
      >
        <Stack spacing={3} sx={{ width: '100%' }}>
          <AdminFieldConfigurationSection {...coreSection} />
          <AdminFieldConfigurationSection {...locationSection} />

          {searchRescueExtension ? (
            <AdminFieldConfigurationExtensionCard {...searchRescueExtension} />
          ) : null}

          {taskTypeSection ? (
            <AdminFieldConfigurationTaskTypeSection {...taskTypeSection} />
          ) : null}

          <Box sx={{ height: 16, flexShrink: 0 }} />
        </Stack>
      </Box>

      <AdminFieldConfigurationFooter {...footer} />
    </Box>
  );
}

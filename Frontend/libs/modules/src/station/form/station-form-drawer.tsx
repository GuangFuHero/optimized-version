'use client';

import type { ReactNode } from 'react';

import { Box, Typography } from '@mui/material';
import {
  Button,
  designTokens,
  SheetFrame,
  SheetLayout,
  type SheetVariant,
} from '@rescue-frontend/ui';
import { Check, Sparkles } from 'lucide-react';

import {
  StationForm,
  type StationFormProps,
  type StationFormTarget,
  type StationFormView,
} from './station-form';

const { color, radius, typography } = designTokens;

/** The prototype's `StationDrawer` width (`station-drawer.jsx`). */
export const STATION_SHEET_WIDTH = 540;

export interface StationFormDrawerProps
  extends Omit<StationFormProps, 'target' | 'children'> {
  /** What to create or edit; null closes the drawer. */
  target: StationFormTarget | null;
  variant?: SheetVariant;
}

/** The station form in its own sheet: the maps' and `/stations`' create drawer. */
export function StationFormDrawer({
  target,
  variant,
  ...props
}: StationFormDrawerProps) {
  if (!target) return null;

  return (
    <StationForm target={target} {...props}>
      {(view) => (
        <SheetFrame
          open
          onClose={view.close}
          width={STATION_SHEET_WIDTH}
          variant={variant}
          ariaLabel={formTitle(view)}
        >
          <StationFormLayout view={view} />
        </SheetFrame>
      )}
    </StationForm>
  );
}

/**
 * The form's header, body and footer, as the prototype drawer lays them out. It fills whichever
 * `SheetFrame` holds it, so `/stations` can swap it in for a station's details without a second
 * sheet sliding in over the first.
 */
export function StationFormLayout({
  view,
  onClose,
}: {
  view: StationFormView;
  /** The header's close button; the frame's own `onClose` when left out. */
  onClose?: () => void;
}) {
  const { mode, pin, official } = view;

  return (
    <SheetLayout
      eyebrow={mode === 'edit' ? view.typeLabel : undefined}
      title={formTitle(view)}
      onClose={onClose}
      footer={
        view.ready ? (
          <>
            <Typography
              component="div"
              sx={{
                ...typography.body[300],
                color: color.fg.neutral.muted,
                flex: 1,
              }}
            >
              儲存後自動記錄操作者與時間戳
              {/* The banner says it unless it is showing the map's coordinates instead. */}
              {official && pin ? (
                <>
                  <br />
                  後台新增的站點會標示為官方
                </>
              ) : null}
            </Typography>
            <Button
              variant="ghost"
              size="md"
              onClick={view.close}
              disabled={view.submitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              form={view.formId}
              size="md"
              startIcon={<Check size={18} />}
              disabled={view.submitting}
            >
              {mode === 'create' ? '建立站點' : '確認送出'}
            </Button>
          </>
        ) : undefined
      }
    >
      {mode === 'create' && (pin || official) ? (
        <CreateBanner>
          {pin
            ? `座標已由地圖帶入：${formatCoordinate(pin[0])}, ${formatCoordinate(pin[1])}`
            : '新站點將以官方來源建立。'}
        </CreateBanner>
      ) : null}
      {view.body}
    </SheetLayout>
  );
}

function formTitle(view: StationFormView): string {
  return view.mode === 'create' ? '新增資源站' : '編輯站點';
}

/** A map click carries full float precision; five decimals is about a metre. */
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(5)));
}

/** The prototype's create banner: where the new station's coordinates came from. */
function CreateBanner({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        p: '11px 14px',
        mb: '16px',
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.primary.subtle,
        color: color.brand.primary.subtle,
      }}
    >
      <Sparkles size={17} style={{ flexShrink: 0 }} />
      <Typography sx={{ ...typography.body[300], color: 'inherit' }}>
        {children}
      </Typography>
    </Box>
  );
}

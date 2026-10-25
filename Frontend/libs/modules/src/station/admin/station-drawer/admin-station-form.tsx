'use client';

import type { ReactNode } from 'react';

import { Box, Typography } from '@mui/material';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Check, Sparkles } from 'lucide-react';

import {
  StationForm,
  type StationFormProps,
  type StationFormTarget,
  type StationFormView,
} from '../../form';
import {
  AdminStationDrawer,
  AdminStationDrawerCaption,
  AdminStationDrawerLayout,
} from './admin-station-drawer';
import { AdminStationFormFields } from './admin-station-form-fields';

const { color, radius, typography } = designTokens;

type FormProps = Omit<StationFormProps, 'target' | 'children' | 'Fields'>;

export interface AdminStationFormDrawerProps extends FormProps {
  /** The station to create; null closes the drawer. */
  target: Extract<StationFormTarget, { mode: 'create' }> | null;
}

/** `/stations`' create drawer: the station form in its own drawer, in the prototype's layout. */
export function AdminStationFormDrawer({
  target,
  ...props
}: AdminStationFormDrawerProps) {
  if (!target) return null;

  return (
    <StationForm target={target} {...props} Fields={AdminStationFormFields}>
      {(view) => (
        <AdminStationDrawer open onClose={view.close} ariaLabel="新增資源站">
          <AdminStationFormLayout view={view} onClose={view.close} />
        </AdminStationDrawer>
      )}
    </StationForm>
  );
}

export interface StationEditPanelProps
  extends Omit<FormProps, 'onClose' | 'onLocationChange'> {
  uuid: string;
  /** 取消, or a submit with nothing changed: back to wherever the edit started. */
  onCancel: () => void;
  /** The header's close button: closes the drawer the panel sits in. */
  onCloseDrawer: () => void;
}

/**
 * The edit form without a drawer of its own, for `/stations`' station drawer to swap in for the
 * detail view, so editing never stacks a second sheet over it.
 */
export function StationEditPanel({
  uuid,
  onCancel,
  onCloseDrawer,
  ...props
}: StationEditPanelProps) {
  return (
    <StationForm
      target={{ mode: 'edit', uuid }}
      {...props}
      onClose={onCancel}
      Fields={AdminStationFormFields}
    >
      {(view) => (
        <AdminStationFormLayout
          view={view}
          onClose={() => {
            if (!view.submitting) onCloseDrawer();
          }}
        />
      )}
    </StationForm>
  );
}

function AdminStationFormLayout({
  view,
  onClose,
}: {
  view: StationFormView;
  /** The header's close button. */
  onClose: () => void;
}) {
  const { mode, pin } = view;

  return (
    <AdminStationDrawerLayout
      eyebrow={mode === 'create' ? 'CRUD · 新增' : view.typeLabel}
      title={mode === 'create' ? '新增資源站' : '編輯站點'}
      onClose={onClose}
      footer={
        view.ready ? (
          <>
            <AdminStationDrawerCaption flex={1}>
              儲存後自動記錄操作者與時間戳
              {/* The banner says it unless it is showing the map's coordinates instead. */}
              {mode === 'create' && pin ? (
                <>
                  <br />
                  後台新增的站點會標示為官方
                </>
              ) : null}
            </AdminStationDrawerCaption>
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
      {mode === 'create' ? (
        <CreateBanner>
          {pin
            ? `座標已由地圖帶入：${formatCoordinate(pin[0])}, ${formatCoordinate(pin[1])}`
            : '新站點將以官方來源建立。'}
        </CreateBanner>
      ) : null}
      {view.body}
    </AdminStationDrawerLayout>
  );
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

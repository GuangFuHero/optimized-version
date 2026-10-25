'use client';

import { Box, Typography } from '@mui/material';
import { Button, designTokens, Sheet } from '@rescue-frontend/ui';

import {
  StationForm,
  type StationFormProps,
  type StationFormTarget,
} from './station-form';

const { color, typography } = designTokens;

const SHEET_WIDTH = 540;

export interface StationFormDrawerProps
  extends Omit<StationFormProps, 'target' | 'children' | 'Fields'> {
  /** What to create or edit; null closes the drawer. */
  target: StationFormTarget | null;
}

/** The station form in the shared `Sheet`, as the maps open it. */
export function StationFormDrawer({
  target,
  ...props
}: StationFormDrawerProps) {
  if (!target) return null;

  return (
    <StationForm target={target} {...props}>
      {(view) => (
        <Sheet
          open
          onClose={view.close}
          width={SHEET_WIDTH}
          title={view.mode === 'create' ? '新增站點' : '編輯站點'}
          footer={
            view.ready ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                }}
              >
                <Typography
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.muted,
                    flex: 1,
                  }}
                >
                  {view.mode === 'create'
                    ? '後台新增的站點會標示為官方'
                    : '儲存後自動記錄操作者與時間'}
                </Typography>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={view.close}
                  disabled={view.submitting}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  form={view.formId}
                  size="sm"
                  disabled={view.submitting}
                >
                  {view.mode === 'create' ? '建立站點' : '儲存變更'}
                </Button>
              </Box>
            ) : undefined
          }
        >
          {view.body}
        </Sheet>
      )}
    </StationForm>
  );
}

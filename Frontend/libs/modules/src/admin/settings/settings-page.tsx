'use client';

import { Box, CircularProgress, Stack } from '@mui/material';

import {
  useCapability,
  useProjectSettings,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout } from '@rescue-frontend/ui';

import { EventSection } from './event-section';

/**
 * 設定. Every back-office role can read it and only a super admin can change it (prototype
 * `st-app.jsx`, Q5 2026-10-05): project.view and project.edit. Of the prototype's three sections only
 * 這次災害 is built so far.
 */
export function SettingsPage() {
  // Undefined while the user loads: neither the read-only note nor the controls show until it is known.
  const { data: canEdit } = useCapability('project.edit');
  const settings = useProjectSettings();

  return (
    <Box
      sx={{
        p: { mobile: '12px 16px 28px', tablet: '12px 28px 48px' },
        maxWidth: 1040,
        width: '100%',
        mx: 'auto',
      }}
    >
      <Stack sx={{ gap: '20px' }}>
        {canEdit === false ? (
          <Callout>
            <strong>你可以查看所有設定</strong>
            <br />
            只有超級管理員可以修改。想改什麼，請聯絡超級管理員。
          </Callout>
        ) : null}
        {settings.isPending ? (
          <CircularProgress aria-label="正在載入設定" />
        ) : settings.isError ? (
          <Callout tone="danger">
            無法載入設定。
            <Button
              variant="ghost"
              size="sm"
              disabled={settings.isFetching}
              onClick={() => void settings.refetch()}
            >
              重試
            </Button>
          </Callout>
        ) : (
          <EventSection settings={settings.data} canEdit={canEdit === true} />
        )}
      </Stack>
    </Box>
  );
}

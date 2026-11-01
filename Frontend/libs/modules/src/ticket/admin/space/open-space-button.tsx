'use client';

import { useState } from 'react';

import { Building2 } from 'lucide-react';

import { Button } from '@rescue-frontend/ui';

import { SpaceFormDrawer } from './space-form-drawer';
import { useSpaceCapabilities } from './use-space-data';

/**
 * 任務管理's 開啟空間 button and the form it opens. Only those who can open a space see it; there
 * is no read-only stand-in, since the spaces themselves are in the list (Sucre, 2026-10-26).
 */
export function OpenSpaceButton({
  onCreated,
}: {
  onCreated?: (uuid: string) => void;
}) {
  const { canOpen } = useSpaceCapabilities();
  const [open, setOpen] = useState(false);

  if (!canOpen) return null;

  return (
    <>
      <Button
        variant="neutral"
        startIcon={<Building2 size={17} />}
        onClick={() => setOpen(true)}
      >
        開啟空間
      </Button>
      <SpaceFormDrawer
        mode="create"
        open={open}
        onClose={() => setOpen(false)}
        onCreated={onCreated}
      />
    </>
  );
}

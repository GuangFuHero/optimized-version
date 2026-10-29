'use client';

import { useState } from 'react';

import { MapPinPlus } from 'lucide-react';

import { ToolbarButton } from '../../../admin/shared/toolbar-button';
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
      <ToolbarButton onClick={() => setOpen(true)}>
        <MapPinPlus size={17} />
        開啟空間
      </ToolbarButton>
      <SpaceFormDrawer
        mode="create"
        open={open}
        onClose={() => setOpen(false)}
        onCreated={onCreated}
      />
    </>
  );
}

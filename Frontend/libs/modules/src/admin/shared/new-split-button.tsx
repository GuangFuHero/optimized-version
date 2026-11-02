'use client';

import { SplitButton } from '@rescue-frontend/ui';
import { Plus, Upload } from 'lucide-react';

/**
 * 新增 ▾ (BTN-112), one button for the toolbar and the empty list alike: the main part adds one, and
 * the ▾ holds that and the import when `onImport` is set. Without it, a plain button with no ▾.
 */
export function NewSplitButton({
  label,
  newItem,
  importItem,
  onNew,
  onImport,
}: {
  label: string;
  newItem: string;
  importItem: string;
  onNew: () => void;
  onImport?: () => void;
}) {
  return (
    <SplitButton
      label={label}
      startIcon={<Plus size={17} />}
      onClick={onNew}
      items={
        onImport
          ? [
              { label: newItem, icon: <Plus size={16} />, onClick: onNew },
              {
                label: importItem,
                icon: <Upload size={16} />,
                onClick: onImport,
              },
            ]
          : undefined
      }
    />
  );
}

// SPDX-License-Identifier: GPL-3.0-only
import { TextField } from '@mui/material';
import type { ComponentProps } from 'react';

import { AREA_LABEL_NAME_MAX } from '@rescue-frontend/modules';

export function countAreaNameCharacters(name: string): number {
  return [...name.trim()].length;
}

export function AreaNameField({
  value,
  showLocationHint = false,
  ...props
}: Pick<
  ComponentProps<typeof TextField>,
  'autoFocus' | 'disabled' | 'onChange' | 'placeholder'
> & {
  value: string;
  showLocationHint?: boolean;
}) {
  const length = countAreaNameCharacters(value);
  const overBy = length - AREA_LABEL_NAME_MAX;

  return (
    <TextField
      {...props}
      label="名稱"
      required
      value={value}
      error={overBy > 0}
      helperText={
        overBy > 0
          ? `超過 ${overBy} 個字。名稱會顯示在前台地圖上，太長會蓋住旁邊${showLocationHint ? '；地點說明請寫在備註' : ''}`
          : `${showLocationHint ? '會顯示在前台地圖上。地點說明（例如在哪個廣場）請寫在備註 ' : ''}${length}／${AREA_LABEL_NAME_MAX}`
      }
    />
  );
}

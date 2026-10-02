'use client';

import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { useState } from 'react';

import { AuthField, type AuthFieldProps } from '../auth-field';

/** A password field with its own eye, shown or hidden on its own (design `PasswordField`). */
export function AuthPasswordField(
  props: Omit<AuthFieldProps, 'type' | 'endAdornment' | 'inputMode'>,
) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthField
      {...props}
      type={visible ? 'text' : 'password'}
      endAdornment={
        <InputAdornment position="end">
          <IconButton
            type="button"
            edge="end"
            disabled={props.disabled}
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? '隱藏密碼' : '顯示密碼'}
            sx={{ p: 0.5 }}
          >
            {/* What a press does: the open eye shows the password, the crossed one hides it. */}
            {visible ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
          </IconButton>
        </InputAdornment>
      }
    />
  );
}

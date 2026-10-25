'use client';

import type { ReactNode } from 'react';

import {
  Box,
  MenuItem,
  TextField,
  Typography,
  type TextFieldProps,
} from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { EyeOff } from 'lucide-react';

import { OPERATIONAL_STATUS_OPTIONS } from '../operational-status';
import { STATION_TYPE_OPTIONS } from '../type-options';
import type {
  StationFormErrors,
  StationFormState,
  StationLocationType,
} from './station-form-model';

const { color, typography } = designTokens;

export type TextKey = {
  [K in keyof StationFormState]: StationFormState[K] extends string ? K : never;
}[keyof StationFormState];

export interface StationFormFieldsProps {
  mode: 'create' | 'edit';
  form: StationFormState;
  errors: StationFormErrors;
  onChange: <K extends keyof StationFormState>(
    key: K,
    value: StationFormState[K],
  ) => void;
  /** The coordinate fields lost focus: the place to move a map pin to the typed position. */
  onCoordinatesBlur?: () => void;
  isResolvingAddress?: boolean;
  /** Without `station.view_pii` the contact values are masked, so they can't be edited. */
  contactLocked?: boolean;
}

/** The form's fields as the maps' sheet lays them out; `StationForm` takes another layout as `Fields`. */
export function StationFormFields({
  mode,
  form,
  errors,
  onChange,
  onCoordinatesBlur,
  isResolvingAddress = false,
  contactLocked = false,
}: StationFormFieldsProps) {
  const text = (key: TextKey, label: string, props?: TextFieldProps) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={form[key]}
      onChange={(event) => onChange(key, event.target.value)}
      error={Boolean(errors[key])}
      helperText={errors[key]}
      {...props}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Section title="站點資訊">
        {text('name', '站點名稱', {
          required: true,
          placeholder: '例：光復國中收容所',
        })}
        {text('type', '類型', {
          required: true,
          select: true,
          children: STATION_TYPE_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          )),
        })}
        {text('operationalStatus', '營運狀態', {
          select: true,
          children: OPERATIONAL_STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          )),
        })}
        {text('opHour', '開放時間', { placeholder: '例：08:00-20:00' })}
        {text('supplyStatus', '物資狀況', {
          placeholder: '例：飲用水見底、尿布尚有存量',
        })}
        {text('description', '說明', { multiline: true, minRows: 2 })}
      </Section>

      <Section title="位置">
        <Columns count={2}>
          {text('latitude', '緯度', {
            required: true,
            inputMode: 'decimal',
            onBlur: onCoordinatesBlur,
          })}
          {text('longitude', '經度', {
            required: true,
            inputMode: 'decimal',
            onBlur: onCoordinatesBlur,
          })}
        </Columns>
        {mode === 'create' ? (
          <AddressFields text={text} locationType={form.locationType} />
        ) : (
          <Hint>地址建立後無法在此修改。</Hint>
        )}
        {isResolvingAddress ? <Hint>正在根據座標解析地址…</Hint> : null}
      </Section>

      <Section
        title="聯絡資訊"
        description={
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <EyeOff size={14} />
            {contactLocked
              ? '無個資權限，無法修改聯絡資訊'
              : '僅後台可見，公開 API 不會回傳'}
          </Box>
        }
      >
        {text('contactName', '聯絡人', { disabled: contactLocked })}
        {text('contactPhone', '聯絡電話', {
          disabled: contactLocked,
          inputMode: 'tel',
        })}
        {text('contactEmail', '聯絡 Email', {
          disabled: contactLocked,
          inputMode: 'email',
        })}
      </Section>
    </Box>
  );
}

function AddressFields({
  text,
  locationType,
}: {
  text: (key: TextKey, label: string, props?: TextFieldProps) => ReactNode;
  locationType: StationLocationType;
}) {
  return (
    <>
      {text('locationType', '位置類型', {
        select: true,
        children: [
          <MenuItem key="address" value="address">
            一般地址
          </MenuItem>,
          <MenuItem key="pole" value="pole">
            桿位
          </MenuItem>,
        ],
      })}
      {text('fullAddress', '地址', {
        placeholder: '例：花蓮縣光復鄉中正路一段31號',
      })}
      <Columns count={2}>
        {text('floor', '樓層')}
        {text('room', '房號')}
      </Columns>
      {locationType === 'pole' ? (
        <>
          <Columns count={2}>
            {text('poleId', '桿號')}
            {text('poleType', '桿位類型')}
          </Columns>
          {text('poleNote', '桿位備註')}
        </>
      ) : null}
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Box>
        <Typography sx={typography.label[500]}>{title}</Typography>
        {description ? <Hint>{description}</Hint> : null}
      </Box>
      {children}
    </Box>
  );
}

function Columns({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          mobile: '1fr',
          tablet: `repeat(${count}, minmax(0, 1fr))`,
        },
        gap: '12px',
      }}
    >
      {children}
    </Box>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted }}>
      {children}
    </Typography>
  );
}

'use client';

import { useId, type ReactNode } from 'react';

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
import { STATION_TYPE_OPTIONS, getStationTypeLabel } from '../type-options';
import type { StationFormErrors, StationFormState } from './station-form-model';

const { color, motion, radius, typography } = designTokens;

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

/** The prototype's filled input: 46px, neutral subtle fill, a hairline that thickens on focus. */
const filledInputSx = {
  '& .MuiInputBase-root': {
    minHeight: 46,
    borderRadius: `${radius.md}px`,
    bgcolor: color.bg.neutral.subtle,
    color: color.fg.neutral.default,
    ...typography.body[400],
    transition: `box-shadow ${motion.transition.fast}`,
    boxShadow: `inset 0 0 0 1px ${color.border.subtle}`,
    '&.Mui-focused': {
      boxShadow: `inset 0 0 0 1.5px ${color.brand.secondary.default}`,
    },
    '&.Mui-error': {
      boxShadow: `inset 0 0 0 1.5px ${color.bg.danger.default}`,
    },
    '&.Mui-disabled': { bgcolor: color.bg.disable },
  },
  '& .MuiInputBase-input': {
    px: '14px',
    '&::placeholder': { color: color.fg.neutral.muted, opacity: 1 },
  },
  '& .MuiInputBase-inputMultiline': { px: 0 },
  '& .MuiInputBase-multiline': { px: '14px', py: '12px' },
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '& .MuiFormHelperText-root': {
    mx: 0,
    mt: '4px',
    ...typography.body[300],
  },
} as const;

type FieldProps = Omit<TextFieldProps, 'label'> & {
  /** Read by assistive tech only: for the parts of a group that shares one visible label. */
  ariaLabel?: string;
};

/**
 * The station form's fields, laid out like the prototype drawer (`station-drawer.jsx`): labels
 * above filled inputs, two columns, no section headings.
 */
export function StationFormFields({
  mode,
  form,
  errors,
  onChange,
  onCoordinatesBlur,
  isResolvingAddress = false,
  contactLocked = false,
}: StationFormFieldsProps) {
  const field = (key: TextKey, { ariaLabel, ...props }: FieldProps = {}) => (
    <TextField
      fullWidth
      hiddenLabel
      value={form[key]}
      onChange={(event) =>
        onChange(key, event.target.value as StationFormState[typeof key])
      }
      error={Boolean(errors[key])}
      helperText={errors[key]}
      sx={filledInputSx}
      {...props}
      slotProps={{
        ...props.slotProps,
        htmlInput: {
          ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
          ...(props.slotProps?.htmlInput as object | undefined),
        },
      }}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Labeled label="站點名稱" required>
        {(id) => field('name', { id, placeholder: '例：光復國中收容所' })}
      </Labeled>

      <Columns>
        <Labeled label="類型" required>
          {(id) =>
            field('type', {
              id,
              select: true,
              slotProps: {
                select: {
                  displayEmpty: true,
                  renderValue: (value) =>
                    value ? (
                      getStationTypeLabel(String(value))
                    ) : (
                      <Box
                        component="span"
                        sx={{ color: color.fg.neutral.muted }}
                      >
                        選擇類型
                      </Box>
                    ),
                },
              },
              children: STATION_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              )),
            })
          }
        </Labeled>
        <OperationalStatusField field={field} />
      </Columns>

      {mode === 'create' ? (
        <AddressFields field={field} locationType={form.locationType} />
      ) : null}

      <Labeled
        label="座標"
        required
        hint={
          mode === 'create'
            ? isResolvingAddress
              ? '正在根據座標解析地址…'
              : null
            : '地址建立後無法在此修改。'
        }
      >
        {(id) => (
          <Columns gap="8px">
            {field('latitude', {
              id,
              placeholder: '緯度',
              ariaLabel: '緯度',
              inputMode: 'decimal',
              onBlur: onCoordinatesBlur,
            })}
            {field('longitude', {
              placeholder: '經度',
              ariaLabel: '經度',
              inputMode: 'decimal',
              onBlur: onCoordinatesBlur,
            })}
          </Columns>
        )}
      </Labeled>

      <Labeled label="開放時間">
        {(id) => field('opHour', { id, placeholder: '24 小時開放' })}
      </Labeled>

      <Labeled label="物資狀況">
        {(id) =>
          field('supplyStatus', {
            id,
            placeholder: '例：飲用水見底、尿布尚有存量',
          })
        }
      </Labeled>
      <Labeled label="說明">
        {(id) => field('description', { id, multiline: true, minRows: 2 })}
      </Labeled>

      <Columns>
        <Labeled label="聯絡人">
          {(id) =>
            field('contactName', {
              id,
              placeholder: '—',
              disabled: contactLocked,
            })
          }
        </Labeled>
        <Labeled
          label="聯絡電話（不公開）"
          hint={
            <Box
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <EyeOff size={12} style={{ flexShrink: 0 }} />
              {contactLocked
                ? '無個資權限，無法修改聯絡資訊'
                : '僅後台可見，公開 API 不會回傳'}
            </Box>
          }
        >
          {(id) =>
            field('contactPhone', {
              id,
              placeholder: '—',
              disabled: contactLocked,
              inputMode: 'tel',
            })
          }
        </Labeled>
      </Columns>
      <Labeled label="聯絡 Email（不公開）">
        {(id) =>
          field('contactEmail', {
            id,
            placeholder: '—',
            disabled: contactLocked,
            inputMode: 'email',
          })
        }
      </Labeled>
    </Box>
  );
}

type Field = (key: TextKey, props?: FieldProps) => ReactNode;

function OperationalStatusField({ field }: { field: Field }) {
  return (
    <Labeled label="營運狀態">
      {(id) =>
        field('operationalStatus', {
          id,
          select: true,
          children: OPERATIONAL_STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          )),
        })
      }
    </Labeled>
  );
}

/**
 * The prototype's one 地址 input: the line the backend splits into its parts (縣市 … 號), then floor
 * and room, plus the pole fields when the station sits at a utility pole.
 */
function AddressFields({
  field,
  locationType,
}: {
  field: Field;
  locationType: StationFormState['locationType'];
}) {
  return (
    <Labeled label="地址">
      {(id) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {field('fullAddress', {
            id,
            placeholder: '例：花蓮縣光復鄉中正路一段31號',
            ariaLabel: '地址',
          })}
          <Columns count={3} gap="8px">
            {field('floor', { placeholder: '樓層', ariaLabel: '樓層' })}
            {field('room', { placeholder: '房號', ariaLabel: '房號' })}
            {field('locationType', {
              select: true,
              ariaLabel: '位置類型',
              children: [
                <MenuItem key="address" value="address">
                  一般地址
                </MenuItem>,
                <MenuItem key="pole" value="pole">
                  桿位
                </MenuItem>,
              ],
            })}
          </Columns>
          {locationType === 'pole' ? (
            <>
              <Columns gap="8px">
                {field('poleId', { placeholder: '桿號', ariaLabel: '桿號' })}
                {field('poleType', {
                  placeholder: '桿位類型',
                  ariaLabel: '桿位類型',
                })}
              </Columns>
              {field('poleNote', {
                placeholder: '桿位備註',
                ariaLabel: '桿位備註',
              })}
            </>
          ) : null}
        </Box>
      )}
    </Labeled>
  );
}

/** A label above its control, the prototype's `L`; `hint` sits under the control. */
function Labeled({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
    >
      <Typography
        component="label"
        htmlFor={id}
        sx={{ ...typography.label[400], color: color.fg.neutral.default }}
      >
        {label}
        {required ? (
          <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
            {' *'}
          </Box>
        ) : null}
      </Typography>
      {children(id)}
      {hint ? (
        <Typography
          component="div"
          sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
        >
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

function Columns({
  count = 2,
  gap = '14px',
  children,
}: {
  count?: number;
  gap?: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          mobile: '1fr',
          tablet: `repeat(${count}, minmax(0, 1fr))`,
        },
        gap,
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  );
}

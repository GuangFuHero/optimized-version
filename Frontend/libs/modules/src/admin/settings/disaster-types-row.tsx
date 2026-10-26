'use client';

import { ChevronDown, Plus, X } from 'lucide-react';

import {
  Box,
  ButtonBase,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  useDisasterTypes,
  useTicketPropertyConfigs,
  useUpdateProjectSettings,
} from '@rescue-frontend/data-access/admin';
import { Button, designTokens, Dialog } from '@rescue-frontend/ui';

import { NeedsNameHint, SettingsRow } from './settings-layout';
import {
  addableDisasterTypes,
  canRemoveDisasterType,
  disasterTypeLabel,
  fieldCountFor,
} from './settings';

const { color, radius, typography } = designTokens;

function TypeChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <Stack
      component="li"
      direction="row"
      sx={{
        alignItems: 'center',
        gap: '6px',
        height: 30,
        pl: '12px',
        pr: onRemove ? '6px' : '12px',
        borderRadius: `${radius.full}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
        ...typography.label[400],
        color: color.fg.neutral.default,
      }}
    >
      {label}
      {onRemove ? (
        <ButtonBase
          disableRipple
          onClick={onRemove}
          aria-label={`從這次災害拿掉${label}`}
          sx={{
            width: 20,
            height: 20,
            borderRadius: `${radius.full}px`,
            color: color.fg.neutral.muted,
            '&:hover': { bgcolor: color.bg.neutral.sunken },
          }}
        >
          <X size={14} aria-hidden />
        </ButtonBase>
      ) : null}
    </Stack>
  );
}

/**
 * Which disasters this event covers. Each type brings its own questions to a ticket, so taking one
 * away asks first and says how many questions go with it.
 */
export function DisasterTypesRow({
  selected,
  canEdit,
  needsName,
}: {
  selected: readonly string[];
  canEdit: boolean;
  /** No settings row yet: the first save must carry the name, so this waits for it. */
  needsName: boolean;
}) {
  // Active types only: `includeInactive: true` needs project.edit, and a 403 here would turn the
  // whole page into the shell's 403 page for everyone who can only look.
  const vocab =
    useDisasterTypes({ includeInactive: false }).data?.disasterTypes ?? [];
  // Only to count a type's questions before it is added or taken away, which only an editor does.
  // `includeInactive: true` would need dynamic_field.edit.
  const configs = useTicketPropertyConfigs(
    { disasterTypes: vocab.map((type) => type.key), includeInactive: false },
    { enabled: canEdit && vocab.length > 0 },
  ).data?.ticketPropertyConfigs;
  const update = useUpdateProjectSettings();
  const [adding, setAdding] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const addable = addableDisasterTypes(vocab, selected);
  const label = (key: string) => disasterTypeLabel(vocab, key);

  const add = () => {
    const key = adding;
    if (!key) return;
    // A type no field is scoped to yet saves fine (the backend only warns, ADR-169), but adds
    // nothing to the form, which is worth saying.
    const bringsNothing =
      configs !== undefined && fieldCountFor(configs, key) === 0;
    update.mutate(
      { body: { disaster_types: [...selected, key] } },
      {
        onSuccess: () => {
          setAdding('');
          toast.success(
            bringsNothing
              ? `已加入這次災害。「${label(key)}」還沒有專屬欄位，任務單不會多出題目。`
              : '已加入這次災害',
          );
        },
      },
    );
  };

  const remove = () => {
    const key = removing;
    if (!key) return;
    update.mutate(
      { body: { disaster_types: selected.filter((type) => type !== key) } },
      {
        onSuccess: () => {
          setRemoving(null);
          toast.success('已從這次災害拿掉');
        },
      },
    );
  };

  const removable = canEdit && canRemoveDisasterType(selected);

  return (
    <SettingsRow
      label="這次用到的災害類型"
      help="選了哪幾種，任務單就會多出那幾種災害的專屬欄位。"
    >
      <Stack sx={{ gap: '10px' }}>
        {selected.length ? (
          <Stack
            component="ul"
            direction="row"
            aria-label="這次用到的災害類型"
            sx={{ flexWrap: 'wrap', gap: '8px', m: 0, p: 0, listStyle: 'none' }}
          >
            {selected.map((key) => (
              <TypeChip
                key={key}
                label={label(key)}
                onRemove={removable ? () => setRemoving(key) : undefined}
              />
            ))}
          </Stack>
        ) : (
          <Typography
            sx={{ ...typography.body[400], color: color.fg.neutral.muted }}
          >
            還沒有選任何災害類型
          </Typography>
        )}
        {canEdit && addable.length > 0 ? (
          <Stack
            direction="row"
            sx={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Select<string>
              value={adding}
              displayEmpty
              size="small"
              disabled={needsName || update.isPending}
              onChange={(event) => setAdding(event.target.value)}
              IconComponent={ChevronDown}
              inputProps={{ 'aria-label': '選一種災害類型' }}
              renderValue={(value) =>
                value ? (
                  label(value)
                ) : (
                  <Box component="span" sx={{ color: color.fg.neutral.muted }}>
                    選一種災害類型…
                  </Box>
                )
              }
              sx={{
                minWidth: 200,
                height: 36,
                borderRadius: `${radius.md}px`,
                bgcolor: color.bg.neutral.default,
                ...typography.body[400],
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: color.border.default,
                },
                '& .MuiSelect-icon': { width: 16, height: 16, right: 10 },
              }}
            >
              {addable.map((type) => (
                <MenuItem key={type.key} value={type.key}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              startIcon={<Plus size={14} />}
              disabled={!adding || needsName || update.isPending}
              onClick={add}
            >
              加入
            </Button>
          </Stack>
        ) : null}
        {canEdit && needsName ? <NeedsNameHint /> : null}
      </Stack>
      {removing ? (
        <Dialog
          open
          onClose={() => setRemoving(null)}
          onConfirm={remove}
          title={`從這次災害拿掉「${label(removing)}」？`}
          confirmLabel="拿掉"
          confirmTone="danger"
          submitting={update.isPending}
        >
          <Typography
            sx={{
              ...typography.body[400],
              color: color.fg.neutral.subtle,
              lineHeight: 1.7,
            }}
          >
            {configs
              ? `新的任務單不會再出現這種災害的專屬欄位（${fieldCountFor(configs, removing)} 個）。`
              : '新的任務單不會再出現這種災害的專屬欄位。'}
            <br />
            已經填過的值會保留，任務單上照樣看得到。
          </Typography>
        </Dialog>
      ) : null}
    </SettingsRow>
  );
}

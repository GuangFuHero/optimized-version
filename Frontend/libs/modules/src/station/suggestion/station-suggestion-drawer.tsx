'use client';

import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ButtonBase,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useId, useState } from 'react';
import { useQuery } from 'urql';

import { GetStationForSuggestionDocument } from '@rescue-frontend/data-access';
import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import {
  STATION_SUGGESTION_FIELDS,
  SUGGESTION_TEXT_MAX_LENGTH,
  describeSuggestionValue,
  hasPendingSuggestion,
  startSuggestion,
  stationSuggestionField,
  suggestionProblem,
  type StationSuggestionChoice,
  type StationSuggestionForm,
  type StationSuggestionSnapshot,
} from './fields';

const { color, radius } = designTokens;

const TITLE = '修改建議';

export interface StationSuggestionDrawerProps {
  open: boolean;
  stationUuid: string;
  isAuthenticated: boolean;
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onSignIn: () => void;
  onSubmit: (form: StationSuggestionForm) => void;
}

/**
 * 修改建議 (prototype `SiteStationReportDrawer`, `Design/前台/js/site/site-actions.jsx:1134-1240`):
 * one field of a station, its value now → the suggested one, for a reviewer to take or leave. A
 * guest is told to sign in before typing anything (PUB-FEAT-001 AC-02).
 */
export function StationSuggestionDrawer({
  isAuthenticated,
  onSignIn,
  ...props
}: StationSuggestionDrawerProps) {
  if (!isAuthenticated) {
    return (
      <GuestStationSuggestionDrawer
        open={props.open}
        onClose={props.onClose}
        onSignIn={onSignIn}
      />
    );
  }

  return <StationSuggestionFormDrawer {...props} />;
}

/** The button stays for a guest, who is stopped before typing, not before starting (PUB-PS-104). */
function GuestStationSuggestionDrawer({
  open,
  onClose,
  onSignIn,
}: Pick<StationSuggestionDrawerProps, 'open' | 'onClose' | 'onSignIn'>) {
  return (
    <SiteActionDrawer
      open={open}
      title={TITLE}
      subtitle="登入後才能送出"
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose} sx={{ flex: 1 }}>
            取消
          </Button>
          <Button
            variant="contained"
            startIcon={<LoginRoundedIcon />}
            onClick={onSignIn}
            sx={{ flex: 2 }}
          >
            登入
          </Button>
        </>
      }
    >
      <Alert severity="info">
        <AlertTitle>為什麼要登入</AlertTitle>
        修改建議要經過審核，審核的人要知道建議從哪裡來，才能判斷要不要採用。登入可用
        Email 或手機號碼註冊。
      </Alert>
    </SiteActionDrawer>
  );
}

function StationSuggestionFormDrawer({
  open,
  stationUuid,
  submitting,
  submitError,
  onClose,
  onSubmit,
}: Omit<StationSuggestionDrawerProps, 'isAuthenticated' | 'onSignIn'>) {
  // Read again at each opening: 目前 is the station as it is now, not as the map last read it.
  const [{ data, fetching, error }] = useQuery({
    query: GetStationForSuggestionDocument,
    variables: { uuid: stationUuid },
    requestPolicy: 'network-only',
    pause: !open,
  });
  const station = data?.station ?? null;
  // Untouched, the form sits on the first field at its value now.
  const [edited, setEdited] = useState<StationSuggestionForm | null>(null);
  const form = station
    ? (edited ?? startSuggestion(station, STATION_SUGGESTION_FIELDS[0].name))
    : null;
  const problem = station && form ? suggestionProblem(station, form) : null;

  return (
    <SiteActionDrawer
      open={open}
      title={TITLE}
      subtitle={
        station
          ? `${station.name?.trim() || '這個站點'} · 一次修改一個欄位，送交審核通過後才會公開更新`
          : undefined
      }
      onClose={onClose}
      footer={
        form ? (
          <>
            <Button variant="outlined" onClick={onClose} sx={{ flex: 1 }}>
              取消
            </Button>
            <Button
              variant="contained"
              onClick={() => onSubmit(form)}
              disabled={Boolean(problem) || submitting}
              sx={{ flex: 2 }}
            >
              {submitting ? '送出中…' : '確認送出'}
            </Button>
          </>
        ) : undefined
      }
    >
      {station && form ? (
        <SuggestionForm
          station={station}
          form={form}
          // Why 確認送出 waits, once there is something to say: not on a form just opened.
          problem={edited ? problem : null}
          submitError={submitError}
          onChange={setEdited}
        />
      ) : (
        <Typography
          sx={{
            py: 3,
            textAlign: 'center',
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[14],
            lineHeight: 1.6,
          }}
        >
          {fetching || (!error && !data)
            ? '載入中…'
            : '讀不到這個站點，請關閉後再試一次。'}
        </Typography>
      )}
    </SiteActionDrawer>
  );
}

const sectionLabelSx = {
  mb: 1,
  color: color.fg.neutral.default,
  fontSize: displayTextSize[14],
  lineHeight: 1.2,
  fontWeight: 700,
} as const;

const hintSx = {
  mt: 1,
  color: color.fg.neutral.muted,
  fontSize: displayTextSize[12],
  lineHeight: 1.6,
  textWrap: 'pretty',
} as const;

function SuggestionForm({
  station,
  form,
  problem,
  submitError,
  onChange,
}: {
  station: StationSuggestionSnapshot;
  form: StationSuggestionForm;
  /** Why the form cannot be sent yet, when that is worth saying. */
  problem: string | null;
  submitError: string | null;
  onChange: (form: StationSuggestionForm) => void;
}) {
  const field = stationSuggestionField(form.field);
  const current = field.read(station);
  const fieldLabelId = useId();
  const valueLabelId = useId();

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography id={fieldLabelId} sx={sectionLabelSx}>
          要修改哪一項？
        </Typography>
        <ChoiceChips
          labelledBy={fieldLabelId}
          choices={STATION_SUGGESTION_FIELDS.map(({ name, label }) => ({
            value: name,
            label,
          }))}
          value={form.field}
          // The note goes along to the other field: it is often what made them look.
          onChange={(name) =>
            onChange(
              startSuggestion(
                station,
                name as StationSuggestionForm['field'],
                form.note,
              ),
            )
          }
        />
      </Box>

      {hasPendingSuggestion(station, form.field) ? (
        <Alert severity="info">
          這一項已經有人提出修改建議，正在等待審核。你看到的如果不一樣，仍然可以送出。
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { mobile: '1fr', tablet: '1fr auto 1fr' },
          alignItems: 'center',
          gap: 1.5,
          p: 2,
          borderRadius: `${radius.md}px`,
          border: `1px solid ${color.border.default}`,
          bgcolor: color.bg.neutral.subtle,
        }}
      >
        <ComparedValue
          label="目前"
          value={describeSuggestionValue(field, current)}
        />
        <ArrowForwardRoundedIcon
          aria-hidden
          sx={{
            justifySelf: 'center',
            color: color.fg.neutral.muted,
            transform: { mobile: 'rotate(90deg)', tablet: 'none' },
          }}
        />
        <ComparedValue
          label="你的建議"
          value={
            form.value.trim()
              ? describeSuggestionValue(field, form.value)
              : '尚未填寫'
          }
          emphasised
        />
      </Box>

      <Box>
        <Typography id={valueLabelId} sx={sectionLabelSx}>
          {field.label}
        </Typography>
        {field.kind === 'choice' ? (
          <ChoiceChips
            labelledBy={valueLabelId}
            choices={field.choices ?? []}
            value={form.value}
            onChange={(value) => onChange({ ...form, value })}
          />
        ) : (
          <TextField
            fullWidth
            multiline={
              form.field === 'supply_status' || form.field === 'description'
            }
            minRows={2}
            value={form.value}
            onChange={(event) =>
              onChange({ ...form, value: event.target.value })
            }
            placeholder={field.placeholder}
            slotProps={{
              htmlInput: {
                'aria-labelledby': valueLabelId,
                maxLength: SUGGESTION_TEXT_MAX_LENGTH,
              },
            }}
          />
        )}
        {field.helper ? (
          <Typography sx={hintSx}>{field.helper}</Typography>
        ) : null}
        {problem ? (
          <Typography sx={{ ...hintSx, color: color.fg.neutral.subtle }}>
            {problem}
          </Typography>
        ) : null}
      </Box>

      <TextField
        label="補充說明（選填）"
        fullWidth
        multiline
        minRows={4}
        value={form.note}
        onChange={(event) => onChange({ ...form, note: event.target.value })}
        placeholder="例：今天早上路過看到大門貼了公告"
        helperText="只有審核人員看得到，不會公開顯示"
        slotProps={{ htmlInput: { maxLength: SUGGESTION_TEXT_MAX_LENGTH } }}
      />

      {submitError ? <Alert severity="error">{submitError}</Alert> : null}
    </Stack>
  );
}

function ComparedValue({
  label,
  value,
  emphasised = false,
}: {
  label: string;
  value: string;
  emphasised?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          color: color.fg.neutral.muted,
          fontSize: displayTextSize[12],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.5,
          color: color.fg.neutral.default,
          fontSize: displayTextSize[14],
          lineHeight: 1.5,
          fontWeight: emphasised ? 700 : 400,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/** Pill radios, as the help request's needs are picked (`need-draft-row.tsx`). */
function ChoiceChips({
  labelledBy,
  choices,
  value,
  onChange,
}: {
  labelledBy: string;
  choices: readonly StationSuggestionChoice[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Box
      role="radiogroup"
      aria-labelledby={labelledBy}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
    >
      {choices.map((choice) => {
        const checked = choice.value === value;

        return (
          <ButtonBase
            key={choice.value}
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(choice.value)}
            sx={{
              minHeight: 40,
              px: 2,
              borderRadius: `${radius.full}px`,
              border: `1px solid ${checked ? color.brand.secondary.default : color.border.default}`,
              bgcolor: checked
                ? color.bg.secondary.subtle
                : color.bg.neutral.default,
              color: color.fg.neutral.default,
              fontSize: displayTextSize[13],
              lineHeight: 1.2,
              fontWeight: checked ? 800 : 400,
            }}
          >
            {choice.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

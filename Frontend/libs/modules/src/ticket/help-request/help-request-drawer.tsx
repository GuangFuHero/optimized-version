'use client';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
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
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Badge, designTokens, displayTextSize } from '@rescue-frontend/ui';

import { LocationPicker } from '../../map/components/location-picker';
import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import { PhotoLinkEditor } from '../photos';
import {
  clearHelpRequestDraft,
  readHelpRequestDraft,
  sessionDraftStorage,
  writeHelpRequestDraft,
} from './help-request-draft';
import {
  emptyHelpRequestForm,
  emptyNeed,
  findMissingFields,
  hasRescueNeed,
  type HelpRequestForm,
  type PickedPoint,
} from './help-request-form';
import { NeedDraftRow } from './need-draft-row';

const { color, radius } = designTokens;

const TITLE = '請求協助';

// The columns' widths (backend `ticket.py`, `geo_validation.py`, `models/secondary_location.py`),
// held at the keyboard rather than refused after sending.
const MAX_LENGTH = {
  title: 200,
  floor: 20,
  room: 20,
  contactName: 100,
  contactPhone: 50,
} as const;

interface HelpRequestDrawerProps {
  open: boolean;
  /** A point picked on the main map to start from; without one the drawer asks the device. */
  seed: PickedPoint | null;
  isAuthenticated: boolean;
  /** The signed-in account, whose draft the form is kept as in this tab. */
  userId: string | null;
  submitting: boolean;
  /** Said in the drawer, which stays open with everything as typed. */
  submitError: string | null;
  onClose: () => void;
  onSignIn?: () => void;
  /** Only ever with a form `findMissingFields` finds complete. */
  onSubmit: (form: HelpRequestForm) => void;
}

/**
 * 請求協助 (prototype `SiteTicketCreateDrawer`, `Design/前台/js/site/site-actions.jsx:1424-1765`):
 * a resident says where and what they need. Mounted afresh for each opening (`HelpRequestHost`
 * keys it), so a form starts from what was left unsent in this tab, or else empty with a point from
 * the map there before the first render.
 */
export function HelpRequestDrawer({
  open,
  seed,
  isAuthenticated,
  userId,
  submitting,
  submitError,
  onClose,
  onSignIn,
  onSubmit,
}: HelpRequestDrawerProps) {
  if (!isAuthenticated) {
    return (
      <GuestHelpRequestDrawer
        open={open}
        onClose={onClose}
        onSignIn={onSignIn}
      />
    );
  }

  return (
    <HelpRequestFormDrawer
      open={open}
      seed={seed}
      userId={userId}
      submitting={submitting}
      submitError={submitError}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

/**
 * Shown to a guest rather than hiding the button: someone who needs help and cannot find the way in
 * has nowhere else to go, so they are stopped before sending, not before starting
 * (prototype site-shell.jsx:197-199, site-actions.jsx:1445-1462).
 */
function GuestHelpRequestDrawer({
  open,
  onClose,
  onSignIn,
}: Pick<HelpRequestDrawerProps, 'open' | 'onClose' | 'onSignIn'>) {
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
      <Stack spacing={2}>
        <Alert severity="info">
          <AlertTitle>為什麼要登入</AlertTitle>
          志工會依照你留的資訊到現場，來源必須追得到，雙方才安心。登入可用 Email
          或手機號碼註冊。
        </Alert>
        <Alert severity="warning">
          <AlertTitle>如果現在有人受困或受傷</AlertTitle>
          請直接撥打 <strong>119</strong>，不要等這裡的流程。
        </Alert>
      </Stack>
    </SiteActionDrawer>
  );
}

/** A label above a control that is not a text field, with the same red mark for required. */
function FieldLabel({
  children,
  required = false,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <Typography
      sx={{
        color: color.fg.neutral.default,
        fontSize: displayTextSize[14],
        lineHeight: 1.2,
        fontWeight: 700,
      }}
    >
      {children}
      {required ? (
        <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
          *
        </Box>
      ) : null}
    </Typography>
  );
}

function FieldNote({
  error = false,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <Typography
      role={error ? 'alert' : undefined}
      sx={{
        color: error ? color.fg.danger : color.fg.neutral.muted,
        fontSize: displayTextSize[12],
        lineHeight: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

function HelpRequestFormDrawer({
  open,
  seed,
  userId,
  submitting,
  submitError,
  onClose,
  onSubmit,
}: Omit<HelpRequestDrawerProps, 'isAuthenticated' | 'onSignIn'>) {
  // Read once, for this opening. A draft comes back whole, its point too, over one from the map:
  // its title and address were written for its own point.
  const [draft] = useState(() =>
    userId ? readHelpRequestDraft(sessionDraftStorage(), userId) : null,
  );
  const [form, setForm] = useState<HelpRequestForm>(
    () => draft ?? emptyHelpRequestForm(seed),
  );
  const [restored, setRestored] = useState(draft !== null);
  // 清空重填 remounts the fields too: the small map looks for the device again, and what was typed
  // into the photo box goes.
  const [round, setRound] = useState(0);
  // Marked red only after a first try to send, not while it is still being filled in.
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Not once closed: what is left of the form then was sent, or let go of on 取消.
  useEffect(() => {
    if (open && userId) {
      writeHelpRequestDraft(sessionDraftStorage(), userId, form);
    }
  }, [form, open, userId]);

  const missing = findMissingFields(form);
  const missingKeys = new Set(missing.map((field) => field.key));
  const isMissing = (key: (typeof missing)[number]['key']) =>
    touched && missingKeys.has(key);
  const lastNeed = form.needs[form.needs.length - 1];

  const set =
    <K extends keyof HelpRequestForm>(key: K) =>
    (value: HelpRequestForm[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  /**
   * To the first field still missing, and into it: a summary at the foot alone says something is
   * wrong without saying where, often two screens up (designer, 2026-09-11). `missing` runs top to
   * bottom, so the first is the highest.
   */
  const scrollToMissing = () => {
    const first = missing[0];
    const host = first
      ? formRef.current?.querySelector(`[data-field="${first.key}"]`)
      : null;

    if (!host) {
      return;
    }

    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
    host
      .querySelector<HTMLElement>('input, textarea, button')
      ?.focus({ preventScroll: true });
  };

  const submit = () => {
    setTouched(true);

    if (missing.length) {
      scrollToMissing();
      return;
    }

    onSubmit(form);
  };

  /** 取消 lets go of what was typed; ✕, the scrim and Escape only put it away for later. */
  const cancel = () => {
    if (userId) {
      clearHelpRequestDraft(sessionDraftStorage(), userId);
    }

    onClose();
  };

  /** As a fresh opening would be — at the map's point, if it was opened at one. */
  const startOver = () => {
    setForm(emptyHelpRequestForm(seed));
    setRestored(false);
    setTouched(false);
    setRound((current) => current + 1);
  };

  return (
    <SiteActionDrawer
      open={open}
      title={TITLE}
      subtitle="說明你需要什麼幫忙，送出後志工就看得到並可以承接。"
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={cancel} sx={{ flex: 1 }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={submit}
            disabled={submitting}
            sx={{ flex: 2 }}
          >
            {submitting ? '送出中…' : '送出'}
          </Button>
        </>
      }
    >
      <Stack key={round} ref={formRef} spacing={3}>
        {/* Back after signing in again, the drawer opens already filled in: without a word it could
            pass for one already sent. */}
        {restored ? (
          <Alert
            severity="info"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={startOver}
                // On a phone the words wrap instead: a button broken over two lines reads as two.
                sx={{ whiteSpace: 'nowrap' }}
              >
                清空重填
              </Button>
            }
          >
            已填回你上次還沒送出的內容。
          </Alert>
        ) : null}

        {hasRescueNeed(form.needs) ? (
          <Alert severity="error">
            <AlertTitle>請先撥打 119</AlertTitle>
            有人受困、失聯或受傷時，<strong>119 才是第一線</strong>
            。這張單補的是後續人力，不取代緊急救護。
          </Alert>
        ) : null}

        {/* The asterisk is hidden from screen readers, so the rule is said in words, up front. */}
        <Typography
          sx={{
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[12],
            lineHeight: 1.5,
          }}
        >
          標示{' '}
          <Box
            component="span"
            sx={{ color: color.fg.danger, fontWeight: 700 }}
          >
            *
          </Box>{' '}
          的是必填，其餘可以留空。
        </Typography>

        <Stack spacing={2}>
          <FieldLabel>地點資訊</FieldLabel>

          <Box data-field="title">
            <TextField
              label="標題"
              required
              fullWidth
              size="small"
              value={form.title}
              onChange={(event) => set('title')(event.target.value)}
              placeholder="例：一樓客廳積泥需要幫忙清"
              error={isMissing('title')}
              helperText={isMissing('title') ? '必填' : undefined}
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.title } }}
            />
          </Box>

          {/* The point before the address: once it is marked, the address only says how to tell
              someone where it is (designer, 2026-09-10). */}
          <Stack data-field="landmark" spacing={1}>
            <FieldLabel required>地標</FieldLabel>
            <LocationPicker
              value={form.landmark}
              onChange={set('landmark')}
              invalid={isMissing('landmark')}
            />
            {isMissing('landmark') ? (
              <FieldNote error>請在地圖上標記位置</FieldNote>
            ) : (
              <FieldNote>
                {form.landmark
                  ? '位置不精準沒關係，可以拖曳大頭針微調'
                  : '先在地圖上標好位置，下面的地址就只是補充說明'}
              </FieldNote>
            )}
          </Stack>

          {/* Floor and room are a few characters each, so they share the address's line. */}
          <Box
            data-field="address"
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                mobile: 'minmax(0, 1fr) 80px 80px',
                tablet: 'minmax(0, 1fr) 110px 110px',
              },
              gap: 1.5,
              alignItems: 'start',
            }}
          >
            <TextField
              label="地址"
              required
              size="small"
              value={form.address}
              onChange={(event) => set('address')(event.target.value)}
              placeholder="花蓮縣光復鄉中山路100號"
              error={isMissing('address')}
              helperText={isMissing('address') ? '必填' : undefined}
            />
            {/* With the unit typed in: the address is shown as typed, with no 樓 or 室 added. */}
            <TextField
              label="樓層"
              size="small"
              value={form.floor}
              onChange={(event) => set('floor')(event.target.value)}
              placeholder="3樓"
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.floor } }}
            />
            <TextField
              label="戶／室"
              size="small"
              value={form.room}
              onChange={(event) => set('room')(event.target.value)}
              placeholder="302室"
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.room } }}
            />
          </Box>

          {/* Who to find there — often not whoever is filling this in (designer, 2026-08-11). */}
          <Box
            data-field="contact"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 1.5,
              alignItems: 'start',
            }}
          >
            <TextField
              label="現場聯絡人"
              required
              size="small"
              value={form.contactName}
              onChange={(event) => set('contactName')(event.target.value)}
              placeholder="姓名 / 稱謂"
              error={isMissing('contact')}
              helperText={isMissing('contact') ? '必填' : undefined}
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.contactName } }}
            />
            {/* Not only a phone: some will not give one, and then send nothing at all. */}
            <TextField
              label="聯絡方式"
              size="small"
              value={form.contactPhone}
              onChange={(event) => set('contactPhone')(event.target.value)}
              placeholder="手機或 LINE ID"
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.contactPhone } }}
            />
          </Box>
        </Stack>

        <Stack data-field="needs" spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <FieldLabel required>你需要什麼幫忙？</FieldLabel>
            {form.needs.length > 1 ? <Badge>{form.needs.length}</Badge> : null}
          </Stack>
          {/* Up here, where the eye is, not only in the summary at the foot (designer, 09-13). */}
          {isMissing('needs') ? (
            <FieldNote error>請至少選一項你需要的幫忙</FieldNote>
          ) : null}
          {form.needs.map((row, index) => (
            <NeedDraftRow
              // A row has no id of its own; removing one re-keys those after it, which only
              // remounts their two text boxes.
              key={index}
              row={row}
              index={index}
              showIndex={form.needs.length > 1}
              canRemove={form.needs.length > 1}
              invalid={isMissing('needs') && !row.need}
              onChange={(next) =>
                set('needs')(
                  form.needs.map((current, at) =>
                    at === index ? next : current,
                  ),
                )
              }
              onRemove={() =>
                set('needs')(form.needs.filter((_, at) => at !== index))
              }
            />
          ))}
          {/* Offered only once the last one has its kind: not a blank second row up front. */}
          {lastNeed?.need ? (
            <ButtonBase
              onClick={() => set('needs')([...form.needs, emptyNeed()])}
              sx={{
                gap: 0.75,
                height: 42,
                borderRadius: `${radius.md}px`,
                border: `1px dashed ${color.border.default}`,
                color: color.brand.secondary.subtle,
                fontSize: displayTextSize[14],
                fontWeight: 500,
              }}
            >
              <AddRoundedIcon sx={{ fontSize: 16 }} />
              還需要別的嗎？
            </ButtonBase>
          ) : null}
        </Stack>

        {/* After the needs, and about the place and the person — not a box to pour everything
            into before learning it was to be split up (designer, 2026-09-11). */}
        <TextField
          label="還有什麼要讓志工知道的？（選填）"
          fullWidth
          multiline
          minRows={2}
          value={form.description}
          onChange={(event) => set('description')(event.target.value)}
          placeholder="例：巷子窄，小貨車進不來。阿嬤一個人住，早上九點到下午三點都在家。"
        />

        {/* Last, after the notes and for the same reason: extra, not the frame. First, and someone
            with no photo yet stops here before saying what they need (prototype
            site-actions.jsx:1751-1763). */}
        <PhotoLinkEditor
          value={form.photoUrls}
          onChange={set('photoUrls')}
          label="現場照片（選填）"
          hint="志工出發前看得到。平台不保管照片，只記下網址"
        />

        {touched && missing.length ? (
          <Alert severity="error">
            <AlertTitle>尚有 {missing.length} 項未完成</AlertTitle>
            請補齊：{missing.map((field) => field.label).join('、')}。
          </Alert>
        ) : null}

        {submitError ? <Alert severity="error">{submitError}</Alert> : null}
      </Stack>
    </SiteActionDrawer>
  );
}

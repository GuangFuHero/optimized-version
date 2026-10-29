'use client';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type Ref,
} from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { LocationPicker } from '../../map/components/location-picker';
import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import { SiteBadge } from '../../shell/site/site-badge';
import {
  ADDRESS_MAX_LENGTH,
  addressNote,
  addressToCheck,
  applyPinLookup,
  applyTypedLookup,
  restorePinAddress,
  restoreTypedLine,
  shortDoor,
  type AddressCheck,
  type AddressNote,
  type FoundDoor,
} from '../address-lookup';
import { PhotoLinkEditor } from '../photos';
import {
  holdHelpRequestDraft,
  sessionDraftStorage,
} from './help-request-draft';
import {
  canAddNeedRow,
  emptyHelpRequestForm,
  emptyNeed,
  findMissingFields,
  hasRescueNeed,
  isQuantityMissing,
  MAX_NEEDS,
  type HelpRequestForm,
  type PickedPoint,
} from './help-request-form';
import { NeedDraftRow } from './need-draft-row';
import {
  usePinAddressLookup,
  useTypedAddressLookup,
} from './use-address-lookup';

const { color, radius } = designTokens;

const TITLE = '請求協助';

// The columns' widths (backend `ticket.py`, `geo_validation.py`, `models/secondary_location.py`),
// held at the keyboard rather than refused after sending.
const MAX_LENGTH = {
  title: 200,
  address: ADDRESS_MAX_LENGTH,
  floor: 20,
  room: 20,
  contactName: 100,
  contactPhone: 50,
} as const;

interface HelpRequestDrawerProps {
  open: boolean;
  /** A point picked on the main map to start from; without one the drawer asks the device. */
  seed: PickedPoint | null;
  /** Whether it starts from the draft kept in this tab: not at a point picked on the map. */
  bringsBackDraft: boolean;
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
 * keys it), so a form starts from what was left unsent in this tab, unless opened at a point on the
 * map, or else empty with a point from the map there before the first render.
 */
export function HelpRequestDrawer({
  open,
  seed,
  bringsBackDraft,
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
      bringsBackDraft={bringsBackDraft}
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
        <EmergencyCallNotice />
      </Stack>
    </SiteActionDrawer>
  );
}

/**
 * Small, in the PM's words (2026-10-10): whoever reaches the site already knows to call 119, so it
 * says what the platform is for instead of leading the form.
 */
function EmergencyCallNotice() {
  return (
    <Alert
      severity="error"
      sx={{
        py: 0.25,
        fontSize: displayTextSize[12],
        lineHeight: 1.5,
        '& .MuiAlert-icon': { py: 0.5, fontSize: 18 },
      }}
    >
      緊急醫療需求請即時撥打 <strong>119</strong>{' '}
      或當地醫院電話，平台為災害時期透明資訊、尋求志工用。
    </Alert>
  );
}

/**
 * A label above a control, with the same red mark for required: one that is not a text field, or
 * one whose label is too long to float on its outline (named by `id` through `aria-labelledby`).
 */
function FieldLabel({
  children,
  required = false,
  id,
}: {
  children: ReactNode;
  required?: boolean;
  id?: string;
}) {
  return (
    <Typography
      id={id}
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

const sameCheck = (a: AddressCheck | null, b: AddressCheck | null) =>
  a?.address === b?.address && a?.lat === b?.lat && a?.lng === b?.lng;

const NOTE_ICON_SIZE = 14;

function noteLook(kind: AddressNote['kind'], error: boolean) {
  switch (kind) {
    case 'looking':
    case 'checking':
      return {
        color: color.fg.neutral.muted,
        icon: <CircularProgress size={NOTE_ICON_SIZE - 2} color="inherit" />,
      };
    case 'filled':
    case 'confirmed':
      return {
        color: color.fg.success,
        icon: <VerifiedRoundedIcon sx={{ fontSize: NOTE_ICON_SIZE }} />,
      };
    case 'mismatch':
      return {
        color: color.fg.warning,
        icon: <WarningAmberRoundedIcon sx={{ fontSize: NOTE_ICON_SIZE }} />,
      };
    case 'edited':
      return {
        color: color.fg.neutral.muted,
        icon: <EditRoundedIcon sx={{ fontSize: NOTE_ICON_SIZE }} />,
      };
    default:
      return {
        color: error ? color.fg.danger : color.fg.neutral.muted,
        icon: <InfoOutlinedIcon sx={{ fontSize: NOTE_ICON_SIZE }} />,
      };
  }
}

function NoteOffer({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={onClick}
      // A click or a tap leaves the focus in the address field: leaving it would check the line
      // about to be replaced. A Tab here is not leaving it either (`leaveAddress`).
      onMouseDown={(event) => event.preventDefault()}
      sx={{
        py: 0.25,
        fontSize: displayTextSize[12],
        lineHeight: 1.5,
        textAlign: 'left',
      }}
    >
      {children}
    </Button>
  );
}

/**
 * What the lookups made of the address, right under the field (designer, `site-actions.jsx:
 * 1808-1827`, 2026-10-25): the 門牌 filled in and how far it is, a typed one checked, or none found,
 * with 用大頭針的地址 or 改回你打的 where there is something to go back to. Said as it changes, since
 * it arrives on its own.
 */
function AddressLookupNote({
  ref,
  textId,
  note,
  error,
  onBlur,
  onPinDoor,
  onTypedLine,
}: {
  ref: Ref<HTMLDivElement>;
  /** On the note's words, which describe the address field. */
  textId: string;
  note: AddressNote | null;
  /** The address is still blank after a try to send, and this is what asks for it. */
  error: boolean;
  /** Focus leaving one of the buttons. */
  onBlur: (event: FocusEvent) => void;
  onPinDoor: (door: FoundDoor) => void;
  onTypedLine: (line: string) => void;
}) {
  const look = note ? noteLook(note.kind, error) : null;
  const { pinDoor, typedLine } = note ?? {};

  return (
    <Box ref={ref} aria-live="polite" onBlur={onBlur} sx={{ gridArea: 'note' }}>
      {note && look ? (
        <Stack
          direction="row"
          sx={{
            mt: 0.75,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            columnGap: 0.75,
            rowGap: 0.5,
            color: look.color,
          }}
        >
          <Box sx={{ display: 'flex', height: 18, alignItems: 'center' }}>
            {look.icon}
          </Box>
          {/* Room for a few words before an offer beside it goes to a line of its own. */}
          <Typography
            id={textId}
            sx={{
              flex: '1 1 160px',
              minWidth: 0,
              color: 'inherit',
              fontSize: displayTextSize[12],
              lineHeight: 1.5,
            }}
          >
            {note.text}
          </Typography>
          {typedLine ? (
            <NoteOffer onClick={() => onTypedLine(typedLine)}>
              改回你打的：{typedLine}
            </NoteOffer>
          ) : null}
          {/* The road and number only: the whole line is in the field once it is used. */}
          {pinDoor ? (
            <NoteOffer onClick={() => onPinDoor(pinDoor)}>
              用大頭針的地址：{shortDoor(pinDoor.fullAddress)}
            </NoteOffer>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}

function HelpRequestFormDrawer({
  open,
  seed,
  bringsBackDraft,
  userId,
  submitting,
  submitError,
  onClose,
  onSubmit,
}: Omit<HelpRequestDrawerProps, 'isAuthenticated' | 'onSignIn'>) {
  const [draftHold] = useState(() => holdHelpRequestDraft(bringsBackDraft));
  // Read once, for this opening. Back from signing in at a point, a draft comes back whole, its point
  // too: its title and address were written for its own point.
  const [draft] = useState(() =>
    userId ? draftHold.read(sessionDraftStorage(), userId) : null,
  );
  const [form, setForm] = useState<HelpRequestForm>(
    () => draft ?? emptyHelpRequestForm(seed),
  );
  const notesLabelId = useId();
  const addressId = useId();
  const addressNoteId = useId();
  const [restored, setRestored] = useState(draft !== null);
  // 清空重填 remounts the fields too: the small map looks for the device again, and what was typed
  // into the photo box goes.
  const [round, setRound] = useState(0);
  // Marked red only after a first try to send, not while it is still being filled in.
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);
  const addressNoteRef = useRef<HTMLDivElement | null>(null);
  // The typed line last checked, once the address field was left.
  const [check, setCheck] = useState<AddressCheck | null>(null);
  const pinLookup = usePinAddressLookup(form.landmark);
  const typedLookup = useTypedAddressLookup(check);

  // The pin's 門牌 into the line. Again on 清空重填, whose blank line the same answer is for.
  useEffect(() => {
    setForm((current) => applyPinLookup(current, pinLookup));
  }, [pinLookup, round]);

  useEffect(() => {
    if (check) {
      setForm((current) =>
        applyTypedLookup(current, check.address, typedLookup),
      );
    }
  }, [check, typedLookup]);

  // Not once closed: what is left of the form then was sent, or let go of on 取消.
  useEffect(() => {
    if (open && userId) {
      draftHold.write(sessionDraftStorage(), userId, form);
    }
  }, [draftHold, form, open, userId]);

  const missing = findMissingFields(form);
  const missingKeys = new Set(missing.map((field) => field.key));
  const isMissing = (key: (typeof missing)[number]['key']) =>
    touched && missingKeys.has(key);
  const lastNeed = form.needs[form.needs.length - 1];
  const note = addressNote({
    fields: form,
    pin: form.landmark,
    pinLookup,
    check:
      check && typedLookup
        ? { address: check.address, lookup: typedLookup }
        : null,
  });
  // 「這附近查不到門牌，請自己填地址」 already asks for it: not a 必填 beside it too.
  const addressAsked = note?.kind === 'no_door';
  const addressHelper =
    isMissing('address') && !addressAsked ? '必填' : undefined;
  // The note too, which is all that asks for the address when no door is near the pin. One of our
  // own takes the place of MUI's, which points at its helper text, `${id}-helper-text`.
  const addressDescribedBy =
    [
      addressHelper ? `${addressId}-helper-text` : null,
      note ? addressNoteId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  /**
   * Checked once the field is left, never per keystroke (backend guide §1); a line once. Its answer
   * is applied again if it came while the line was being changed and the line has been changed back.
   * Left with nothing to check, the last check stays: it still names 改回你打的's line.
   */
  const checkAddress = () => {
    const next = addressToCheck(form, form.landmark);

    if (!next) {
      return;
    }

    if (sameCheck(check, next)) {
      setForm((current) =>
        applyTypedLookup(current, next.address, typedLookup),
      );
    } else {
      setCheck(next);
    }
  };

  /**
   * Out of the address field and the note's buttons both. A Tab from the field to 用大頭針的地址, or
   * back, is not leaving it: a check then would swap the note out, and the focused button with it.
   */
  const leaveAddress = (event: FocusEvent) => {
    const to = event.relatedTarget;

    if (
      to instanceof Node &&
      [addressRef.current, addressNoteRef.current].some((box) =>
        box?.contains(to),
      )
    ) {
      return;
    }

    checkAddress();
  };

  // Pressed from the keyboard, a button goes with the note it was in: the focus back to the field,
  // not lost to the page. A click or a tap never took it from the field.
  const backToAddress = () => {
    if (addressNoteRef.current?.contains(document.activeElement)) {
      addressRef.current?.focus();
    }
  };

  const takePinDoor = (door: FoundDoor) => {
    backToAddress();
    setForm((current) => restorePinAddress(current, door));
  };

  const takeTypedLine = (line: string) => {
    backToAddress();
    setCheck(null);
    setForm((current) => restoreTypedLine(current, line));
  };

  const set =
    <K extends keyof HelpRequestForm>(key: K) =>
    (value: HelpRequestForm[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  /**
   * To the first field still missing, and into it: a summary at the foot alone says something is
   * wrong without saying where, often two screens up (designer, 2026-09-11). `missing` runs top to
   * bottom, so the first is the highest. To the top of the form, not its middle: on a phone the
   * keyboard the field opens covers the sheet's lower half, and on an iPhone 13 an address centred
   * in it ended just above the keyboard, under Safari's address bar (WG-030).
   */
  const scrollToMissing = () => {
    const first = missing[0];
    const host = first
      ? formRef.current?.querySelector(`[data-field="${first.key}"]`)
      : null;

    if (!host) {
      return;
    }

    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      draftHold.discard(sessionDraftStorage(), userId);
    }

    onClose();
  };

  /** As a fresh opening would be — at the map's point, if it was opened at one. */
  const startOver = () => {
    setForm(emptyHelpRequestForm(seed));
    setCheck(null);
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
      <Stack
        key={round}
        ref={formRef}
        spacing={3}
        // Clear of the drawer's header when scrolled to a missing field.
        sx={{ '& [data-field]': { scrollMarginTop: 16 } }}
      >
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

        {hasRescueNeed(form.needs) ? <EmergencyCallNotice /> : null}

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

          {/* The address has a row of its own, floor and room side by side under it: the official
              line a lookup puts in is long, and beside two narrow fields it would be cut off, hiding
              what the typed words became. So on a wider screen too, where the drawer is 440px across
              and the address beside them kept about 116px (designer, 2026-10-27). The note is right
              under the address, and next to it in the page, so a Tab from it goes to the note's
              button before the floor. */}
          <Box
            data-field="address"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gridTemplateAreas: '"address address" "note note" "floor room"',
              // Spaced by the fields and the note, so an empty note leaves no gap.
              columnGap: 1.5,
              alignItems: 'start',
            }}
          >
            {/* Filled in from the pin, or typed: the line goes as it stands, checked once left. */}
            <TextField
              id={addressId}
              inputRef={addressRef}
              label="地址"
              required
              size="small"
              value={form.address}
              onChange={(event) => set('address')(event.target.value)}
              onBlur={leaveAddress}
              placeholder="花蓮縣光復鄉中山路100號"
              error={isMissing('address')}
              helperText={addressHelper}
              slotProps={{
                htmlInput: {
                  maxLength: MAX_LENGTH.address,
                  'aria-describedby': addressDescribedBy,
                },
              }}
              sx={{ gridArea: 'address' }}
            />
            <AddressLookupNote
              ref={addressNoteRef}
              textId={addressNoteId}
              note={note}
              error={isMissing('address') && addressAsked}
              onBlur={leaveAddress}
              onPinDoor={takePinDoor}
              onTypedLine={takeTypedLine}
            />
            {/* With the unit typed in: the address is shown as typed, with no 樓 or 室 added. */}
            <TextField
              label="樓層"
              size="small"
              value={form.floor}
              onChange={(event) => set('floor')(event.target.value)}
              placeholder="3樓"
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.floor } }}
              sx={{ gridArea: 'floor', mt: 1.5 }}
            />
            <TextField
              label="戶／室"
              size="small"
              value={form.room}
              onChange={(event) => set('room')(event.target.value)}
              placeholder="302室"
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH.room } }}
              sx={{ gridArea: 'room', mt: 1.5 }}
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
            {form.needs.length > 1 ? (
              <SiteBadge>{form.needs.length}</SiteBadge>
            ) : null}
          </Stack>
          {/* Up here, where the eye is, not only in the summary at the foot (designer, 09-13). */}
          {isMissing('needs') ? (
            <FieldNote error>請至少選一項你需要的幫忙</FieldNote>
          ) : null}
          <Stack data-field="quantity" spacing={1.5}>
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
                quantityMissing={
                  isMissing('quantity') && isQuantityMissing(row)
                }
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
          </Stack>
          {/* Offered only once the last one has its kind: not a blank second row up front. At the
              most one request files, said instead — 「再加一件」 on the ticket takes the rest. */}
          {lastNeed?.need && !canAddNeedRow(form.needs) ? (
            <FieldNote>一次最多 {MAX_NEEDS} 項，送出後可以在單上再加</FieldNote>
          ) : null}
          {lastNeed?.need && canAddNeedRow(form.needs) ? (
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
        {/* Its label above, as in the prototype, not floating on the outline: that long a label
            once showed with the outline running through it as the field took focus (2026-10-03). */}
        <Stack spacing={1}>
          <FieldLabel id={notesLabelId}>
            還有什麼要讓志工知道的？（選填）
          </FieldLabel>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            value={form.description}
            onChange={(event) => set('description')(event.target.value)}
            placeholder="例：巷子窄，小貨車進不來。阿嬤一個人住，早上九點到下午三點都在家。"
            slotProps={{ htmlInput: { 'aria-labelledby': notesLabelId } }}
          />
        </Stack>

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

/**
 * 請求協助: what a resident fills in, and the `createHelpRequest` input it becomes (prototype
 * `SiteTicketCreateDrawer`, `site-actions.jsx:1424-1765`; spec note/help-request-spec.md Q6–Q13).
 */

import type {
  CreateHelpRequestInput,
  HelpRequestTaskInput,
} from '@rescue-frontend/data-access';

import type { PickedPoint } from '../../map/components/location-picker/types';

export type { PickedPoint };

export type SiteNeedValue =
  | 'cleanup'
  | 'supplies'
  | 'care'
  | 'repair'
  | 'transport'
  | 'rescue';

export interface SiteNeedOption {
  value: SiteNeedValue;
  /** In a resident's words; also the need's name when they type no description (Q9). */
  label: string;
  /** The need's `taskType`. A resident is never asked to pick 人力 or 物資: that means nothing to them. */
  kind: 'hr' | 'supply' | 'rescue';
  hint: string;
}

/** The prototype's six (`site-actions.jsx:1151-1158`). Which one was picked is not stored (Q9). */
export const SITE_NEED_OPTIONS: readonly SiteNeedOption[] = [
  {
    value: 'cleanup',
    label: '清淤／搬運',
    kind: 'hr',
    hint: '室內外清理、家具搬運、廢棄物清運',
  },
  {
    value: 'supplies',
    label: '送餐／物資',
    kind: 'supply',
    hint: '長輩、行動不便者的餐食與日用品',
  },
  {
    value: 'care',
    label: '陪同／照顧',
    kind: 'hr',
    hint: '獨居長者探視、就醫陪同',
  },
  {
    value: 'repair',
    label: '修繕',
    kind: 'hr',
    hint: '水電、屋頂、門窗的簡易修復',
  },
  {
    value: 'transport',
    label: '交通接送',
    kind: 'hr',
    hint: '往返收容所、醫院、市區',
  },
  {
    value: 'rescue',
    label: '人員受困／急難',
    kind: 'rescue',
    hint: '有人受困、失聯或受傷',
  },
];

/** Null when nothing is chosen — never the first option, which would read as chosen. */
export function getNeedOption(
  value: SiteNeedValue | null,
): SiteNeedOption | null {
  return SITE_NEED_OPTIONS.find((option) => option.value === value) ?? null;
}

export interface NeedDraft {
  /** Null until chosen: a default kind would file 清淤 for someone who never picked it. */
  need: SiteNeedValue | null;
  name: string;
  /** Text as typed; blank means not known yet, which the server stores as null. */
  quantity: string;
}

export function emptyNeed(): NeedDraft {
  return { need: null, name: '', quantity: '' };
}

export interface HelpRequestForm {
  title: string;
  landmark: PickedPoint | null;
  address: string;
  floor: string;
  room: string;
  /** Whom to ask for at the place — often not the person filing. */
  contactName: string;
  /** A phone number or a LINE ID, as typed. */
  contactPhone: string;
  needs: NeedDraft[];
  description: string;
  /** Links to scene photos kept elsewhere, each checked as it was added (spec S8). Optional. */
  photoUrls: string[];
}

export function emptyHelpRequestForm(
  landmark: PickedPoint | null = null,
): HelpRequestForm {
  return {
    title: '',
    landmark,
    address: '',
    floor: '',
    room: '',
    contactName: '',
    contactPhone: '',
    needs: [emptyNeed()],
    description: '',
    photoUrls: [],
  };
}

/** Matches the `data-field` the drawer puts around each field, to scroll to it. */
export type HelpRequestFieldKey =
  | 'title'
  | 'landmark'
  | 'address'
  | 'contact'
  | 'needs';

export interface MissingField {
  key: HelpRequestFieldKey;
  label: string;
}

function chosenNeeds(needs: readonly NeedDraft[]) {
  return needs.flatMap((row) => {
    const option = getNeedOption(row.need);
    return option ? [{ row, option }] : [];
  });
}

/**
 * What still has to be filled in, in the form's order from the top, so the first is the one to
 * scroll to (Q12). At least one need is required (Q13).
 */
export function findMissingFields(form: HelpRequestForm): MissingField[] {
  const missing: MissingField[] = [];

  if (!form.title.trim()) {
    missing.push({ key: 'title', label: '標題' });
  }
  if (!form.landmark) {
    missing.push({ key: 'landmark', label: '地標' });
  }
  if (!form.address.trim()) {
    missing.push({ key: 'address', label: '地址' });
  }
  if (!form.contactName.trim()) {
    missing.push({ key: 'contact', label: '現場聯絡人' });
  }
  if (chosenNeeds(form.needs).length === 0) {
    missing.push({ key: 'needs', label: '至少要選一項你需要的幫忙' });
  }

  return missing;
}

/** Someone trapped or hurt: the form then says to call 119 first, and sets no flag (Q12). */
export function hasRescueNeed(needs: readonly NeedDraft[]): boolean {
  return chosenNeeds(needs).some(({ option }) => option.kind === 'rescue');
}

function textOrNull(value: string): string | null {
  return value.trim() || null;
}

/** Blank is not known yet; anything typed asks for at least one, as the prototype rounds it. */
function readQuantity(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  return Math.max(1, Number.parseInt(value, 10) || 1);
}

/** For a form `findMissingFields` finds complete. */
export function toHelpRequestInput(
  form: HelpRequestForm,
): CreateHelpRequestInput {
  const landmark = form.landmark;

  if (!landmark) {
    throw new Error('toHelpRequestInput needs a form with its landmark set');
  }

  return {
    title: form.title.trim(),
    description: textOrNull(form.description),
    geometry: { type: 'Point', coordinates: [landmark.lng, landmark.lat] },
    contactName: form.contactName.trim(),
    contactPhone: textOrNull(form.contactPhone),
    // The address is one line of free text; the backend parses none of it (Q7).
    secondaryLocation: {
      landmarkNote: form.address.trim(),
      floor: textOrNull(form.floor),
      room: textOrNull(form.room),
    },
    tasks: form.needs.flatMap((row) => {
      const need = toNeedInput(row);
      return need ? [need] : [];
    }),
    photoUrls: form.photoUrls,
  };
}

/**
 * One need as the server takes it, from the drawer or from 「再加一件」 alike; null until a kind is
 * chosen. Named by the choice when nothing was typed (Q9).
 */
export function toNeedInput(row: NeedDraft): HelpRequestTaskInput | null {
  const option = getNeedOption(row.need);

  if (!option) {
    return null;
  }

  return {
    taskType: option.kind,
    taskName: row.name.trim() || option.label,
    quantity: readQuantity(row.quantity),
  };
}

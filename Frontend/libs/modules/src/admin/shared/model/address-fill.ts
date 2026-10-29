import type { AdminReverseGeocodeQuery } from '@rescue-frontend/data-access/admin';

type AddressLookup = AdminReverseGeocodeQuery['reverseGeocode'];

/** The address part of an admin form (station or ticket) that a pin's TGOS lookup can fill. */
export interface AddressFillFields {
  fullAddress: string;
  /**
   * The TGOS lookup's token for `fullAddress`, or ''. Sent with the unchanged line, it saves the
   * address as verified; editing the line drops it, and the address is saved unverified.
   */
  addressToken: string;
  floor: string;
  room: string;
}

/** Fields typed into the form. A new address line no longer matches the lookup's token. */
export function updateAddressFields<T extends AddressFillFields>(
  form: T,
  patch: Partial<T>,
): T {
  const next = { ...form, ...patch };
  if ('fullAddress' in patch && !('addressToken' in patch))
    next.addressToken = '';
  return next;
}

/**
 * What a lookup found, filled in only where the form is still blank: the line with its token, and
 * a 樓 or 室 the lookup split off. A line already there, typed or from an earlier lookup, is never
 * replaced.
 */
export function applyReverseGeocode<T extends AddressFillFields>(
  form: T,
  lookup: AddressLookup,
): T {
  if (lookup.status !== 'found' || !lookup.fullAddress) return form;
  if (form.fullAddress.trim()) return form;
  return {
    ...form,
    fullAddress: lookup.fullAddress,
    addressToken: lookup.addressToken ?? '',
    floor: form.floor.trim() ? form.floor : (lookup.floor ?? form.floor),
    room: form.room.trim() ? form.room : (lookup.room ?? form.room),
  };
}

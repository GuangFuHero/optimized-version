/** The parts of `Storage` this code uses: `localStorage` in the browser, a stand-in in tests. */
export type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * This browser's `localStorage`, or null where it will not hand it over (site data blocked, or no
 * browser at all while rendering on the server): reading `window.localStorage` can throw.
 */
export function localDeviceStorage(): DeviceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

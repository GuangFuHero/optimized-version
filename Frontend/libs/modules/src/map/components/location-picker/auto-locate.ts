/**
 * Whether the small map asks the device where it is when it opens. A resident opening 請求協助 from
 * a button starts from where they stand; a form that turns it off — 開啟空間, whose back-office
 * user is rarely at the building (designer, 任務管理.md §新增地點 1) — waits for a tap.
 */
export function shouldAutoLocate(input: {
  autoLocate: boolean;
  hasInitialValue: boolean;
}): boolean {
  return input.autoLocate && !input.hasInitialValue;
}

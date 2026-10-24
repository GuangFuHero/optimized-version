import { formatTaiwanTime } from '../time';

/** The class of the sheet that alone is printed; `BriefingPrintStyles` shows it only on paper. */
export const BRIEFING_PRINT_SHEET = 'briefing-print-sheet';

function line(tag: 'h1' | 'p' | 'strong', text: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

/**
 * 列印清單 (prototype `ChecklistTools` print, VB-BR-19b1–19b6): the browser's own print, no PDF maker.
 * The article is copied into a sheet of its own and only that is printed — the site's frame holds the
 * page to one screen (`100dvh`, `overflow: hidden`), which is why printing it as it stands gives one
 * screen's worth.
 *
 * On paper every box is empty: the sheet is for ticking by hand while packing, so what is ticked on
 * screen must not come along. `cloneNode` copies whether a box is ticked (the HTML cloning steps do),
 * so the copy is unticked here; the print styles draw empty boxes as well.
 */
export function printBriefing(
  article: HTMLElement,
  publishedAt: string | null,
): void {
  const sheet = document.createElement('div');
  sheet.className = BRIEFING_PRINT_SHEET;

  const head = document.createElement('header');
  head.append(
    line('h1', '志工行前資訊'),
    line(
      'p',
      `最後更新 ${formatTaiwanTime(publishedAt) ?? '—'} · 列印於 ${formatTaiwanTime(new Date().toISOString())}`,
    ),
    line(
      'strong',
      '紙本會過期。出發前請再看一次線上版，交通管制與報到方式常常當天就變。',
    ),
  );

  const copy = article.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((box) => {
      box.checked = false;
      box.removeAttribute('checked');
    });

  sheet.append(head, copy);
  document.body.append(sheet);

  const cleanUp = () => {
    sheet.remove();
    window.removeEventListener('afterprint', cleanUp);
  };
  window.addEventListener('afterprint', cleanUp);
  window.print();
  // Safari does not always send afterprint.
  window.setTimeout(cleanUp, 3000);
}

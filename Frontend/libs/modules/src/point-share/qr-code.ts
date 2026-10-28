import qrcodeFactory from 'qrcode-generator';

import { designTokens } from '@rescue-frontend/ui';

const { color, primitives } = designTokens;

qrcodeFactory.stringToBytes = (text: string) =>
  Array.from(new TextEncoder().encode(text));

const QR_QUIET_ZONE = 4;
const QR_ERROR_CORRECTION_LEVEL = 'M';

function createQrMatrix(value: string) {
  const qr = qrcodeFactory(0, QR_ERROR_CORRECTION_LEVEL);
  qr.addData(value);

  try {
    qr.make();
  } catch {
    throw new Error('分享網址過長，無法產生目前支援尺寸的 QR Code。');
  }

  const moduleCount = qr.getModuleCount();

  return Array.from({ length: moduleCount }, (_, y) =>
    Array.from({ length: moduleCount }, (_, x) => qr.isDark(y, x)),
  );
}

export function createQrSvg(value: string) {
  const modules = createQrMatrix(value);
  const size = modules.length + QR_QUIET_ZONE * 2;
  const path = modules
    .flatMap((row, y) =>
      row.map((dark, x) =>
        dark ? `M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z` : '',
      ),
    )
    .filter(Boolean)
    .join('');

  // A QR code needs maximum contrast to scan under a head-torch at night, so the modules use the
  // palette's pure white and near-black rather than any softer surface/text pairing.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="${color.bg.neutral.default}" d="M0 0h${size}v${size}H0z"/><path fill="${primitives.color.neutral.black}" d="${path}"/></svg>`;
}

export function createQrDataUrl(value: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createQrSvg(value))}`;
}

export function downloadQrSvg(value: string, filename: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([createQrSvg(value)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * PNG rather than SVG where the code is passed on through LINE, which takes an SVG as a file
 * rather than a picture. Drawn from the same matrix, quiet zone included — some cameras miss a
 * code without it. A blob URL, since Chrome often ignores the file name of a `data:` link.
 */
export function downloadQrPng(value: string, filename: string, cellSize = 16) {
  if (typeof document === 'undefined') {
    return;
  }

  const modules = createQrMatrix(value);
  const size = (modules.length + QR_QUIET_ZONE * 2) * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.fillStyle = color.bg.neutral.default;
  context.fillRect(0, 0, size, size);
  context.fillStyle = primitives.color.neutral.black;
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) {
        context.fillRect(
          (x + QR_QUIET_ZONE) * cellSize,
          (y + QR_QUIET_ZONE) * cellSize,
          cellSize,
          cellSize,
        );
      }
    }),
  );

  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

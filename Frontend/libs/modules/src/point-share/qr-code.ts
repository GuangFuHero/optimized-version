import qrcodeFactory from 'qrcode-generator';

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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#FFFFFF" d="M0 0h${size}v${size}H0z"/><path fill="#111827" d="${path}"/></svg>`;
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

'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HideImageOutlinedIcon from '@mui/icons-material/HideImageOutlined';
import {
  Box,
  Button,
  ButtonBase,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { PHOTO_LOAD_TIMEOUT_MS } from './photo-links';

const { color, radius } = designTokens;

type LoadState = 'loading' | 'ok' | 'fail';

interface PhotoThumbProps {
  url: string;
  /** From 0, for its alternative text. */
  index: number;
  /** Opens the image itself in a new tab — the drawer's way to look closer. */
  linksOut?: boolean;
  /** Asks to take it off a form; the confirmation is drawn over the thumbnail. */
  onRemove?: () => void;
  confirming?: boolean;
  onConfirmRemove?: () => void;
  onCancelRemove?: () => void;
}

/**
 * One scene photo (prototype `TKPhotoThumb`, `wg-photos.jsx`): a fixed 3:2 box, so a slow image
 * does not shift what is below it (TM-IMG-139), loading and failing on its own (TM-IMG-138). One
 * that will not load becomes a card saying so, with the link still there to try (TM-IMG-136): an
 * error, an image the host answered with an HTML page (no error, but no width), or none at all
 * in time.
 */
export function PhotoThumb({
  url,
  index,
  linksOut = false,
  onRemove,
  confirming = false,
  onConfirmRemove,
  onCancelRemove,
}: PhotoThumbProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const alt = `現場照片 ${index + 1}`;

  const settle = useCallback(() => {
    const image = imageRef.current;

    if (image) {
      setState(image.naturalWidth > 0 ? 'ok' : 'fail');
    }
  }, []);

  // Read again when the link changes; and an image already in the cache may have loaded before
  // this ran, when onLoad will not fire again.
  useEffect(() => {
    setState('loading');

    if (imageRef.current?.complete) {
      settle();
    }
  }, [settle, url]);

  useEffect(() => {
    if (state !== 'loading') {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!(imageRef.current && imageRef.current.naturalWidth > 0)) {
        setState('fail');
      }
    }, PHOTO_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [state, url]);

  const image = (
    <Box
      component="img"
      ref={imageRef}
      src={url}
      alt={alt}
      // Not lazy, unlike the prototype: a lazy image below the fold has not started when the
      // timeout above judges it, and would read 「載不出圖片」 until scrolled to. Ten at most, and
      // an image never holds up the rest of the drawer either way.
      decoding="async"
      // The host is someone else's: it need not learn even which site the image is shown on.
      referrerPolicy="no-referrer"
      onLoad={settle}
      onError={() => setState('fail')}
      sx={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        visibility: state === 'fail' ? 'hidden' : 'visible',
      }}
    />
  );

  return (
    <Box
      sx={{
        position: 'relative',
        aspectRatio: '3 / 2',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.subtle,
        overflow: 'hidden',
      }}
    >
      {linksOut && state === 'ok' ? (
        <Box
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${alt}（另開分頁看原圖）`}
          sx={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: 'zoom-in',
          }}
        >
          {image}
        </Box>
      ) : (
        image
      )}

      {state === 'fail' ? (
        // Not a broken-image icon and not a blank: a plain mark, a sentence, and the link.
        <Stack
          sx={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            p: 1.25,
            textAlign: 'center',
          }}
        >
          <HideImageOutlinedIcon
            sx={{ fontSize: 20, color: color.fg.neutral.muted }}
          />
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[12],
              lineHeight: 1.4,
            }}
          >
            這個網址載不出圖片
          </Typography>
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: color.brand.secondary.default,
              fontSize: displayTextSize[11],
              lineHeight: 1.3,
              wordBreak: 'break-all',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {url}
          </Link>
        </Stack>
      ) : null}

      {confirming ? (
        // Its second line is not optional (TM-IMG-142): taking the link off takes nothing back.
        <Stack
          role="alertdialog"
          aria-label={`從任務單上移除${alt}？`}
          sx={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            p: 1.25,
            textAlign: 'center',
            bgcolor: color.bg.neutral.default,
          }}
        >
          <Typography
            sx={{
              color: color.fg.neutral.default,
              fontSize: displayTextSize[13],
              fontWeight: 700,
            }}
          >
            從任務單上移除？
          </Typography>
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[11],
              lineHeight: 1.4,
            }}
          >
            圖片本身仍在原網站上，平台刪不掉。
          </Typography>
          <Stack direction="row" sx={{ gap: 0.75 }}>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={onCancelRemove}
            >
              取消
            </Button>
            <Button
              size="small"
              variant="contained"
              disableElevation
              onClick={onConfirmRemove}
              sx={{
                bgcolor: color.bg.danger.default,
                color: color.fg.onDanger,
                '&:hover': { bgcolor: color.bg.danger.hover },
              }}
            >
              移除
            </Button>
          </Stack>
        </Stack>
      ) : null}

      {onRemove && !confirming ? (
        <ButtonBase
          aria-label={`移除${alt}`}
          onClick={onRemove}
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 28,
            height: 28,
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.neutral.default,
            border: `1px solid ${color.border.default}`,
            color: color.fg.neutral.muted,
          }}
        >
          <CloseRoundedIcon sx={{ fontSize: 14 }} />
        </ButtonBase>
      ) : null}
    </Box>
  );
}

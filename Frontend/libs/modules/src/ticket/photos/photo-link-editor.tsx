'use client';

import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { Badge, designTokens, displayTextSize } from '@rescue-frontend/ui';

import {
  checkPhotoLink,
  PHOTO_LINK_MAX,
  PHOTO_UPLOAD_HOST,
} from './photo-links';
import { PhotoThumb } from './photo-thumb';

const { color, radius } = designTokens;

const STEP_MARKS = ['①', '②', '③'];

interface PhotoLinkEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  hint: string;
}

/**
 * Scene photos on a form (prototype `TKPhotoLinkEditor`, `wg-photos.jsx`): a link is
 * pasted, never a file — there is no file picker here, and there will not be (TM-IMG-102).
 * Under it, always, the one warning there is no technical answer to (TM-IMG-141), and the way to
 * get a link for a photo, opening in a new tab so the form being filled stays (TM-IMG-132).
 */
export function PhotoLinkEditor({
  value,
  onChange,
  label,
  hint,
}: PhotoLinkEditorProps) {
  const [draft, setDraft] = useState('');
  // A refusal or a word about the link just added — said once, cleared by the next keystroke.
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const full = value.length >= PHOTO_LINK_MAX;

  const add = () => {
    const checked = checkPhotoLink(draft, value);

    if (!checked.ok) {
      setMessage(checked.error);
      return;
    }

    onChange([...value, checked.link]);
    setDraft('');
    setMessage(checked.notice);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, at) => at !== index));
    setPendingRemove(null);
    setMessage(null);
  };

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      >
        <Typography
          sx={{
            color: color.fg.neutral.default,
            fontSize: displayTextSize[14],
            lineHeight: 1.2,
            fontWeight: 700,
          }}
        >
          {label}
        </Typography>
        <Badge>{`${value.length}／${PHOTO_LINK_MAX}`}</Badge>
        <Typography
          sx={{
            color: color.fg.neutral.muted,
            fontSize: displayTextSize[12],
            lineHeight: 1.5,
          }}
        >
          {hint}
        </Typography>
      </Stack>

      {/* Always there, not a tooltip or a placeholder: the riskiest part of photos, and all that
          can be done about it is to say this before anything is pasted (TM-IMG-141). */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'flex-start',
          gap: 1,
          px: 1.5,
          py: 1.25,
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          border: `1px solid ${color.border.default}`,
        }}
      >
        <PrivacyTipOutlinedIcon
          sx={{
            fontSize: 17,
            mt: '1px',
            flexShrink: 0,
            color: color.fg.neutral.muted,
          }}
        />
        <Typography
          sx={{
            color: color.fg.neutral.muted,
            fontSize: displayTextSize[12],
            lineHeight: 1.6,
            textWrap: 'pretty',
          }}
        >
          圖片存在外部網站，
          <Box component="strong" sx={{ color: color.fg.neutral.default }}>
            拿到網址的人都看得到
          </Box>
          。請避免拍到傷者面孔、門牌與證件。
        </Typography>
      </Stack>

      {value.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 1.25,
          }}
        >
          {value.map((url, index) => (
            <PhotoThumb
              // Links may repeat (TM-IMG-125); the place tells them apart.
              key={`${url}:${index}`}
              url={url}
              index={index}
              onRemove={() => setPendingRemove(index)}
              confirming={pendingRemove === index}
              onConfirmRemove={() => removeAt(index)}
              onCancelRemove={() => setPendingRemove(null)}
            />
          ))}
        </Box>
      ) : null}

      <Stack direction="row" sx={{ gap: 1, alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          size="small"
          value={draft}
          disabled={full}
          error={Boolean(message) && !full && draft.trim() !== ''}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="貼上圖片網址，https:// 開頭"
          slotProps={{
            htmlInput: { 'aria-label': '圖片網址', inputMode: 'url' },
          }}
        />
        <Button
          variant="outlined"
          onClick={add}
          disabled={!draft.trim() || full}
          sx={{ flexShrink: 0, height: 40 }}
        >
          加入
        </Button>
      </Stack>

      {message ? (
        <Alert severity="warning">
          <AlertTitle>這條網址</AlertTitle>
          {message}
        </Alert>
      ) : null}
      {full ? (
        <Alert severity="warning">
          <AlertTitle>{`已達 ${PHOTO_LINK_MAX} 條上限`}</AlertTitle>
          要再貼請先移除一條。
        </Alert>
      ) : null}

      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}
      >
        <Link
          href={PHOTO_UPLOAD_HOST.url}
          target="_blank"
          rel="noopener noreferrer"
          underline="none"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            height: 34,
            px: 1.5,
            borderRadius: `${radius.md}px`,
            border: `1px dashed ${color.border.default}`,
            color: color.brand.secondary.default,
            fontSize: displayTextSize[13],
            fontWeight: 500,
          }}
        >
          <OpenInNewRoundedIcon sx={{ fontSize: 15 }} />
          {`還沒有圖片網址？到 ${PHOTO_UPLOAD_HOST.name} 上傳`}
        </Link>
        <Typography
          sx={{
            color: color.fg.neutral.muted,
            fontSize: displayTextSize[12],
            lineHeight: 1.6,
          }}
        >
          {PHOTO_UPLOAD_HOST.steps
            .map((step, index) => `${STEP_MARKS[index]} ${step}`)
            .join('　')}
        </Typography>
      </Stack>
    </Stack>
  );
}

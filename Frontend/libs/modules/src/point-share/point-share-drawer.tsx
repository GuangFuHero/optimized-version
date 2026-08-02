'use client';

import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import FacebookRoundedIcon from '@mui/icons-material/FacebookRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { createQrDataUrl, downloadQrSvg } from './qr-code';
import {
  copyPointShareUrl,
  createPointShareLinks,
  openPointShareLink,
} from './share-links';
import type { PointShareChannel, PointShareTarget } from './types';

interface PointShareDrawerProps {
  open: boolean;
  target: PointShareTarget | null;
  onClose: () => void;
}

const channelIcons: Record<PointShareChannel, ReactElement> = {
  line: <ChatRoundedIcon />,
  facebook: <FacebookRoundedIcon />,
  threads: <AlternateEmailRoundedIcon />,
};

export function PointShareDrawer({
  open,
  target,
  onClose,
}: PointShareDrawerProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const links = useMemo(
    () => (target ? createPointShareLinks(target) : []),
    [target],
  );
  const qrDataUrl = useMemo(
    () => (target ? createQrDataUrl(target.url) : ''),
    [target],
  );

  const handleCopy = async () => {
    if (!target) {
      return;
    }

    await copyPointShareUrl(target.url);
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1400);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { mobile: '100vw', tablet: 400 },
          maxWidth: '100vw',
          bgcolor: '#F6F8FA',
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
        }}
      >
        <Box
          sx={{
            px: 3,
            py: 2.5,
            borderBottom: '1px solid #D9E1EA',
            bgcolor: '#FFFFFF',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{ color: '#17212B', fontSize: 14, fontWeight: 800 }}
              >
                {target?.title ?? '分享資訊'}
              </Typography>
            </Box>
            <IconButton aria-label="關閉分享" onClick={onClose} size="small">
              <CloseRoundedIcon />
            </IconButton>
          </Box>
        </Box>

        {target ? (
          <Stack spacing={2.5} sx={{ minHeight: 0, overflowY: 'auto', p: 3 }}>
            <Stack spacing={1}>
              <Typography
                sx={{ color: '#17212B', fontSize: 14, fontWeight: 800 }}
              >
                分享方式
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 1,
                }}
              >
                {links.map((link) => (
                  <Button
                    key={link.channel}
                    variant="outlined"
                    startIcon={channelIcons[link.channel]}
                    onClick={() => openPointShareLink(link.href)}
                    sx={{
                      minWidth: 0,
                      px: 1,
                      color: '#245C8C',
                      borderColor: '#BFD0DD',
                      bgcolor: '#FFFFFF',
                      textTransform: 'none',
                      fontWeight: 800,
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
              </Box>
            </Stack>

            <Stack spacing={1}>
              <Typography
                sx={{ color: '#17212B', fontSize: 14, fontWeight: 800 }}
              >
                連結
              </Typography>
              <TextField
                value={target.url}
                size="small"
                fullWidth
                slotProps={{ input: { readOnly: true } }}
              />
              <Button
                variant="contained"
                startIcon={<ContentCopyRoundedIcon />}
                onClick={handleCopy}
                sx={{
                  alignSelf: 'flex-start',
                  textTransform: 'none',
                  fontWeight: 800,
                }}
              >
                {copyState === 'copied' ? '已複製' : '複製連結'}
              </Button>
            </Stack>

            <Stack spacing={1.5}>
              <Typography
                sx={{ color: '#17212B', fontSize: 14, fontWeight: 800 }}
              >
                QR Code
              </Typography>
              <Box
                sx={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  maxWidth: 260,
                  alignSelf: 'center',
                  bgcolor: '#FFFFFF',
                  border: '1px solid #D7E0EA',
                  p: 2,
                }}
              >
                <Box
                  component="img"
                  alt={`${target.title} QR Code`}
                  src={qrDataUrl}
                  sx={{ display: 'block', width: '100%', height: '100%' }}
                />
              </Box>
              <Button
                variant="outlined"
                startIcon={<FileDownloadRoundedIcon />}
                onClick={() => downloadQrSvg(target.url, `${target.title}.svg`)}
                sx={{
                  alignSelf: 'center',
                  textTransform: 'none',
                  fontWeight: 800,
                }}
              >
                下載 QR Code
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Box>
    </Drawer>
  );
}

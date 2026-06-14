'use client';

import { Box, Typography } from '@mui/material';

interface RescueMapStatusMessageProps {
  message: string;
}

export function RescueMapStatusMessage({
  message,
}: RescueMapStatusMessageProps) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        maxWidth: '70dvw',
        display: 'grid',
        placeItems: 'center',
        mx: 'auto',
      }}
    >
      <Box
        role="status"
        aria-live="polite"
        sx={{
          width: '100%',
          maxWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: '100%',
            position: 'relative',
            pt: 'calc((100% / 6) + 6px)',
            overflow: 'hidden',
            '& .rescue-blob-runner': {
              position: 'absolute',
              top: 0,
              width: 'calc(100% / 6)',
              aspectRatio: '1 / 1',
              display: 'grid',
              placeItems: 'center',
              transform: 'translate3d(-100%, 0, 0)',
              willChange: 'transform',
              animation: 'rescueBlobRun 1.6s ease-in-out infinite',
            },
            '& .rescue-blob-svg': {
              width: '100%',
              height: '100%',
              willChange: 'transform',
              animation: 'rescueBlobBounce 0.7s ease-in-out infinite',
              transformOrigin: 'center bottom',
            },
            '& .rescue-blob-eye': {
              willChange: 'transform',
              animation: 'rescueBlobBlink 3.2s ease-in-out infinite',
              transformOrigin: 'center',
            },
            '@keyframes rescueBlobRun': {
              '0%': {
                transform: 'translate3d(-100%, 0, 0)',
              },
              '100%': {
                transform: 'translate3d(600%, 0, 0)',
              },
            },
            '@keyframes rescueBlobBounce': {
              '0%, 100%': {
                transform: 'translate3d(0, 0, 0) rotate(-2deg)',
              },
              '50%': {
                transform: 'translate3d(0, -4px, 0) rotate(2deg)',
              },
            },
            '@keyframes rescueBlobBlink': {
              '0%, 45%, 55%, 100%': {
                transform: 'scaleY(1)',
              },
              '50%': {
                transform: 'scaleY(0.1)',
              },
            },
            '@keyframes rescueLoadBar': {
              '0%': {
                transform: 'translate3d(-132%, 0, 0)',
              },
              '100%': {
                transform: 'translate3d(312%, 0, 0)',
              },
            },
          }}
        >
          <Box className="rescue-blob-runner">
            <svg
              className="rescue-blob-svg"
              viewBox="0 0 198 198"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M82.9331 33.7408C70.7473 41.7942 56.9624 61.6938 44.7767 77.8513C32.5911 94.0088 15.0982 104.307 8.51639 121.818C-5.07977 157.99 11.7196 179.071 63.0149 179.071C81.3867 179.81 111.379 182.912 129.571 179.246C182.66 168.545 201.309 136.013 193.172 91.0789C191.987 84.5319 190.233 68.3125 186.735 59.6836C176.185 33.6602 161.724 19.6442 137.135 17.2541C116.341 15.233 95.1189 25.6875 82.9331 33.7408Z"
                fill="#F37C0E"
              />
              <path
                className="rescue-blob-eye"
                d="M153.479 83.7147C154.693 82.5793 156.409 81.8355 158.083 82.0312C158.501 82.0704 158.961 82.1878 159.296 82.4619C160.008 83.01 159.924 83.9887 159.966 84.85C160.301 90.84 158.125 101.254 155.739 102.468C153.354 103.681 151.429 102.624 150.341 101.254C148.207 98.5526 148.793 92.7192 150.885 87.7863C151.513 86.2986 152.308 84.85 153.521 83.7147H153.479Z"
                fill="#3A3937"
              />
              <path
                className="rescue-blob-eye"
                d="M121.479 83.7147C122.693 82.5793 124.409 81.8355 126.083 82.0312C126.501 82.0704 126.961 82.1878 127.296 82.4619C128.008 83.01 127.924 83.9887 127.966 84.85C128.301 90.84 126.125 101.254 123.739 102.468C121.354 103.681 119.429 102.624 118.341 101.254C116.207 98.5526 116.793 92.7192 118.885 87.7863C119.513 86.2986 120.308 84.85 121.521 83.7147H121.479Z"
                fill="#3A3937"
              />
            </svg>
          </Box>

          <Box
            sx={{
              width: '100%',
              height: 9,
              borderRadius: 999,
              backgroundColor: '#D3D8DD',
              overflow: 'hidden',
              position: 'relative',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '32%',
                borderRadius: 'inherit',
                background:
                  'linear-gradient(90deg, #D9853E 0%, #D9853E 55%, #F3A85F 100%)',
                willChange: 'transform',
                transform: 'translate3d(-132%, 0, 0)',
                animation: 'rescueLoadBar 1.6s ease-in-out infinite',
              },
            }}
          />
        </Box>

        <Typography color="text.secondary">{message}</Typography>
      </Box>
    </Box>
  );
}

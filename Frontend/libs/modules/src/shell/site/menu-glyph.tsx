import { Box, Stack } from '@mui/material';

interface MenuGlyphProps {
  color: string;
  width?: number;
  middleWidth?: number;
}

export function MenuGlyph({
  color,
  width = 18,
  middleWidth = 13,
}: MenuGlyphProps) {
  return (
    <Stack spacing={0.45} sx={{ width }}>
      <Box sx={{ height: 2, width, borderRadius: '999px', bgcolor: color }} />
      <Box
        sx={{
          height: 2,
          width: middleWidth,
          borderRadius: '999px',
          bgcolor: color,
        }}
      />
      <Box sx={{ height: 2, width, borderRadius: '999px', bgcolor: color }} />
    </Stack>
  );
}

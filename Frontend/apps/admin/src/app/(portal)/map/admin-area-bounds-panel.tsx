'use client';

import { X } from 'lucide-react';

import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';

import type { BoundaryChange } from '@rescue-frontend/modules';

/**
 * Changing the boundary of an area (prototype `EditHUD`, MAP-ZD-191 to 199): the corners are on the
 * map, and here is what the change does. The four numbers are apart because what comes in and what
 * goes out are not alike (MAP-ZD-195).
 */
export function AdminAreaBoundsPanel({
  name,
  isTeamZone,
  teams,
  cornerCount,
  change,
  areaKm2,
  crosses,
  changed,
  onReset,
  onCancel,
  onSave,
}: {
  name: string | null;
  isTeamZone: boolean;
  teams: readonly string[];
  cornerCount: number;
  change: BoundaryChange;
  areaKm2: number;
  crosses: boolean;
  /** Whether the corners are anywhere but where they began. */
  changed: boolean;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const teamNames = teams.join('、');
  const stats: [string, string][] = [
    ['轉角', String(cornerCount)],
    ['改完區內', `${change.inside} 張`],
    ['新納入', `${change.added} 張`],
    ['移出', `${change.removed} 張`],
    ['面積 km²', areaKm2.toFixed(2)],
  ];

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2.25,
          py: 1.75,
          borderBottom: '1px solid #DCC1B1',
        }}
      >
        <Typography noWrap sx={{ flex: 1, fontSize: 16, fontWeight: 800 }}>
          調整「{name ?? '這個區域'}」的範圍
        </Typography>
        <ButtonBase
          onClick={onCancel}
          aria-label="關閉（Esc）"
          sx={{ width: 32, height: 32, mr: -1, borderRadius: 2 }}
        >
          <Box component={X} sx={{ width: 18, height: 18 }} />
        </ButtonBase>
      </Stack>
      <Stack
        spacing={2}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.25 }}
      >
        <Typography sx={{ fontSize: 13, lineHeight: 1.7 }}>
          拖曳轉角移動，點轉角刪除，點邊上的 ＋ 加一個轉角。
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1.5,
            p: 1.75,
            borderRadius: 3,
            border: '1px solid #DCC1B1',
            bgcolor: '#fff',
          }}
        >
          {stats.map(([label, value]) => (
            <Box key={label}>
              <Typography
                sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}
              >
                {label}
              </Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
        {crosses ? (
          <Typography role="alert" sx={{ fontSize: 13, color: '#B3261E' }}>
            邊線交叉了，這樣的範圍不能儲存。請把轉角拖回去，或按「回到原本範圍」。
          </Typography>
        ) : null}
        {change.removed > 0 ? (
          <Typography sx={{ fontSize: 13, lineHeight: 1.7, color: '#9A5B00' }}>
            {isTeamZone
              ? `${change.removed} 張任務單會掉到範圍外，並立刻從負責單位${
                  teamNames ? `（${teamNames}）` : ''
                }的清單消失。`
              : `${change.removed} 張任務單會掉到範圍外。`}
          </Typography>
        ) : null}
        {change.added > 0 && isTeamZone ? (
          <Typography sx={{ fontSize: 13, lineHeight: 1.7, color: '#564337' }}>
            {change.added}{' '}
            張任務單會進到範圍內，負責單位的清單會立刻多出這幾張。
          </Typography>
        ) : null}
        <Typography sx={{ fontSize: 12, color: '#564337' }}>
          數量只算目前地圖畫面內已載入的任務單。儲存後 5 秒內可以復原。
        </Typography>
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2.25,
          py: 1.5,
          borderTop: '1px solid #DCC1B1',
        }}
      >
        <Button onClick={onReset} disabled={!changed}>
          回到原本範圍
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={!changed || crosses || cornerCount < 3}
          onClick={onSave}
        >
          儲存範圍
        </Button>
      </Stack>
    </Stack>
  );
}

'use client';

import { MapPin } from 'lucide-react';

import { Stack, Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useUpdateProjectSettings } from '@rescue-frontend/data-access/admin';
import { Button, designTokens } from '@rescue-frontend/ui';

import {
  MapViewPicker,
  type MapViewPickerRequest,
  type MapViewValue,
} from '../../map/components/map-view-picker';
import {
  initialMapView,
  mapViewBody,
  mapViewFromMap,
  sameMapView,
  type MapView,
} from './map-view';
import { NeedsNameHint, SettingsRow } from './settings-layout';

const { color, typography } = designTokens;

/**
 * Where every map opens for this disaster (MAP-VIEW-101 to 103, Carol's option B): the view is set by
 * dragging and zooming a small map, never by typing a latitude, and clearing it leaves all of Taiwan.
 * Saves on its own, like 起始時間 (prototype `st-app.jsx` `MapViewRow`).
 */
export function MapViewRow({
  saved,
  canEdit,
  needsName,
}: {
  saved: MapView | null;
  canEdit: boolean;
  /** No settings row yet: the first save must carry the name, so this waits for it. */
  needsName: boolean;
}) {
  const [initial] = useState(() => initialMapView(saved));
  const [current, setCurrent] = useState<MapView | null>(null);
  const [request, setRequest] = useState<MapViewPickerRequest | null>(null);
  const update = useUpdateProjectSettings();
  const same = sameMapView(saved, current);

  const handleMove = useCallback(
    (view: MapViewValue) => setCurrent(mapViewFromMap(view)),
    [],
  );

  const save = () => {
    if (!current || same) return;
    update.mutate(
      { body: mapViewBody(current) },
      { onSuccess: () => toast.success('已設成地圖預設位置') },
    );
  };

  const clear = () => {
    update.mutate(
      { body: mapViewBody(null) },
      {
        onSuccess: () =>
          toast.success('已清除地圖預設位置，地圖打開會顯示全台'),
      },
    );
  };

  return (
    <SettingsRow
      label="地圖預設位置"
      help="前台與後台的地圖一打開，會停在這個畫面。沒設定時顯示全台。"
    >
      <Stack sx={{ gap: '10px' }}>
        <Typography
          sx={{
            ...typography.body[400],
            color: saved ? color.fg.neutral.default : color.fg.warning,
          }}
        >
          {saved
            ? '已設定。大家打開地圖會停在下面這個畫面。'
            : '還沒設定 —— 大家打開地圖會看到整個台灣，要自己找到災區。'}
        </Typography>
        <MapViewPicker
          initial={initial}
          editable={canEdit}
          onMove={handleMove}
          request={request}
        />
        {canEdit ? (
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
          >
            <Typography
              sx={{
                ...typography.body[300],
                color: color.fg.neutral.muted,
                mr: 'auto',
              }}
            >
              拖曳、縮放地圖，讓災區剛好填滿畫面，再按「設成預設位置」。
            </Typography>
            {saved && !same ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRequest({ view: saved, id: Date.now() })}
              >
                回到已設定的位置
              </Button>
            ) : null}
            {saved ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={update.isPending}
                onClick={clear}
              >
                清除
              </Button>
            ) : null}
            <Button
              size="sm"
              startIcon={<MapPin size={14} />}
              disabled={!current || same || needsName || update.isPending}
              onClick={save}
            >
              設成預設位置
            </Button>
          </Stack>
        ) : null}
        {canEdit && needsName ? <NeedsNameHint /> : null}
      </Stack>
    </SettingsRow>
  );
}

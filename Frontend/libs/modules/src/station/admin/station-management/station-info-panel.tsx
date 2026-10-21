'use client';

import { Box, Typography } from '@mui/material';
import type { AdminStationQuery } from '@rescue-frontend/data-access/admin';
import { Badge, designTokens, MetadataTable } from '@rescue-frontend/ui';
import { EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';

import { getStationTypeLabel } from '../../type-options';
import {
  formatAbsoluteTime,
  FreshnessCell,
  StatusBadge,
} from './station-cells';

const { color, radius, typography } = designTokens;

type Station = NonNullable<AdminStationQuery['station']>;

export function formatStationAddress(station: Station): string {
  const l = station.secondaryLocation;
  if (!l) return '';
  return [l.county, l.city, l.lane, l.alley, l.no, l.floor, l.room]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('');
}

function coordinates(station: Station): string {
  const point = station.geometry as { coordinates?: number[] } | null;
  const [lng, lat] = point?.coordinates ?? [];
  return lat == null || lng == null ? '—' : `${lat}, ${lng}`;
}

export function StationInfoPanel({
  station,
  canViewPii,
  now,
}: {
  station: Station;
  canViewPii: boolean;
  now: Date;
}) {
  const privateLabel = (label: string) => (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      {label}
      <Badge tone="warning" size="sm" icon={<EyeOff size={11} />}>
        不公開
      </Badge>
    </Box>
  );
  const masked = canViewPii ? undefined : '無檢視個資權限，顯示遮罩值';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <MetadataTable
        layout="split"
        labelWidth={120}
        rows={[
          { label: '類型', value: getStationTypeLabel(station.type) },
          { label: '指派團隊', value: station.assignedTeam?.name ?? '未指派' },
          { label: '地址', value: formatStationAddress(station) || '—' },
          { label: '座標', value: <Mono>{coordinates(station)}</Mono> },
          {
            label: '營運狀態',
            value: <StatusBadge status={station.operationalStatus} />,
            note: station.statusChangedAt
              ? `狀態更新於 ${formatAbsoluteTime(station.statusChangedAt)}`
              : undefined,
          },
          { label: '物資狀況', value: station.supplyStatus || '—' },
          { label: '開放時間', value: station.opHour || '—' },
          {
            label: privateLabel('聯絡人'),
            value: station.contactName || '—',
            note: masked,
          },
          {
            label: privateLabel('聯絡電話'),
            value: station.contactPhone || '—',
          },
          {
            label: privateLabel('聯絡 Email'),
            value: station.contactEmail || '—',
          },
          { label: '說明', value: station.description || '—' },
          { label: privateLabel('內部備註'), value: station.comment || '—' },
          { label: '建立時間', value: formatAbsoluteTime(station.createdAt) },
          {
            label: '最後更新',
            value: <FreshnessCell updatedAt={station.updatedAt} now={now} />,
          },
        ]}
      />

      <Section title="站點照片">
        {station.photos.length === 0 ? (
          <Muted>（尚無照片）</Muted>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {station.photos.map((photo) => (
              <Box
                key={photo.uuid}
                component="a"
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                sx={{ display: 'block', lineHeight: 0 }}
              >
                <Box
                  component="img"
                  src={photo.url}
                  alt="站點照片"
                  sx={{
                    width: 96,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: `${radius.sm}px`,
                    border: `1px solid ${color.border.default}`,
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
      </Section>

      <Section title="站點資源">
        {station.properties.length === 0 ? (
          <Muted>（尚無資源資料）</Muted>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: '18px' }}>
            {station.properties.map((property) => (
              <Box component="li" key={property.uuid} sx={typography.body[300]}>
                {property.propertyName}：{property.quantity ?? '—'}
                {property.comment ? (
                  <Box component="span" sx={{ color: color.fg.neutral.muted }}>
                    {' '}
                    · {property.comment}
                  </Box>
                ) : null}
              </Box>
            ))}
          </Box>
        )}
      </Section>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography sx={{ ...typography.label[400], mb: '8px' }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted }}>
      {children}
    </Typography>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={typography.data[300]}>
      {children}
    </Box>
  );
}

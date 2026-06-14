'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Divider,
  Drawer,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSession } from 'next-auth/react';
import { useMutation } from 'urql';

import {
  CreateStationDocument,
  StationFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';

import {
  getStationTypeLabel,
  STATION_TYPE_OPTIONS,
  type StationTypeValue,
} from '../../type-options';
import type { RescueMapMarkerItem } from '../../../map/types';
import { AdminDetailModalFrame } from '../../../admin/shared/detail-modal-frame';
import type { StationListRow } from '../station-list/types';

interface StationCreateFormState {
  type: StationTypeValue;
  description: string;
  longitude: string;
  latitude: string;
  address: string;
  locationType: 'address' | 'pole';
  county: string;
  city: string;
  lane: string;
  alley: string;
  no: string;
  floor: string;
  room: string;
  poleId: string;
  poleType: string;
  poleNote: string;
  availableTime: string;
  isTemporary: boolean;
  photoUrls: string[];
}

interface ReverseGeocodePayload {
  address: string;
  county: string;
  city: string;
  lane: string;
  alley: string;
  no: string;
  floor: string;
  room: string;
}

interface StationCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (row: StationListRow) => void;
  onCreatedMarker?: (marker: RescueMapMarkerItem) => void;
  initialPosition?: [number, number] | null;
  onLocationChange?: (position: [number, number]) => void;
}

function createInitialState(): StationCreateFormState {
  return {
    type: 'water',
    description: '',
    longitude: '',
    latitude: '',
    address: '',
    locationType: 'address',
    county: '',
    city: '',
    lane: '',
    alley: '',
    no: '',
    floor: '',
    room: '',
    poleId: '',
    poleType: '',
    poleNote: '',
    availableTime: '',
    isTemporary: false,
    photoUrls: [''],
  };
}

function formatNow() {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

const stationCreatePalette = {
  surface: '#FFFFFF',
  sectionSurface: '#F6FAFF',
  border: '#D7E3F0',
  heading: '#0F3F75',
  bodyText: '#39516B',
  primary: '#179BC6',
  primaryHover: '#127EA6',
  primaryText: '#FFFFFF',
  secondaryText: '#245C8C',
  secondaryBorder: '#BFD0DD',
};

const MAX_STATION_PHOTO_URLS = 10;

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mapStationStatus(isTemporary: boolean): StationListRow['status'] {
  return isTemporary ? 'limited' : 'active';
}

function createStationRow(input: {
  uuid: string;
  type: string;
  address: string;
  description: string;
  isTemporary: boolean;
  updatedAt?: string | null;
}): StationListRow {
  return {
    id: input.uuid,
    code: input.uuid.slice(0, 8).toUpperCase(),
    name: input.description.slice(0, 18) || getStationTypeLabel(input.type),
    type: getStationTypeLabel(input.type),
    address: input.address || '未提供地址',
    status: mapStationStatus(input.isTemporary),
    currentOccupancy: 0,
    capacity: 0,
    suppliesLabel: '未提供',
    commander: '未提供',
    updatedAt: input.updatedAt
      ? new Intl.DateTimeFormat('zh-TW', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(input.updatedAt))
      : formatNow(),
  };
}

function buildStationMarker(input: {
  uuid: string;
  type?: string | null;
  description?: string | null;
  opHour?: string | null;
  level?: number | null;
  comment?: string | null;
  source?: string | null;
  visibility?: string | null;
  verificationStatus?: string | null;
  confidenceScore?: number | null;
  isDuplicate?: boolean;
  isTemporary?: boolean;
  isOfficial?: boolean;
  priorityScore?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  position: [number, number];
}): RescueMapMarkerItem {
  const normalizedType = input.type?.trim().toLowerCase();
  const stationTypeLabel = getStationTypeLabel(normalizedType);

  return {
    id: input.uuid,
    title: input.description?.trim() || stationTypeLabel,
    subtitle:
      input.description?.trim() || input.opHour?.trim() || stationTypeLabel,
    position: input.position,
    label: stationTypeLabel,
    variant:
      input.isTemporary || normalizedType === 'shelter'
        ? 'pinned-location'
        : 'resource-station',
    detailType: 'station',
    stationMeta: {
      type: input.type,
      description: input.description,
      opHour: input.opHour,
      level: input.level,
      comment: input.comment,
      source: input.source,
      visibility: input.visibility,
      verificationStatus: input.verificationStatus,
      confidenceScore: input.confidenceScore,
      isDuplicate: input.isDuplicate,
      isTemporary: input.isTemporary,
      isOfficial: input.isOfficial,
      priorityScore: input.priorityScore,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    },
  };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#151C22' }}>
          {title}
        </Typography>
        {description ? (
          <Typography
            sx={{
              mt: 0.5,
              fontSize: 12,
              color: stationCreatePalette.bodyText,
            }}
          >
            {description}
          </Typography>
        ) : null}
      </Box>
      {children}
    </Stack>
  );
}

export function StationCreateDrawer({
  open,
  onClose,
  onCreated,
  onCreatedMarker,
  initialPosition,
  onLocationChange,
}: StationCreateDrawerProps) {
  const [form, setForm] = useState<StationCreateFormState>(createInitialState);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [createStationResult, createStation] = useMutation(
    CreateStationDocument,
  );
  const { status: authStatus } = useSession();
  const reverseGeocodeRequestKeyRef = useRef<string | null>(null);

  const isSubmitting = createStationResult.fetching;
  const derivedUpdatedAt = useMemo(() => formatNow(), [open]);

  useEffect(() => {
    if (!open) {
      reverseGeocodeRequestKeyRef.current = null;
      setIsResolvingAddress(false);
      return;
    }

    if (!initialPosition) {
      return;
    }

    const requestKey = `${initialPosition[0].toFixed(6)},${initialPosition[1].toFixed(6)}`;

    if (reverseGeocodeRequestKeyRef.current === requestKey) {
      return;
    }

    reverseGeocodeRequestKeyRef.current = requestKey;
    const abortController = new AbortController();

    setIsResolvingAddress(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/google/reverse-geocode?lat=${initialPosition[0]}&lng=${initialPosition[1]}`,
          {
            cache: 'no-store',
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ReverseGeocodePayload;

        setForm((current) => ({
          ...current,
          address: current.address.trim() || payload.address,
          county: current.county.trim() || payload.county,
          city: current.city.trim() || payload.city,
          lane: current.lane.trim() || payload.lane,
          alley: current.alley.trim() || payload.alley,
          no: current.no.trim() || payload.no,
          floor: current.floor.trim() || payload.floor,
          room: current.room.trim() || payload.room,
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsResolvingAddress(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [initialPosition, open]);

  useEffect(() => {
    if (!open || !initialPosition) {
      return;
    }

    setForm((current) => ({
      ...current,
      latitude: initialPosition[0].toFixed(6),
      longitude: initialPosition[1].toFixed(6),
    }));
  }, [initialPosition, open]);

  const resetForm = () => {
    setForm(createInitialState());
    setSubmitError(null);
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    onClose();
  };

  const updateForm = <K extends keyof StationCreateFormState>(
    key: K,
    value: StationCreateFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleLocationBlur = () => {
    const parsedLatitude = Number(form.latitude);
    const parsedLongitude = Number(form.longitude);

    if (
      form.latitude.trim() &&
      form.longitude.trim() &&
      Number.isFinite(parsedLatitude) &&
      Number.isFinite(parsedLongitude)
    ) {
      onLocationChange?.([parsedLatitude, parsedLongitude]);
    }
  };

  const updatePhotoUrl = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      photoUrls: current.photoUrls.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  };

  const appendPhotoUrl = () => {
    setForm((current) => {
      if (current.photoUrls.length >= MAX_STATION_PHOTO_URLS) {
        return current;
      }

      return {
        ...current,
        photoUrls: [...current.photoUrls, ''],
      };
    });
  };

  const removePhotoUrl = (index: number) => {
    setForm((current) => {
      if (current.photoUrls.length === 1) {
        return {
          ...current,
          photoUrls: [''],
        };
      }

      return {
        ...current,
        photoUrls: current.photoUrls.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      };
    });
  };

  const handleSubmit = async () => {
    setSubmitError(null);

    if (authStatus !== 'authenticated') {
      setSubmitError('目前尚未登入，無法建立站點。請先登入後再試。');
      return;
    }

    if (
      !form.description.trim() ||
      !form.address.trim() ||
      !form.longitude.trim() ||
      !form.latitude.trim()
    ) {
      setSubmitError('請先填完所有必填欄位。');
      return;
    }

    const longitude = Number(form.longitude);
    const latitude = Number(form.latitude);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      setSubmitError('經緯度格式不正確。');
      return;
    }

    const stationResult = await createStation({
      input: {
        type: form.type,
        description: form.description.trim(),
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        opHour: form.availableTime.trim() || undefined,
        // TODO: 後端建立站點流程穩定後，再把地址/次要位置欄位一起送出。
        // comment: form.address.trim(),
        // source: 'user',
        // visibility: 'public',
        // secondaryLocation: {
        //   locationType: form.locationType,
        //   county: form.county.trim() || undefined,
        //   city: form.city.trim() || undefined,
        //   lane: form.lane.trim() || undefined,
        //   alley: form.alley.trim() || undefined,
        //   no: form.no.trim() || undefined,
        //   floor: form.floor.trim() || undefined,
        //   room: form.room.trim() || undefined,
        //   poleId: form.poleId.trim() || undefined,
        //   poleType: form.poleType.trim() || undefined,
        //   poleNote: form.poleNote.trim() || undefined,
        // },
      },
    });

    if (stationResult.error || !stationResult.data?.createStation) {
      const rawErrorMessage = stationResult.error?.message ?? '';
      const normalizedErrorMessage = rawErrorMessage.toLowerCase();

      if (
        normalizedErrorMessage.includes('401') ||
        normalizedErrorMessage.includes('could not validate credentials')
      ) {
        setSubmitError('登入狀態已失效或尚未登入，請重新登入後再建立站點。');
        return;
      }

      setSubmitError(rawErrorMessage || '新增站點失敗。');
      return;
    }

    const createdStation = useFragment(
      StationFieldsFragmentDoc,
      stationResult.data.createStation,
    );

    onCreated?.(
      createStationRow({
        uuid: createdStation.uuid,
        type: createdStation.type ?? form.type,
        address: form.address.trim(),
        description: createdStation.description ?? form.description,
        isTemporary: form.isTemporary,
        updatedAt: createdStation.updatedAt?.toString() ?? null,
      }),
    );

    onCreatedMarker?.(
      buildStationMarker({
        uuid: createdStation.uuid,
        type: createdStation.type,
        description: createdStation.description,
        opHour: createdStation.opHour,
        level: createdStation.level,
        comment: createdStation.comment,
        source: createdStation.source,
        visibility: createdStation.visibility,
        verificationStatus: createdStation.verificationStatus,
        confidenceScore: createdStation.confidenceScore,
        isDuplicate: createdStation.isDuplicate,
        isTemporary: createdStation.isTemporary,
        isOfficial: createdStation.isOfficial,
        priorityScore: createdStation.priorityScore,
        createdAt: createdStation.createdAt?.toString() ?? null,
        updatedAt: createdStation.updatedAt?.toString() ?? null,
        position: [latitude, longitude],
      }),
    );

    handleClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        '& .MuiDrawer-paper': {
          width: { mobile: '100vw', tablet: 460, desktop: 520 },
          maxWidth: '100vw',
          bgcolor: stationCreatePalette.surface,
          backgroundImage: 'none',
        },
      }}
    >
      <AdminDetailModalFrame
        containerSx={{
          width: '100%',
          height: '100%',
          bgcolor: stationCreatePalette.surface,
          borderLeft: `1px solid ${stationCreatePalette.border}`,
        }}
        header={
          <Stack
            spacing={1}
            sx={{
              px: 2.5,
              py: 2,
              bgcolor: stationCreatePalette.surface,
              borderBottom: `1px solid ${stationCreatePalette.border}`,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: stationCreatePalette.heading,
                  }}
                >
                  新增站點
                </Typography>
              </Box>
              <ButtonBase
                disableRipple
                aria-label="關閉新增站點"
                onClick={handleClose}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '999px',
                  color: stationCreatePalette.bodyText,
                }}
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </ButtonBase>
            </Box>
          </Stack>
        }
        footer={
          <Stack
            direction={{ mobile: 'column', tablet: 'row' }}
            spacing={1}
            sx={{
              p: 2,
              borderTop: `1px solid ${stationCreatePalette.border}`,
              bgcolor: stationCreatePalette.surface,
            }}
          >
            <Button
              variant="outlined"
              onClick={handleClose}
              disabled={isSubmitting}
              sx={{
                flex: 1,
                borderRadius: '999px',
                borderColor: stationCreatePalette.secondaryBorder,
                color: stationCreatePalette.secondaryText,
                bgcolor: stationCreatePalette.surface,
                '&:hover': {
                  borderColor: stationCreatePalette.primary,
                  bgcolor: stationCreatePalette.sectionSurface,
                },
              }}
            >
              取消
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={isSubmitting}
              sx={{
                flex: 1,
                borderRadius: '999px',
                bgcolor: stationCreatePalette.primary,
                color: stationCreatePalette.primaryText,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: stationCreatePalette.primaryHover,
                  boxShadow: 'none',
                },
              }}
            >
              {isSubmitting ? '建立中...' : '建立站點'}
            </Button>
          </Stack>
        }
      >
        <Stack spacing={2.5}>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}

          <Section title="站點資訊">
            <Stack spacing={1.5}>
              <TextField
                select
                required
                label="站點類型"
                value={form.type}
                onChange={(event) =>
                  updateForm('type', event.target.value as StationTypeValue)
                }
                fullWidth
                size="small"
              >
                {STATION_TYPE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                required
                label="描述"
                value={form.description}
                onChange={(event) =>
                  updateForm('description', event.target.value)
                }
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
              <TextField
                label="開放時段"
                value={form.availableTime}
                onChange={(event) =>
                  updateForm('availableTime', event.target.value)
                }
                fullWidth
                size="small"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.isTemporary}
                    onChange={(event) =>
                      updateForm('isTemporary', event.target.checked)
                    }
                  />
                }
                label="是否為臨時站點"
              />
            </Stack>
          </Section>

          <Divider />

          <Section title="位置與地址">
            <Stack spacing={1.5}>
              <Stack
                direction={{ mobile: 'column', tablet: 'row' }}
                spacing={1.5}
              >
                <TextField
                  required
                  label="經度"
                  value={form.longitude}
                  onChange={(event) =>
                    updateForm('longitude', event.target.value)
                  }
                  onBlur={handleLocationBlur}
                  fullWidth
                  size="small"
                />
                <TextField
                  required
                  label="緯度"
                  value={form.latitude}
                  onChange={(event) =>
                    updateForm('latitude', event.target.value)
                  }
                  onBlur={handleLocationBlur}
                  fullWidth
                  size="small"
                />
              </Stack>
              <TextField
                required
                label="地址"
                value={form.address}
                onChange={(event) => updateForm('address', event.target.value)}
                fullWidth
                size="small"
              />
              <Typography
                sx={{ fontSize: 12, color: stationCreatePalette.bodyText }}
              >
                {isResolvingAddress ? '正在根據目前座標解析地址...' : ''}
              </Typography>
              <TextField
                select
                required
                label="位置類型"
                value={form.locationType}
                onChange={(event) =>
                  updateForm(
                    'locationType',
                    event.target.value as 'address' | 'pole',
                  )
                }
                fullWidth
                size="small"
              >
                <MenuItem value="address">一般地址</MenuItem>
                <MenuItem value="pole">桿位</MenuItem>
              </TextField>
              <Stack
                direction={{ mobile: 'column', tablet: 'row' }}
                spacing={1.5}
              >
                <TextField
                  label="縣市"
                  value={form.county}
                  onChange={(event) => updateForm('county', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="鄉鎮市區"
                  value={form.city}
                  onChange={(event) => updateForm('city', event.target.value)}
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack
                direction={{ mobile: 'column', tablet: 'row' }}
                spacing={1.5}
              >
                <TextField
                  label="路名"
                  value={form.lane}
                  onChange={(event) => updateForm('lane', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="巷弄"
                  value={form.alley}
                  onChange={(event) => updateForm('alley', event.target.value)}
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack
                direction={{ mobile: 'column', tablet: 'row' }}
                spacing={1.5}
              >
                <TextField
                  label="門牌"
                  value={form.no}
                  onChange={(event) => updateForm('no', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="樓層"
                  value={form.floor}
                  onChange={(event) => updateForm('floor', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="房號"
                  value={form.room}
                  onChange={(event) => updateForm('room', event.target.value)}
                  fullWidth
                  size="small"
                />
              </Stack>
              {form.locationType === 'pole' ? (
                <Stack
                  direction={{ mobile: 'column', tablet: 'row' }}
                  spacing={1.5}
                >
                  <TextField
                    label="桿號"
                    value={form.poleId}
                    onChange={(event) =>
                      updateForm('poleId', event.target.value)
                    }
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="桿位類型"
                    value={form.poleType}
                    onChange={(event) =>
                      updateForm('poleType', event.target.value)
                    }
                    fullWidth
                    size="small"
                  />
                </Stack>
              ) : null}
              {form.locationType === 'pole' ? (
                <TextField
                  label="桿位備註"
                  value={form.poleNote}
                  onChange={(event) =>
                    updateForm('poleNote', event.target.value)
                  }
                  fullWidth
                  size="small"
                />
              ) : null}
            </Stack>
          </Section>

          <Divider />

          <Section
            title="現場照片"
            description="目前先做前端欄位與預覽；後端尚未串接儲存，建立站點時不會一併寫入。"
          >
            <Stack spacing={1.5}>
              <Typography
                sx={{
                  fontSize: 12,
                  color: stationCreatePalette.bodyText,
                  lineHeight: 1.7,
                }}
              >
                可先到{' '}
                <Box
                  component="a"
                  href="https://duk.tw/"
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    color: stationCreatePalette.primary,
                    fontWeight: 700,
                    textDecoration: 'underline',
                  }}
                >
                  https://duk.tw/
                </Box>{' '}
                上傳圖片，再把圖片網址貼到下面欄位。
              </Typography>

              {form.photoUrls.map((photoUrl, index) => {
                const normalizedPhotoUrl = photoUrl.trim();
                const canPreview = isValidHttpUrl(normalizedPhotoUrl);

                return (
                  <Stack
                    key={`station-photo-url-${index}`}
                    spacing={1}
                    sx={{
                      p: 1.5,
                      border: `1px solid ${stationCreatePalette.border}`,
                      borderRadius: 3,
                      bgcolor: stationCreatePalette.sectionSurface,
                    }}
                  >
                    <Stack
                      direction={{ mobile: 'column', tablet: 'row' }}
                      spacing={1}
                      sx={{
                        alignItems: {
                          mobile: 'stretch',
                          tablet: 'flex-start',
                        },
                      }}
                    >
                      <TextField
                        label={`照片網址 ${index + 1}`}
                        placeholder="https://example.com/image.jpg"
                        value={photoUrl}
                        onChange={(event) =>
                          updatePhotoUrl(index, event.target.value)
                        }
                        fullWidth
                        size="small"
                      />
                      <Button
                        variant="outlined"
                        color="inherit"
                        onClick={() => removePhotoUrl(index)}
                        startIcon={<DeleteOutlineRoundedIcon />}
                        sx={{
                          flexShrink: 0,
                          alignSelf: { mobile: 'stretch', tablet: 'center' },
                          borderRadius: '999px',
                          borderColor: stationCreatePalette.secondaryBorder,
                          color: stationCreatePalette.secondaryText,
                        }}
                      >
                        移除
                      </Button>
                    </Stack>

                    {normalizedPhotoUrl ? (
                      canPreview ? (
                        <Box
                          component="img"
                          src={normalizedPhotoUrl}
                          alt={`現場照片預覽 ${index + 1}`}
                          sx={{
                            width: '100%',
                            maxHeight: 220,
                            objectFit: 'cover',
                            borderRadius: 2,
                            border: `1px solid ${stationCreatePalette.border}`,
                            bgcolor: '#EAF2FB',
                          }}
                        />
                      ) : (
                        <Typography
                          sx={{
                            fontSize: 12,
                            color: '#A53B2A',
                            lineHeight: 1.6,
                          }}
                        >
                          這筆網址格式不正確，需以 `http://` 或 `https://`
                          開頭。
                        </Typography>
                      )
                    ) : null}
                  </Stack>
                );
              })}

              <Stack
                direction={{ mobile: 'column', tablet: 'row' }}
                spacing={1}
                sx={{
                  alignItems: {
                    mobile: 'stretch',
                    tablet: 'center',
                  },
                  justifyContent: 'space-between',
                }}
              >
                <Typography
                  sx={{ fontSize: 12, color: stationCreatePalette.bodyText }}
                >
                  最多可先填 10 張圖片網址。
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddRoundedIcon />}
                  onClick={appendPhotoUrl}
                  disabled={form.photoUrls.length >= MAX_STATION_PHOTO_URLS}
                  sx={{
                    alignSelf: { mobile: 'stretch', tablet: 'flex-end' },
                    borderRadius: '999px',
                    borderColor: stationCreatePalette.secondaryBorder,
                    color: stationCreatePalette.secondaryText,
                    '&:hover': {
                      borderColor: stationCreatePalette.primary,
                      bgcolor: stationCreatePalette.sectionSurface,
                    },
                  }}
                >
                  新增圖片網址
                </Button>
              </Stack>
            </Stack>
          </Section>
        </Stack>
      </AdminDetailModalFrame>
    </Drawer>
  );
}

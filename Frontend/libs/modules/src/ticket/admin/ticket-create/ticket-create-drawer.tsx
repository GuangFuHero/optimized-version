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
  CreateTicketDocument,
  CreateTicketTaskDocument,
  TicketFieldsFragmentDoc,
  useFragment,
  type CreateTicketTaskInput,
} from '@rescue-frontend/data-access';

import type { RescueMapMarkerItem } from '../../../map/types';
import { AdminDetailModalFrame } from '../../../admin/shared/detail-modal-frame';
import type { TicketListRowItem } from '../ticket-list/types';

type TicketTaskTypeOption = 'rescue' | 'hr' | 'supply';

interface TaskDraft {
  id: string;
  taskType: TicketTaskTypeOption;
  taskName: string;
  taskDescription: string;
  quantity: string;
  actorUuid: string;
  assignedAt: string;
  syncWithTitle: boolean;
}

interface TicketCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (row: TicketListRowItem) => void;
  onCreatedMarker?: (marker: RescueMapMarkerItem) => void;
  initialPosition?: [number, number] | null;
  onLocationChange?: (position: [number, number]) => void;
}

interface TicketCreateFormState {
  taskType: TicketTaskTypeOption;
  title: string;
  description: string;
  contactName: string;
  contactPhone: string;
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

const TICKET_TYPE_OPTIONS: readonly {
  value: TicketTaskTypeOption;
  label: string;
}[] = [
  { value: 'rescue', label: '救援' },
  { value: 'hr', label: '人力' },
  { value: 'supply', label: '物資' },
];

const DETAIL_WIDTH = { mobile: '100vw', tablet: 460, desktop: 520 };
const MAX_TICKET_PHOTO_URLS = 10;

const ticketCreatePalette = {
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

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createInitialTaskDraft(): TaskDraft {
  return {
    id: crypto.randomUUID(),
    taskType: 'rescue',
    taskName: '',
    taskDescription: '',
    quantity: '',
    actorUuid: '',
    assignedAt: '',
    syncWithTitle: true,
  };
}

function createInitialState(): TicketCreateFormState {
  return {
    taskType: 'rescue',
    title: '',
    description: '',
    contactName: '',
    contactPhone: '',
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

function mapTaskTypeLabel(value: string) {
  return (
    TICKET_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function mapPriority(priority?: string | null): TicketListRowItem['priority'] {
  if (priority === 'critical' || priority === 'high') {
    return 'high';
  }

  if (priority === 'low') {
    return 'low';
  }

  return 'medium';
}

function mapStatus(status?: string | null): TicketListRowItem['status'] {
  if (status === 'in_progress') {
    return 'inProgress';
  }

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'cancelled') {
    return 'completed';
  }

  if (status === 'critical') {
    return 'critical';
  }

  return 'pending';
}

function mapVerification(
  verificationStatus?: string | null,
): TicketListRowItem['verification'] {
  if (verificationStatus === 'human_verified') {
    return 'humanVerified';
  }

  if (verificationStatus === 'ai_verified') {
    return 'aiVerified';
  }

  if (verificationStatus === 'disputed') {
    return 'disputed';
  }

  return 'unverified';
}

function buildTicketRow(input: {
  uuid: string;
  title: string;
  taskType?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  verificationStatus?: string | null;
  createdAt?: string | null;
  address: string;
}): TicketListRowItem {
  return {
    id: input.uuid,
    code: `#${input.uuid.slice(0, 8).toUpperCase()}`,
    title: input.title,
    taskType: mapTaskTypeLabel(input.taskType ?? 'rescue'),
    disasterType: mapTaskTypeLabel(input.taskType ?? 'rescue'),
    location: input.address || '未提供地址',
    status: mapStatus(input.status),
    priority: mapPriority(input.priority),
    verification: mapVerification(input.verificationStatus),
    createdAt: input.createdAt
      ? new Intl.DateTimeFormat('zh-TW', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(input.createdAt))
      : formatNow(),
  };
}

function buildTicketMarker(input: {
  uuid: string;
  title: string;
  description?: string | null;
  taskType?: string | null;
  status?: string | null;
  priority?: string | null;
  verificationStatus?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  position: [number, number];
}): RescueMapMarkerItem {
  const normalizedStatus = input.status?.trim().toLowerCase();
  const normalizedPriority = input.priority?.trim().toLowerCase();
  const inProgress =
    normalizedStatus === 'in_progress' ||
    normalizedStatus === 'in-progress' ||
    normalizedStatus === 'processing' ||
    normalizedStatus === 'assigned' ||
    normalizedStatus === 'accepted' ||
    normalizedPriority === 'low' ||
    normalizedPriority === 'medium';

  return {
    id: input.uuid,
    title: input.title,
    subtitle:
      input.description?.trim() ||
      input.taskType?.trim() ||
      input.status ||
      '救災任務',
    position: input.position,
    label: input.status === 'in_progress' ? '處理中' : '待處理',
    variant: inProgress ? 'in-progress' : 'urgent-ticket',
    detailType: 'ticket',
    ticketMeta: {
      status: input.status,
      priority: input.priority,
      taskType: input.taskType,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      createdBy: input.createdBy,
      verificationStatus: input.verificationStatus,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    },
    requiredVolunteers: 1,
    matchedVolunteers: 0,
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
              color: ticketCreatePalette.bodyText,
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

export function TicketCreateDrawer({
  open,
  onClose,
  onCreated,
  onCreatedMarker,
  initialPosition,
  onLocationChange,
}: TicketCreateDrawerProps) {
  const [form, setForm] = useState<TicketCreateFormState>(createInitialState);
  const [tasks, setTasks] = useState<TaskDraft[]>([createInitialTaskDraft()]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [createTicketResult, createTicket] = useMutation(CreateTicketDocument);
  const [, createTicketTask] = useMutation(CreateTicketTaskDocument);
  const { status: authStatus } = useSession();
  const reverseGeocodeRequestKeyRef = useRef<string | null>(null);

  const isSubmitting = createTicketResult.fetching;
  const derivedStatus = 'pending';
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
    setTasks([createInitialTaskDraft()]);
    setSubmitError(null);
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    onClose();
  };

  const updateForm = <K extends keyof TicketCreateFormState>(
    key: K,
    value: TicketCreateFormState[K],
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

  const updateTask = (taskId: string, patch: Partial<TaskDraft>) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const next = { ...task, ...patch };
        if (
          next.syncWithTitle &&
          ('syncWithTitle' in patch || 'taskName' in patch)
        ) {
          return next;
        }

        return next;
      }),
    );
  };

  const syncTitleToTasks = (title: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.syncWithTitle ? { ...task, taskName: title } : task,
      ),
    );
  };

  const appendTask = () => {
    setTasks((current) => [
      ...current,
      {
        ...createInitialTaskDraft(),
        taskType: form.taskType,
      },
    ]);
  };

  const removeTask = (taskId: string) => {
    setTasks((current) =>
      current.length === 1
        ? current
        : current.filter((task) => task.id !== taskId),
    );
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
      if (current.photoUrls.length >= MAX_TICKET_PHOTO_URLS) {
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
      setSubmitError('目前尚未登入，無法建立任務。請先登入後再試。');
      return;
    }

    if (
      !form.title.trim() ||
      !form.contactName.trim() ||
      !form.address.trim() ||
      !form.longitude.trim() ||
      !form.latitude.trim()
    ) {
      setSubmitError('請先填完所有必填欄位。');
      return;
    }

    if (tasks.some((task) => !task.taskName.trim())) {
      setSubmitError('每個子任務都需要任務名稱。');
      return;
    }

    const longitude = Number(form.longitude);
    const latitude = Number(form.latitude);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      setSubmitError('經緯度格式不正確。');
      return;
    }

    const ticketResult = await createTicket({
      input: {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        priority: 'medium',
        taskType: form.taskType,
        visibility: 'public',
        // TODO: backend 目前 createTicket 還沒有 secondary location / 地址拆欄位。
        // TODO: backend 目前也沒有 ticket photos 的建立 mutation。
      },
    });

    if (ticketResult.error || !ticketResult.data?.createTicket) {
      const errorMessage = ticketResult.error?.message ?? '新增任務失敗。';

      if (
        errorMessage.includes('401') ||
        errorMessage.includes('Could not validate credentials')
      ) {
        setSubmitError('登入狀態已失效，請重新登入後再試。');
        return;
      }

      if (
        errorMessage.includes('403') ||
        errorMessage.includes('Permission Denied')
      ) {
        setSubmitError(
          '目前帳號沒有建立任務的權限，請確認後端 RBAC 的 request:create 權限。',
        );
        return;
      }

      setSubmitError(errorMessage);
      return;
    }

    const createdTicket = useFragment(
      TicketFieldsFragmentDoc,
      ticketResult.data.createTicket,
    );

    const taskInputs: CreateTicketTaskInput[] = tasks.map((task) => ({
      ticketUuid: createdTicket.uuid,
      taskType: task.taskType,
      taskName: task.taskName.trim(),
      taskDescription: task.taskDescription.trim() || undefined,
      quantity: task.quantity ? Number(task.quantity) : undefined,
      source: 'user',
      visibility: 'public',
      // TODO: backend 目前沒有 create task assignment mutation，
      // actorUuid / assignedAt 先保留在前端 UI，暫不送出。
    }));

    for (const taskInput of taskInputs) {
      const taskResult = await createTicketTask({ input: taskInput });

      if (taskResult.error) {
        setSubmitError(taskResult.error.message);
        return;
      }
    }

    onCreated?.(
      buildTicketRow({
        uuid: createdTicket.uuid,
        title: createdTicket.title,
        taskType: createdTicket.taskType,
        description: createdTicket.description,
        status: createdTicket.status,
        priority: createdTicket.priority,
        verificationStatus: createdTicket.verificationStatus,
        createdAt: createdTicket.createdAt?.toString() ?? null,
        address: form.address.trim(),
      }),
    );
    onCreatedMarker?.(
      buildTicketMarker({
        uuid: createdTicket.uuid,
        title: createdTicket.title,
        description: createdTicket.description,
        taskType: createdTicket.taskType,
        status: createdTicket.status,
        priority: createdTicket.priority,
        verificationStatus: createdTicket.verificationStatus,
        contactName: createdTicket.contactName,
        contactEmail: createdTicket.contactEmail,
        contactPhone: createdTicket.contactPhone,
        createdBy: createdTicket.createdBy,
        createdAt: createdTicket.createdAt?.toString() ?? null,
        updatedAt: createdTicket.updatedAt?.toString() ?? null,
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
          width: DETAIL_WIDTH,
          maxWidth: '100vw',
          bgcolor: ticketCreatePalette.surface,
          backgroundImage: 'none',
        },
      }}
    >
      <AdminDetailModalFrame
        containerSx={{
          width: '100%',
          height: '100%',
          bgcolor: ticketCreatePalette.surface,
          borderLeft: `1px solid ${ticketCreatePalette.border}`,
        }}
        header={
          <Stack
            spacing={1}
            sx={{
              px: 2.5,
              py: 2,
              borderBottom: `1px solid ${ticketCreatePalette.border}`,
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
              <Typography
                sx={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: ticketCreatePalette.heading,
                }}
              >
                新增任務
              </Typography>
              <ButtonBase
                disableRipple
                aria-label="關閉新增任務"
                onClick={handleClose}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '999px',
                  color: ticketCreatePalette.bodyText,
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
              borderTop: `1px solid ${ticketCreatePalette.border}`,
              bgcolor: '#F6FAFF',
            }}
          >
            <Button
              variant="outlined"
              onClick={handleClose}
              disabled={isSubmitting}
              sx={{ flex: 1, borderRadius: '999px' }}
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
                bgcolor: ticketCreatePalette.primary,
                color: ticketCreatePalette.primaryText,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: ticketCreatePalette.primaryHover,
                  boxShadow: 'none',
                },
              }}
            >
              {isSubmitting ? '建立中...' : '建立任務'}
            </Button>
          </Stack>
        }
      >
        <Stack spacing={2.5}>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}

          <Section title="主任務">
            <Stack spacing={1.5}>
              <TextField
                required
                label="任務標題"
                placeholder="用一句話說明這個任務，例：仁愛路積水，需要清淤人力"
                value={form.title}
                onChange={(event) => {
                  const nextTitle = event.target.value;
                  updateForm('title', nextTitle);
                  syncTitleToTasks(nextTitle);
                }}
                fullWidth
                size="small"
              />
              <TextField
                label="任務描述"
                placeholder="描述現場狀況、注意事項、進入方式…"
                value={form.description}
                onChange={(event) =>
                  updateForm('description', event.target.value)
                }
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
            </Stack>
          </Section>

          <Divider />

          <Section title="聯絡與位置">
            <Stack spacing={1.5}>
              <TextField
                required
                label="現場聯絡人"
                placeholder="可填寫暱稱，但要找得到人"
                value={form.contactName}
                onChange={(event) =>
                  updateForm('contactName', event.target.value)
                }
                fullWidth
                size="small"
              />
              <TextField
                label="現場聯繫方式"
                placeholder="請務必填寫能夠找得到人的聯繫方式"
                value={form.contactPhone}
                onChange={(event) =>
                  updateForm('contactPhone', event.target.value)
                }
                fullWidth
                size="small"
              />
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
                placeholder={
                  isResolvingAddress ? '正在根據座標辨識地址…' : undefined
                }
                value={form.address}
                onChange={(event) => updateForm('address', event.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                select
                label="地址型態"
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
                  label="路 / 街"
                  value={form.lane}
                  onChange={(event) => updateForm('lane', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="巷 / 弄"
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
                  label="號"
                  value={form.no}
                  onChange={(event) => updateForm('no', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="樓"
                  value={form.floor}
                  onChange={(event) => updateForm('floor', event.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="室"
                  value={form.room}
                  onChange={(event) => updateForm('room', event.target.value)}
                  fullWidth
                  size="small"
                />
              </Stack>
            </Stack>
          </Section>

          <Divider />

          <Section
            title="子任務"
            description="第一筆子任務預設會跟主任務標題同步，可視需要拆成不同細項。"
          >
            <Stack spacing={1.5}>
              {tasks.map((task, index) => (
                <Box
                  key={task.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    bgcolor: '#FFFFFF',
                    border: `1px solid ${ticketCreatePalette.border}`,
                  }}
                >
                  <Stack spacing={1.25}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                        子任務 {index + 1}
                      </Typography>
                      <ButtonBase
                        disableRipple
                        aria-label={`刪除子任務 ${index + 1}`}
                        onClick={() => removeTask(task.id)}
                        sx={{ width: 28, height: 28, borderRadius: '999px' }}
                      >
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                      </ButtonBase>
                    </Box>
                    <TextField
                      select
                      label="類型"
                      value={task.taskType}
                      onChange={(event) => {
                        const nextType = event.target
                          .value as TicketTaskTypeOption;
                        updateTask(task.id, { taskType: nextType });
                        if (index === 0) {
                          updateForm('taskType', nextType);
                        }
                      }}
                      fullWidth
                      size="small"
                    >
                      {TICKET_TYPE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      required
                      label="需要什麼"
                      placeholder="例：鏟土志工、物資-圓鍬、礦泉水"
                      value={task.taskName}
                      onChange={(event) =>
                        updateTask(task.id, {
                          taskName: event.target.value,
                          syncWithTitle: false,
                        })
                      }
                      fullWidth
                      size="small"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={task.syncWithTitle}
                          onChange={(event) =>
                            updateTask(task.id, {
                              syncWithTitle: event.target.checked,
                              taskName: event.target.checked
                                ? form.title
                                : task.taskName,
                            })
                          }
                        />
                      }
                      label="同步主任務標題"
                    />
                    <TextField
                      label="細項說明"
                      placeholder="補充這筆子任務的執行方式、限制或注意事項"
                      value={task.taskDescription}
                      onChange={(event) =>
                        updateTask(task.id, {
                          taskDescription: event.target.value,
                        })
                      }
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                    />
                    <Stack
                      direction={{ mobile: 'column', tablet: 'row' }}
                      spacing={1.25}
                    >
                      <TextField
                        label="需求人數 / 數量"
                        value={task.quantity}
                        onChange={(event) =>
                          updateTask(task.id, { quantity: event.target.value })
                        }
                        fullWidth
                        size="small"
                      />
                      {/* <TextField
                        label="接案者 ID"
                        value={task.actorUuid}
                        onChange={(event) =>
                          updateTask(task.id, { actorUuid: event.target.value })
                        }
                        helperText="後端尚未支援建立任務時直接指派接案者，這欄目前僅保留 UI。"
                        fullWidth
                        size="small"
                      /> */}
                    </Stack>
                    {/* <TextField
                      label="接案時間"
                      type="datetime-local"
                      value={task.assignedAt}
                      onChange={(event) =>
                        updateTask(task.id, { assignedAt: event.target.value })
                      }
                      helperText="後端尚未支援建立任務時寫入接案時間。"
                      fullWidth
                      size="small"
                      slotProps={{ inputLabel: { shrink: true } }}
                    /> */}
                  </Stack>
                </Box>
              ))}
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={appendTask}
                sx={{ alignSelf: 'flex-start', borderRadius: '999px' }}
              >
                新增子任務
              </Button>
            </Stack>
          </Section>

          <Divider />

          <Section
            title="現場照片"
            description="目前先提供前端網址填寫與預覽；後端尚未串接照片建立。"
          >
            <Stack spacing={1.5}>
              <Typography
                sx={{
                  fontSize: 12,
                  color: ticketCreatePalette.bodyText,
                  lineHeight: 1.7,
                }}
              >
                目前先提供圖片網址填寫。可先到{' '}
                <Box
                  component="a"
                  href="https://duk.tw/"
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    color: ticketCreatePalette.secondaryText,
                    fontWeight: 700,
                    textDecoration: 'underline',
                  }}
                >
                  duk.tw
                </Box>{' '}
                上傳圖片後，再把網址貼回這裡。
              </Typography>

              {form.photoUrls.map((photoUrl, index) => {
                const normalizedPhotoUrl = photoUrl.trim();
                const canPreview = isValidHttpUrl(normalizedPhotoUrl);

                return (
                  <Stack
                    key={`ticket-photo-${index}`}
                    spacing={1}
                    sx={{
                      p: 1.5,
                      border: `1px solid ${ticketCreatePalette.border}`,
                      borderRadius: 3,
                      bgcolor: ticketCreatePalette.sectionSurface,
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
                          borderColor: ticketCreatePalette.secondaryBorder,
                          color: ticketCreatePalette.secondaryText,
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
                            border: `1px solid ${ticketCreatePalette.border}`,
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
                  sx={{ fontSize: 12, color: ticketCreatePalette.bodyText }}
                >
                  最多可先填 10 張圖片網址。
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddRoundedIcon />}
                  onClick={appendPhotoUrl}
                  disabled={form.photoUrls.length >= MAX_TICKET_PHOTO_URLS}
                  sx={{
                    alignSelf: { mobile: 'stretch', tablet: 'flex-end' },
                    borderRadius: '999px',
                    borderColor: ticketCreatePalette.secondaryBorder,
                    color: ticketCreatePalette.secondaryText,
                    '&:hover': {
                      borderColor: ticketCreatePalette.primary,
                      bgcolor: ticketCreatePalette.sectionSurface,
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

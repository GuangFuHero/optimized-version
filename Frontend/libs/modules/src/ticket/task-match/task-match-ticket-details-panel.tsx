'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded';
import { Alert, Box, ButtonBase, Chip, Stack, Typography } from '@mui/material';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  GetTicketTasksDocument,
  TicketFieldsFragmentDoc,
  TicketTaskFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';

import type { RescueMapMarkerItem } from '../../map/types';
import { formatTicketStatusLabel } from '../status';

const detailPalette = {
  surface: '#FFFFFF',
  sectionSurface: '#F6FAFF',
  border: '#D7E3F0',
  heading: '#17324D',
  text: '#1F2B37',
  muted: '#5D7288',
  accent: '#1F5C7A',
  accentSoft: '#EAF2FB',
};

// 詳情面板自行顯示載入狀態，停用 suspense 避免整頁因抓取任務資料而閃爍重渲染。
const DETAIL_QUERY_CONTEXT = { suspense: false } as const;

interface TicketPhotoItem {
  uuid: string;
  url: string;
  createdBy?: string | null;
  createdAt?: string | null;
}

interface TicketTaskPropertyItem {
  uuid: string;
  propertyName: string;
  propertyValue: string;
  quantity?: number | null;
  status?: string | null;
  comment?: string | null;
  createdAt?: string | null;
}

interface TicketTaskAssignmentItem {
  uuid: string;
  actorUuid: string;
  role?: string | null;
  assignedAt?: string | null;
}

interface TicketTaskDetailItem {
  uuid: string;
  taskType: string;
  taskName: string;
  taskDescription?: string | null;
  quantity?: number | null;
  status?: string | null;
  source?: string | null;
  progressNote?: string | null;
  visibility?: string | null;
  moderationStatus?: string | null;
  reviewNote?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  properties: TicketTaskPropertyItem[];
  assignments: TicketTaskAssignmentItem[];
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '未提供';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatTicketTypeLabel(value?: string | null) {
  if (!value) {
    return '未提供';
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'rescue':
      return '救援';
    case 'hr':
      return '人力';
    case 'supply':
      return '物資';
    case 'medical':
      return '醫療';
    default:
      return value;
  }
}

function formatPriorityLabel(value?: string | null) {
  if (!value) {
    return '未提供';
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'low':
      return '低';
    case 'medium':
      return '中';
    case 'high':
      return '高';
    case 'critical':
      return '緊急';
    default:
      return value;
  }
}

function formatModerationStatusLabel(value?: string | null) {
  if (!value) {
    return '未提供';
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'pending_review':
      return '待審核';
    case 'approved':
      return '已通過';
    case 'rejected':
      return '已退回';
    default:
      return value;
  }
}

function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack
      spacing={1.5}
      sx={{
        p: 2,
        borderRadius: 3,
        bgcolor: detailPalette.surface,
        border: `1px solid ${detailPalette.border}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: detailPalette.accent, display: 'grid', placeItems: 'center' }}>
            {icon}
          </Box>
          <Typography
            sx={{
              color: detailPalette.heading,
              fontSize: 15,
              lineHeight: '22px',
              fontWeight: 800,
            }}
          >
            {title}
          </Typography>
        </Box>
        {action}
      </Box>
      {children}
    </Stack>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography
        sx={{
          color: detailPalette.muted,
          fontSize: 12,
          lineHeight: '18px',
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>
      {typeof value === 'string' ? (
        <Typography
          sx={{
            color: detailPalette.text,
            fontSize: 14,
            lineHeight: '21px',
          }}
        >
          {value}
        </Typography>
      ) : (
        value
      )}
    </Stack>
  );
}

function CarouselControls({
  index,
  total,
  onPrevious,
  onNext,
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= 1) {
    return (
      <Typography sx={{ color: detailPalette.muted, fontSize: 12 }}>
        {total === 0 ? '0 / 0' : '1 / 1'}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <ButtonBase
        disableRipple
        onClick={onPrevious}
        aria-label="上一筆"
        sx={{
          width: 28,
          height: 28,
          borderRadius: '999px',
          border: `1px solid ${detailPalette.border}`,
          bgcolor: detailPalette.sectionSurface,
          color: detailPalette.accent,
        }}
      >
        <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
      </ButtonBase>
      <Typography sx={{ color: detailPalette.muted, fontSize: 12, minWidth: 44, textAlign: 'center' }}>
        {index + 1} / {total}
      </Typography>
      <ButtonBase
        disableRipple
        onClick={onNext}
        aria-label="下一筆"
        sx={{
          width: 28,
          height: 28,
          borderRadius: '999px',
          border: `1px solid ${detailPalette.border}`,
          bgcolor: detailPalette.sectionSurface,
          color: detailPalette.accent,
        }}
      >
        <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
      </ButtonBase>
    </Box>
  );
}

export function TaskMatchTicketDetailsPanel({
  marker,
}: {
  marker: RescueMapMarkerItem;
}) {
  const [{ data: ticketData, fetching: isTicketFetching, error: ticketError }] =
    useQuery({
      query: GetTicketDocument,
      variables: { uuid: marker.id },
      pause: !marker.id,
      context: DETAIL_QUERY_CONTEXT,
    });
  const [{ data: taskData, fetching: isTaskFetching, error: taskError }] =
    useQuery({
      query: GetTicketTasksDocument,
      variables: {
        ticketUuid: marker.id,
        skip: 0,
        limit: 50,
      },
      pause: !marker.id,
      context: DETAIL_QUERY_CONTEXT,
    });
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const ticket = useMemo(() => {
    if (!ticketData?.ticket) {
      return null;
    }

    return {
      ...ticketData.ticket,
      ...useFragment(TicketFieldsFragmentDoc, ticketData.ticket),
    };
  }, [ticketData?.ticket]);

  const photos = useMemo<TicketPhotoItem[]>(
    () =>
      (ticket?.photos ?? []).map((photo) => ({
        uuid: photo.uuid,
        url: photo.url,
        createdBy: photo.createdBy,
        createdAt: photo.createdAt?.toString() ?? null,
      })),
    [ticket?.photos],
  );

  const tasks = useMemo<TicketTaskDetailItem[]>(() => {
    const detailedTasks = (taskData?.ticketTasks ?? []).map((task) => ({
      ...task,
      ...useFragment(TicketTaskFieldsFragmentDoc, task),
    }));
    const detailedTaskById = new Map(detailedTasks.map((task) => [task.uuid, task]));
    const baseTasks = (ticket?.tasks ?? []).map((task) => ({
      ...task,
      ...useFragment(TicketTaskFieldsFragmentDoc, task),
    }));
    const orderedTasks = baseTasks.length > 0 ? baseTasks : detailedTasks;

    return orderedTasks.map((task) => {
      const detailedTask = detailedTaskById.get(task.uuid);

      return {
        uuid: task.uuid,
        taskType: detailedTask?.taskType ?? task.taskType,
        taskName: detailedTask?.taskName ?? task.taskName,
        taskDescription:
          detailedTask?.taskDescription ?? task.taskDescription ?? null,
        quantity: detailedTask?.quantity ?? task.quantity ?? null,
        status: detailedTask?.status ?? task.status ?? null,
        source: detailedTask?.source ?? task.source ?? null,
        progressNote: detailedTask?.progressNote ?? task.progressNote ?? null,
        visibility: detailedTask?.visibility ?? task.visibility ?? null,
        moderationStatus:
          detailedTask?.moderationStatus ?? task.moderationStatus ?? null,
        reviewNote: detailedTask?.reviewNote ?? task.reviewNote ?? null,
        createdAt:
          detailedTask?.createdAt?.toString() ?? task.createdAt?.toString() ?? null,
        updatedAt:
          detailedTask?.updatedAt?.toString() ?? task.updatedAt?.toString() ?? null,
        properties:
          detailedTask?.properties.map((property) => ({
            uuid: property.uuid,
            propertyName: property.propertyName,
            propertyValue: property.propertyValue,
            quantity: property.quantity,
            status: property.status,
            comment: property.comment,
            createdAt: property.createdAt?.toString() ?? null,
          })) ?? [],
        assignments:
          detailedTask?.assignments.map((assignment) => ({
            uuid: assignment.uuid,
            actorUuid: assignment.actorUuid,
            role: assignment.role,
            assignedAt: assignment.assignedAt?.toString() ?? null,
          })) ?? [],
      };
    });
  }, [taskData?.ticketTasks, ticket?.tasks]);

  const activeTask = tasks[activeTaskIndex] ?? null;
  const activePhoto = photos[activePhotoIndex] ?? null;

  useEffect(() => {
    setActiveTaskIndex(0);
    setActivePhotoIndex(0);
  }, [marker.id]);

  useEffect(() => {
    setActiveTaskIndex((current) =>
      tasks.length === 0 ? 0 : Math.min(current, tasks.length - 1),
    );
  }, [tasks.length]);

  useEffect(() => {
    setActivePhotoIndex((current) =>
      photos.length === 0 ? 0 : Math.min(current, photos.length - 1),
    );
  }, [photos.length]);

  const handlePreviousTask = () => {
    setActiveTaskIndex((current) =>
      tasks.length === 0 ? 0 : (current - 1 + tasks.length) % tasks.length,
    );
  };

  const handleNextTask = () => {
    setActiveTaskIndex((current) =>
      tasks.length === 0 ? 0 : (current + 1) % tasks.length,
    );
  };

  const handlePreviousPhoto = () => {
    setActivePhotoIndex((current) =>
      photos.length === 0 ? 0 : (current - 1 + photos.length) % photos.length,
    );
  };

  const handleNextPhoto = () => {
    setActivePhotoIndex((current) =>
      photos.length === 0 ? 0 : (current + 1) % photos.length,
    );
  };

  return (
    <Stack spacing={2}>
      {ticketError || taskError ? (
        <Alert severity="error">
          {(ticketError ?? taskError)?.message ?? '載入任務詳情失敗。'}
        </Alert>
      ) : null}

      <SectionCard title="任務單摘要" icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}>
        <Typography
          sx={{
            color: detailPalette.muted,
            fontSize: 12,
            lineHeight: '19px',
          }}
        >
          這張任務單是母單，實際執行與媒合重點在下方子任務。
        </Typography>
        <Stack spacing={1.25}>
          <DetailRow label="任務單標題" value={ticket?.title?.trim() || marker.title} />
          <DetailRow
            label="任務單狀態"
            value={formatTicketStatusLabel(ticket?.status ?? marker.ticketMeta?.status)}
          />
          <DetailRow
            label="任務單類型"
            value={formatTicketTypeLabel(ticket?.taskType ?? marker.ticketMeta?.taskType)}
          />
          <DetailRow
            label="現場聯絡人"
            value={[
              ticket?.contactName?.trim() || marker.ticketMeta?.contactName?.trim(),
              ticket?.contactPhone?.trim() || marker.ticketMeta?.contactPhone?.trim(),
            ]
              .filter(Boolean)
              .join(' / ') || '未提供'}
          />
          <DetailRow
            label="座標"
            value={`緯度 ${marker.position[0].toFixed(6)} / 經度 ${marker.position[1].toFixed(6)}`}
          />
          <DetailRow
            label="任務單說明"
            value={ticket?.description?.trim() || marker.subtitle}
          />
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Chip
              size="small"
              label={`優先度 ${formatPriorityLabel(ticket?.priority ?? marker.ticketMeta?.priority)}`}
              sx={{ bgcolor: detailPalette.accentSoft, color: detailPalette.accent }}
            />
            <Chip
              size="small"
              label={`子任務 ${tasks.length} 張`}
              sx={{ bgcolor: detailPalette.accentSoft, color: detailPalette.accent }}
            />
            <Chip
              size="small"
              label={`照片 ${photos.length} 張`}
              sx={{ bgcolor: detailPalette.accentSoft, color: detailPalette.accent }}
            />
          </Box>
          <DetailRow
            label="建立時間"
            value={formatDateTime(ticket?.createdAt?.toString() ?? marker.ticketMeta?.createdAt)}
          />
          <DetailRow
            label="最後更新"
            value={formatDateTime(ticket?.updatedAt?.toString() ?? marker.ticketMeta?.updatedAt)}
          />
        </Stack>
      </SectionCard>

      <SectionCard
        title={`子任務${tasks.length > 0 ? ` (${tasks.length})` : ''}`}
        icon={<AssignmentRoundedIcon sx={{ fontSize: 18 }} />}
        action={
          <CarouselControls
            index={activeTaskIndex}
            total={tasks.length}
            onPrevious={handlePreviousTask}
            onNext={handleNextTask}
          />
        }
      >
        {isTicketFetching || isTaskFetching ? (
          <Typography sx={{ color: detailPalette.muted, fontSize: 13 }}>
            載入子任務資料中...
          </Typography>
        ) : activeTask ? (
          <Stack spacing={1.5}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: detailPalette.sectionSurface,
                border: `1px solid ${detailPalette.border}`,
              }}
            >
              <Typography
                sx={{
                  color: detailPalette.heading,
                  fontSize: 16,
                  lineHeight: '24px',
                  fontWeight: 800,
                }}
              >
                {activeTask.taskName}
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Chip
                  size="small"
                  label={formatTicketTypeLabel(activeTask.taskType)}
                  sx={{ bgcolor: '#E8F5FB', color: '#005579' }}
                />
                <Chip
                  size="small"
                  label={formatTicketStatusLabel(activeTask.status)}
                  sx={{ bgcolor: '#FFF3E8', color: '#9A4D00' }}
                />
                <Chip
                  size="small"
                  label={
                    activeTask.quantity !== null && activeTask.quantity !== undefined
                      ? `需求數量 ${activeTask.quantity}`
                      : '需求數量未提供'
                  }
                  sx={{ bgcolor: '#EEF3F7', color: '#43505C' }}
                />
                <Chip
                  size="small"
                  label={`已指派 ${activeTask.assignments.length} 筆`}
                  sx={{ bgcolor: '#EEF3F7', color: '#43505C' }}
                />
              </Box>
            </Box>

            <DetailRow
              label="子任務說明"
              value={activeTask.taskDescription?.trim() || '未提供'}
            />
            <DetailRow
              label="審核狀態"
              value={formatModerationStatusLabel(activeTask.moderationStatus)}
            />
            <DetailRow
              label="進度備註"
              value={activeTask.progressNote?.trim() || '未提供'}
            />
            <DetailRow
              label="審核備註"
              value={activeTask.reviewNote?.trim() || '未提供'}
            />
            <DetailRow
              label="建立時間"
              value={formatDateTime(activeTask.createdAt)}
            />

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: detailPalette.sectionSurface,
                border: `1px solid ${detailPalette.border}`,
              }}
            >
              <Typography
                sx={{
                  color: detailPalette.heading,
                  fontSize: 13,
                  lineHeight: '20px',
                  fontWeight: 800,
                }}
              >
                子任務屬性
              </Typography>
              {activeTask.properties.length > 0 ? (
                <Stack spacing={1} sx={{ mt: 1.25 }}>
                  {activeTask.properties.map((property) => (
                    <Box
                      key={property.uuid}
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: detailPalette.surface,
                        border: `1px solid ${detailPalette.border}`,
                      }}
                    >
                      <Typography sx={{ color: detailPalette.text, fontSize: 13, fontWeight: 700 }}>
                        {property.propertyName}
                      </Typography>
                      <Typography sx={{ mt: 0.5, color: detailPalette.muted, fontSize: 12 }}>
                        {property.propertyValue}
                        {property.quantity !== null && property.quantity !== undefined
                          ? ` / 數量 ${property.quantity}`
                          : ''}
                        {property.status ? ` / 狀態 ${property.status}` : ''}
                      </Typography>
                      {property.comment?.trim() ? (
                        <Typography sx={{ mt: 0.75, color: detailPalette.text, fontSize: 12 }}>
                          {property.comment}
                        </Typography>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography sx={{ mt: 1, color: detailPalette.muted, fontSize: 12 }}>
                  此子任務目前沒有額外屬性資料。
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: detailPalette.sectionSurface,
                border: `1px solid ${detailPalette.border}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PeopleAltRoundedIcon sx={{ color: detailPalette.accent, fontSize: 18 }} />
                <Typography
                  sx={{
                    color: detailPalette.heading,
                    fontSize: 13,
                    lineHeight: '20px',
                    fontWeight: 800,
                  }}
                >
                  指派紀錄
                </Typography>
              </Box>
              {activeTask.assignments.length > 0 ? (
                <Stack spacing={1} sx={{ mt: 1.25 }}>
                  {activeTask.assignments.map((assignment) => (
                    <Box
                      key={assignment.uuid}
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: detailPalette.surface,
                        border: `1px solid ${detailPalette.border}`,
                      }}
                    >
                      <Typography sx={{ color: detailPalette.text, fontSize: 13, fontWeight: 700 }}>
                        {assignment.role?.trim() || '未指定角色'}
                      </Typography>
                      <Typography sx={{ mt: 0.5, color: detailPalette.muted, fontSize: 12 }}>
                        接案者 UUID：{assignment.actorUuid}
                      </Typography>
                      <Typography sx={{ mt: 0.5, color: detailPalette.muted, fontSize: 12 }}>
                        指派時間：{formatDateTime(assignment.assignedAt)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography sx={{ mt: 1, color: detailPalette.muted, fontSize: 12 }}>
                  此子任務目前沒有指派紀錄。
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Typography sx={{ color: detailPalette.muted, fontSize: 13 }}>
            這張任務單目前沒有子任務。
          </Typography>
        )}
      </SectionCard>

      <SectionCard
        title={`現場照片${photos.length > 0 ? ` (${photos.length})` : ''}`}
        icon={<PhotoLibraryRoundedIcon sx={{ fontSize: 18 }} />}
        action={
          <CarouselControls
            index={activePhotoIndex}
            total={photos.length}
            onPrevious={handlePreviousPhoto}
            onNext={handleNextPhoto}
          />
        }
      >
        {activePhoto ? (
          <Stack spacing={1.25}>
            <Box
              component="img"
              src={activePhoto.url}
              alt={`現場照片 ${activePhotoIndex + 1}`}
              sx={{
                width: '100%',
                maxHeight: 240,
                objectFit: 'cover',
                borderRadius: 2.5,
                border: `1px solid ${detailPalette.border}`,
                bgcolor: detailPalette.sectionSurface,
              }}
            />
            <DetailRow
              label="照片建立時間"
              value={formatDateTime(activePhoto.createdAt)}
            />
            <DetailRow
              label="上傳者"
              value={activePhoto.createdBy?.trim() || '未提供'}
            />
          </Stack>
        ) : (
          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: `1px dashed ${detailPalette.border}`,
              bgcolor: detailPalette.sectionSurface,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ImageRoundedIcon sx={{ color: detailPalette.muted, fontSize: 18 }} />
              <Typography sx={{ color: detailPalette.muted, fontSize: 13 }}>
                這張任務單目前沒有照片。
              </Typography>
            </Box>
          </Box>
        )}
      </SectionCard>
    </Stack>
  );
}

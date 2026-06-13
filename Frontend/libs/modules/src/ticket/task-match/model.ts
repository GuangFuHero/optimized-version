import type { RescueMapMarkerItem } from '../../map/types';

export const SITE_TASK_MATCH_STORAGE_KEY = 'rescue-site:task-matches';

export type TaskMatchStatus = 'pending' | 'matching' | 'matched' | 'deleted';

export type TaskMatchLogAction =
  | 'self-claim'
  | 'status-change'
  | 'match-sheet-delete';

export interface TaskMatchLogEntry {
  id: string;
  taskId: string;
  action: TaskMatchLogAction;
  actorName: string;
  occurredAt: string;
  summary: string;
}

export interface TaskMatchState {
  taskId: string;
  taskTitle: string;
  taskLabel: string;
  requiredVolunteers: number;
  matchedVolunteers: number;
  status: TaskMatchStatus;
  updatedAt: string;
  operationLog: TaskMatchLogEntry[];
}

export const taskMatchStatusLabels: Record<TaskMatchStatus, string> = {
  pending: '待媒合',
  matching: '媒合中',
  matched: '媒合成功',
  deleted: '媒合單已刪除',
};

export const taskMatchStatusTones: Record<
  TaskMatchStatus,
  'neutral' | 'warning' | 'success' | 'danger'
> = {
  pending: 'neutral',
  matching: 'warning',
  matched: 'success',
  deleted: 'danger',
};

function isTaskMatchStatus(value: unknown): value is TaskMatchStatus {
  return (
    value === 'pending' ||
    value === 'matching' ||
    value === 'matched' ||
    value === 'deleted'
  );
}

function clampVolunteerCount(value: unknown, requiredVolunteers: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(requiredVolunteers, Math.floor(value)));
}

function inferTaskMatchStatus(
  matchedVolunteers: number,
  requiredVolunteers: number,
): TaskMatchStatus {
  if (matchedVolunteers >= requiredVolunteers) {
    return 'matched';
  }

  return matchedVolunteers > 0 ? 'matching' : 'pending';
}

function normalizeLogEntry(value: unknown): TaskMatchLogEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<TaskMatchLogEntry>;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.taskId !== 'string' ||
    typeof candidate.actorName !== 'string' ||
    typeof candidate.occurredAt !== 'string' ||
    typeof candidate.summary !== 'string' ||
    (candidate.action !== 'self-claim' &&
      candidate.action !== 'status-change' &&
      candidate.action !== 'match-sheet-delete')
  ) {
    return null;
  }

  return {
    id: candidate.id,
    taskId: candidate.taskId,
    action: candidate.action,
    actorName: candidate.actorName,
    occurredAt: candidate.occurredAt,
    summary: candidate.summary,
  };
}

function normalizeTaskMatchState(value: unknown): TaskMatchState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<TaskMatchState>;

  if (
    typeof candidate.taskId !== 'string' ||
    typeof candidate.taskTitle !== 'string' ||
    typeof candidate.taskLabel !== 'string' ||
    typeof candidate.requiredVolunteers !== 'number' ||
    typeof candidate.updatedAt !== 'string' ||
    !isTaskMatchStatus(candidate.status)
  ) {
    return null;
  }

  const requiredVolunteers = Math.max(
    1,
    Math.floor(candidate.requiredVolunteers),
  );
  const matchedVolunteers = clampVolunteerCount(
    candidate.matchedVolunteers,
    requiredVolunteers,
  );
  const operationLog = Array.isArray(candidate.operationLog)
    ? candidate.operationLog
        .map((entry) => normalizeLogEntry(entry))
        .filter((entry): entry is TaskMatchLogEntry => entry !== null)
    : [];

  return {
    taskId: candidate.taskId,
    taskTitle: candidate.taskTitle,
    taskLabel: candidate.taskLabel,
    requiredVolunteers,
    matchedVolunteers,
    status: candidate.status,
    updatedAt: candidate.updatedAt,
    operationLog,
  };
}

function createLogEntry({
  taskId,
  action,
  actorName,
  summary,
  now,
}: {
  taskId: string;
  action: TaskMatchLogAction;
  actorName: string;
  summary: string;
  now: Date;
}): TaskMatchLogEntry {
  return {
    id: `${taskId}-${action}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId,
    action,
    actorName,
    occurredAt: now.toISOString(),
    summary,
  };
}

export function createInitialTaskMatchState(
  task: RescueMapMarkerItem,
): TaskMatchState {
  const requiredVolunteers = Math.max(1, task.requiredVolunteers ?? 2);
  const matchedVolunteers = clampVolunteerCount(
    task.matchedVolunteers,
    requiredVolunteers,
  );
  const status = inferTaskMatchStatus(matchedVolunteers, requiredVolunteers);
  const updatedAt = new Date(0).toISOString();

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskLabel: task.label,
    requiredVolunteers,
    matchedVolunteers,
    status,
    updatedAt,
    operationLog: [],
  };
}

export function resolveTaskMatchState(
  task: RescueMapMarkerItem,
  storedState?: TaskMatchState,
): TaskMatchState {
  const initialState = createInitialTaskMatchState(task);

  if (!storedState) {
    return initialState;
  }

  return {
    ...initialState,
    ...storedState,
    taskTitle: task.title,
    taskLabel: task.label,
    requiredVolunteers: Math.max(
      1,
      task.requiredVolunteers ?? storedState.requiredVolunteers,
    ),
  };
}

export function readTaskMatchStates(): Record<string, TaskMatchState> {
  if (typeof window === 'undefined') {
    return {};
  }

  const storedValue = window.localStorage.getItem(SITE_TASK_MATCH_STORAGE_KEY);

  if (!storedValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(storedValue);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, TaskMatchState>>(
      (states, [taskId, value]) => {
        const state = normalizeTaskMatchState(value);

        if (state) {
          states[taskId] = state;
        }

        return states;
      },
      {},
    );
  } catch {
    return {};
  }
}

export function writeTaskMatchStates(states: Record<string, TaskMatchState>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    SITE_TASK_MATCH_STORAGE_KEY,
    JSON.stringify(states),
  );
}

export function claimTaskMatch(
  task: RescueMapMarkerItem,
  currentState?: TaskMatchState,
  actorName = '現場志工',
  now = new Date(),
): TaskMatchState {
  const state = resolveTaskMatchState(task, currentState);

  if (state.status === 'matched' || state.status === 'deleted') {
    return state;
  }

  const matchedVolunteers = Math.min(
    state.requiredVolunteers,
    state.matchedVolunteers + 1,
  );
  const nextStatus = inferTaskMatchStatus(
    matchedVolunteers,
    state.requiredVolunteers,
  );
  const volunteerSummary = `${actorName} 自接任務 ${state.taskLabel}`;
  const statusSummary = `任務狀態由「${taskMatchStatusLabels[state.status]}」更新為「${taskMatchStatusLabels[nextStatus]}」`;

  return {
    ...state,
    matchedVolunteers,
    status: nextStatus,
    updatedAt: now.toISOString(),
    operationLog: [
      createLogEntry({
        taskId: state.taskId,
        action: 'self-claim',
        actorName,
        summary: volunteerSummary,
        now,
      }),
      ...(state.status !== nextStatus
        ? [
            createLogEntry({
              taskId: state.taskId,
              action: 'status-change',
              actorName: '系統',
              summary: statusSummary,
              now,
            }),
          ]
        : []),
      ...state.operationLog,
    ],
  };
}

export function deleteTaskMatchSheet(
  task: RescueMapMarkerItem,
  currentState?: TaskMatchState,
  actorName = '現場志工',
  now = new Date(),
): TaskMatchState {
  const state = resolveTaskMatchState(task, currentState);

  if (state.status === 'deleted') {
    return state;
  }

  return {
    ...state,
    status: 'deleted',
    updatedAt: now.toISOString(),
    operationLog: [
      createLogEntry({
        taskId: state.taskId,
        action: 'match-sheet-delete',
        actorName,
        summary: `刪除任務媒合單 ${state.taskLabel}，任務狀態進入刪單例外路徑`,
        now,
      }),
      createLogEntry({
        taskId: state.taskId,
        action: 'status-change',
        actorName: '系統',
        summary: '任務單狀態欄位更新為「媒合單已刪除」',
        now,
      }),
      ...state.operationLog,
    ],
  };
}

export function formatTaskMatchDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function createTaskMatchSummary(state: TaskMatchState) {
  return taskMatchStatusLabels[state.status];
}

export function downloadTaskMatchLog(state: TaskMatchState) {
  if (typeof window === 'undefined') {
    return;
  }

  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `task-match-log-${state.taskLabel}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

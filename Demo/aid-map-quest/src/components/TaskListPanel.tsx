import { useRef, useEffect } from 'react';
import { Task, TaskType, TaskStatus, Urgency, taskTypeConfig, urgencyConfig, statusConfig, taskTypeBadgeClass, urgencyOptions } from '@/data/tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Filter, ChevronLeft, Building2, Search, X, Clock, Trash2, ListTodo, Pin, UserCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskListPanelProps {
  tasks: Task[];
  allTaskCount: number;
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  activeFilters: TaskType[];
  floorOnly: boolean;
  searchQuery: string;
  timeFilter: string;
  statusFilter: TaskStatus | 'all';
  urgencyFilter: Urgency | 'all';
  myTasksOnly: boolean;
  customDateFrom?: Date;
  customDateTo?: Date;
  onToggleTypeFilter: (type: TaskType) => void;
  onSetFloorOnly: (v: boolean) => void;
  onSetSearchQuery: (q: string) => void;
  onSetTimeFilter: (t: string) => void;
  onSetStatusFilter: (s: TaskStatus | 'all') => void;
  onSetUrgencyFilter: (u: Urgency | 'all') => void;
  onSetMyTasksOnly: (v: boolean) => void;
  onSetCustomDateRange: (from?: Date, to?: Date) => void;
  onClearAllFilters: () => void;
}

const TIME_RANGES = [
  { label: '預設', value: 'all' },
  { label: '過去一小時', value: '1h' },
  { label: '過去 12 小時', value: '12h' },
  { label: '過去 24 小時', value: '24h' },
  { label: '自訂', value: 'custom' },
] as const;

const TaskListPanel = ({
  tasks,
  allTaskCount,
  selectedTaskId,
  onSelectTask,
  collapsed,
  onToggleCollapse,
  activeFilters,
  floorOnly,
  searchQuery,
  timeFilter,
  statusFilter,
  urgencyFilter,
  myTasksOnly,
  customDateFrom,
  customDateTo,
  onToggleTypeFilter,
  onSetFloorOnly,
  onSetSearchQuery,
  onSetTimeFilter,
  onSetStatusFilter,
  onSetUrgencyFilter,
  onSetMyTasksOnly,
  onSetCustomDateRange,
  onClearAllFilters,
}: TaskListPanelProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const hasActiveFilters = activeFilters.length > 0 || floorOnly || timeFilter !== 'all' || statusFilter !== 'all' || urgencyFilter !== 'all' || myTasksOnly;

  useEffect(() => {
    if (selectedTaskId && cardRefs.current.has(selectedTaskId)) {
      const el = cardRefs.current.get(selectedTaskId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedTaskId]);

  const pinnedTasks = tasks.filter(t => t.pinned);
  const unpinnedTasks = tasks.filter(t => !t.pinned);

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="absolute left-0 top-20 z-[1000] rounded-r-lg bg-card p-3 shadow-card"
      >
        <ListTodo className="h-5 w-5 text-foreground" />
      </button>
    );
  }

  const renderTaskCard = (task: Task) => (
    <button
      key={task.id}
      ref={el => { if (el) cardRefs.current.set(task.id, el); }}
      onClick={() => onSelectTask(task)}
      className={cn(
        'w-full border-b border-border px-5 py-4 text-left transition-colors task-card-hover',
        selectedTaskId === task.id ? 'bg-accent' : 'hover:bg-muted/50'
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {task.pinned && <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
        <span className="text-base">{taskTypeConfig[task.type].emoji}</span>
        <span className="flex-1 text-sm font-medium text-foreground">{task.name}</span>
      </div>
      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-[10px] border pointer-events-none', taskTypeBadgeClass[task.type])}>
          {taskTypeConfig[task.type].label}
        </Badge>
        <Badge className={cn('text-[10px] pointer-events-none', urgencyConfig[task.urgency].className)}>
          {urgencyConfig[task.urgency].label}
        </Badge>
        <Badge variant="outline" className={cn('text-[10px] border pointer-events-none', statusConfig[task.status].className)}>
          {statusConfig[task.status].label}
        </Badge>
        {task.hasFloorData && (
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground pointer-events-none">
            🏢 樓層
          </Badge>
        )}
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
    </button>
  );

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-foreground">任務列表</h2>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className={cn(hasActiveFilters && 'text-primary')}>
                <Filter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">篩選條件</span>
                  {hasActiveFilters && (
                    <button onClick={onClearAllFilters} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                      <Trash2 className="h-3 w-3" />
                      清除全部
                    </button>
                  )}
                </div>

                {/* My tasks only */}
                <button
                  onClick={() => onSetMyTasksOnly(!myTasksOnly)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                    myTasksOnly
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
                  )}
                >
                  <UserCheck className="h-3 w-3" />
                  只看自己任務
                </button>

                {/* Status filter */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground">任務狀態</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {(['all', 'active', 'completed'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => onSetStatusFilter(s)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                          statusFilter === s
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {s === 'all' ? '全部' : s === 'active' ? '進行中' : '已結束'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urgency filter */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">緊急程度</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {urgencyOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => onSetUrgencyFilter(opt.value)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                          urgencyFilter === opt.value
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type filters */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground">任務類型</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {(Object.keys(taskTypeConfig) as TaskType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => onToggleTypeFilter(type)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                          activeFilters.includes(type)
                            ? taskTypeBadgeClass[type]
                            : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {taskTypeConfig[type].emoji} {taskTypeConfig[type].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Floor only */}
                <button
                  onClick={() => onSetFloorOnly(!floorOnly)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                    floorOnly
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
                  )}
                >
                  <Building2 className="h-3 w-3" />
                  有樓層資料
                </button>

                {/* Time filter */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">時間範圍</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TIME_RANGES.map(range => (
                      <button
                        key={range.value}
                        onClick={() => onSetTimeFilter(range.value)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                          timeFilter === range.value
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                  {timeFilter === 'custom' && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-muted-foreground">選擇日期範圍</div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                            {customDateFrom
                              ? `${customDateFrom.toLocaleDateString()} - ${customDateTo?.toLocaleDateString() || '...'}`
                              : '選擇日期...'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            selected={customDateFrom && customDateTo ? { from: customDateFrom, to: customDateTo } : undefined}
                            onSelect={(range: any) => onSetCustomDateRange(range?.from, range?.to)}
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {onToggleCollapse && (
            <Button variant="ghost" size="icon" onClick={onToggleCollapse}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center rounded-lg border border-input bg-background px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSetSearchQuery(e.target.value)}
            placeholder="搜尋任務..."
            className="h-9 border-0 bg-transparent p-0 pl-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {searchQuery && (
            <button onClick={() => onSetSearchQuery('')} className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Count */}
      <div className="px-5 py-2 text-xs text-muted-foreground border-b border-border">
        共 {tasks.length} / {allTaskCount} 個任務
        {hasActiveFilters && (
          <button onClick={onClearAllFilters} className="ml-2 text-primary hover:underline">清除篩選</button>
        )}
      </div>

      {/* Task list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {pinnedTasks.length > 0 && (
          <div className="bg-primary/5 border-b border-primary/20">
            <div className="px-5 py-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
              <Pin className="h-3 w-3" />
              置頂任務
            </div>
            {pinnedTasks.map(renderTaskCard)}
          </div>
        )}
        {unpinnedTasks.map(renderTaskCard)}
      </div>
    </div>
  );
};

export default TaskListPanel;

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  statusConfig,
  Task,
  TaskStatus,
  TaskType,
  taskTypeBadgeClass,
  taskTypeConfig,
  Urgency,
  urgencyConfig,
  urgencyOptions,
} from '@/data/tasks';
import { cn } from '@/lib/utils';
import { animate, motion, PanInfo, useMotionValue } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  Clock,
  Copy,
  Filter,
  Link2,
  Lock,
  MapPin,
  Pin,
  Search,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface MobileBottomSheetProps {
  tasks: Task[];
  allTaskCount: number;
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
  detailTask: Task | null;
  onViewDetail: (task: Task) => void;
  onCloseDetail: () => void;
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

const COLLAPSED_HEIGHT = 56;
const HALF_RATIO = 0.5;
const FULL_OFFSET = 44;

const MobileBottomSheet = ({
  tasks,
  allTaskCount,
  selectedTaskId,
  onSelectTask,
  detailTask,
  onViewDetail,
  onCloseDetail,
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
}: MobileBottomSheetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [snapIndex, setSnapIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const sheetY = useMotionValue(0);
  const [windowH, setWindowH] = useState(window.innerHeight);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setWindowH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getSnapPoints = useCallback(
    () => [windowH - COLLAPSED_HEIGHT, windowH * (1 - HALF_RATIO), FULL_OFFSET],
    [windowH],
  );

  useEffect(() => {
    const snaps = getSnapPoints();
    sheetY.set(snaps[0]);
  }, [windowH]); // eslint-disable-line

  useEffect(() => {
    if (detailTask) {
      const snaps = getSnapPoints();
      animate(sheetY, snaps[1], { type: 'spring', damping: 30, stiffness: 300 });
      setSnapIndex(1);
      // Scroll detail to top
      setTimeout(() => {
        detailScrollRef.current?.scrollTo(0, 0);
      }, 100);
    }
  }, [detailTask]); // eslint-disable-line

  const snapTo = useCallback(
    (index: number) => {
      const snaps = getSnapPoints();
      const target = snaps[Math.max(0, Math.min(2, index))];
      animate(sheetY, target, { type: 'spring', damping: 30, stiffness: 300 });
      setSnapIndex(index);
    },
    [getSnapPoints, sheetY],
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    const currentY = sheetY.get();
    const velocity = info.velocity.y;
    const snaps = getSnapPoints();

    let targetIndex: number;
    console.log(snaps, currentY, velocity);

    // 快速滑動時才用速度判斷
    if (velocity < -800) {
      targetIndex = Math.max(0, snapIndex - 1);
    } else if (velocity > 800) {
      targetIndex = Math.min(2, snapIndex + 1);
    } else {
      // 找最近的 snap 點（包含當前點）
      let minDist = Infinity;
      targetIndex = snapIndex; // 預設維持原位

      snaps.forEach((snap, i) => {
        const dist = Math.abs(currentY - snap);
        if (dist < minDist) {
          minDist = dist;
          targetIndex = i;
        }
      });
    }

    snapTo(targetIndex);
  };
  const hasActiveFilters =
    activeFilters.length > 0 ||
    floorOnly ||
    timeFilter !== 'all' ||
    statusFilter !== 'all' ||
    urgencyFilter !== 'all' ||
    myTasksOnly;
  const isOpen = snapIndex > 0;

  const handleSelectTask = (task: Task) => {
    onSelectTask(task);
    onViewDetail(task);
    snapTo(1);
  };

  const pinnedTasks = tasks.filter((t) => t.pinned);
  const unpinnedTasks = tasks.filter((t) => !t.pinned);

  const renderTaskDetail = (task: Task) => (
    <div ref={detailScrollRef} className="px-4 pb-8 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl flex-shrink-0">{taskTypeConfig[task.type].emoji}</span>
          <h2 className="text-lg font-bold text-foreground truncate">{task.name}</h2>
        </div>
        <button
          onClick={onCloseDetail}
          className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn('border pointer-events-none', taskTypeBadgeClass[task.type])}
        >
          {taskTypeConfig[task.type].label}
        </Badge>
        <Badge className={cn('pointer-events-none', urgencyConfig[task.urgency].className)}>
          {urgencyConfig[task.urgency].label}
        </Badge>
        <Badge
          variant="outline"
          className={cn('border pointer-events-none', statusConfig[task.status].className)}
        >
          {statusConfig[task.status].label}
        </Badge>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">上傳者</span>
          <span className="text-xs font-medium text-foreground">{task.uploaderName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">單位</span>
          <span className="text-xs font-medium text-foreground">{task.unitName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">最後上傳</span>
          <span className="text-xs font-medium text-foreground">{task.lastUploadTime}</span>
        </div>
      </div>

      {/* Description */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">描述</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
      </div>

      {/* Images */}
      {task.images && task.images.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">現場照片</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {task.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`照片 ${i + 1}`}
                className="h-28 w-36 rounded-xl object-cover border border-border flex-shrink-0 cursor-pointer"
                loading="lazy"
                onClick={() => setLightboxImg(img)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Location */}
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground">位置資訊</span>
        </div>
        {task.address && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">{task.address}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(task.address!);
                toast.success('地址已複製');
              }}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted p-2">
            <span className="text-muted-foreground">經度</span>
            <p className="mt-0.5 font-medium text-foreground">{task.lng.toFixed(4)}</p>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <span className="text-muted-foreground">緯度</span>
            <p className="mt-0.5 font-medium text-foreground">{task.lat.toFixed(4)}</p>
          </div>
        </div>
      </div>

      {/* Private */}
      <div className="relative rounded-xl border border-border" style={{ minHeight: '80px' }}>
        <div className="p-3 space-y-2 select-none blur-[6px] pointer-events-none" aria-hidden>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">聯絡電話</span>
            <span className="text-xs font-medium">09xx-xxx-xxx</span>
          </div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-xl">
          <Lock className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">登入查看</span>
        </div>
      </div>

      {/* Share */}
      <Button
        variant="outline"
        size="sm"
        className="w-full min-h-[44px]"
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}?task=${task.id}`);
          toast.success('連結已複製到剪貼簿');
        }}
      >
        <Link2 className="h-4 w-4 mr-2" />
        複製連結
      </Button>

      {/* Timeline */}
      {task.updateRecords.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">更新紀錄</h3>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
            <div className="space-y-3">
              {task.updateRecords.map((record, i) => (
                <div key={i} className="relative">
                  <div
                    className={cn(
                      'absolute -left-6 top-1 h-4 w-4 rounded-full border-2 flex items-center justify-center',
                      i === 0 ? 'border-primary bg-primary/20' : 'border-border bg-card',
                    )}
                  >
                    <div
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        i === 0 ? 'bg-primary' : 'bg-muted-foreground/40',
                      )}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">{record.time}</span>
                    <p className="text-xs text-foreground mt-0.5">{record.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTaskCard = (task: Task) => (
    <button
      key={task.id}
      onClick={() => handleSelectTask(task)}
      className={cn(
        'w-full rounded-xl border border-border p-3.5 text-left transition-all min-h-[44px]',
        selectedTaskId === task.id ? 'border-primary bg-accent' : 'bg-card',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {task.pinned && <Pin className="h-3 w-3 text-primary flex-shrink-0" />}
        <span>{taskTypeConfig[task.type].emoji}</span>
        <span className="flex-1 text-sm font-medium text-foreground truncate">{task.name}</span>
      </div>
      <div className="flex gap-1.5 mb-1 flex-wrap">
        <Badge
          variant="outline"
          className={cn('text-[9px] border pointer-events-none', taskTypeBadgeClass[task.type])}
        >
          {taskTypeConfig[task.type].label}
        </Badge>
        <Badge
          className={cn('text-[9px] pointer-events-none', urgencyConfig[task.urgency].className)}
        >
          {urgencyConfig[task.urgency].label}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            'text-[9px] border pointer-events-none',
            statusConfig[task.status].className,
          )}
        >
          {statusConfig[task.status].label}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
    </button>
  );

  return (
    <>
      <motion.div
        ref={containerRef}
        className="fixed left-0 right-0 bottom-0 z-[1000] flex flex-col rounded-t-2xl bg-card shadow-elevated"
        style={{ y: sheetY, height: windowH, touchAction: 'none' }}
      >
        {/* Drag handle area */}
        <motion.div
          className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDrag={(_, info) => {
            const newY = sheetY.get() + info.delta.y;
            const snaps = getSnapPoints();
            const clamped = Math.max(snaps[2] - 20, Math.min(snaps[0] + 20, newY));
            sheetY.set(clamped);
          }}
          onDragEnd={handleDragEnd}
        >
          <div className="h-1.5 w-10 rounded-full bg-border" />
          {!isOpen && !detailTask && (
            <div className="mt-1.5 text-xs font-medium text-muted-foreground">
              任務列表 · {tasks.length} 個任務
            </div>
          )}
        </motion.div>

        {/* Header - only when open */}
        {isOpen && !detailTask && (
          <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
            {searchOpen ? (
              <div className="flex flex-1 items-center rounded-lg border border-input bg-background px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => onSetSearchQuery(e.target.value)}
                  placeholder="搜尋任務..."
                  className="h-10 border-0 bg-transparent p-0 pl-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                  onFocus={(e) => e.stopPropagation()}
                />
                <button
                  onClick={() => {
                    onSetSearchQuery('');
                    setSearchOpen(false);
                  }}
                  className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-foreground">任務列表 ({tasks.length})</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setSearchOpen(true);
                    }}
                    className={cn(
                      'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl',
                      searchQuery ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <Search className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setFilterSheetOpen(true)}
                    className={cn(
                      'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl',
                      hasActiveFilters ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <Filter className="h-5 w-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y' }}>
          {detailTask ? (
            renderTaskDetail(detailTask)
          ) : isOpen ? (
            <div className="space-y-2 px-4 pb-8">
              {pinnedTasks.length > 0 && (
                <div className="mb-1">
                  <div className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1 mb-2 px-1">
                    <Pin className="h-3 w-3" />
                    置頂任務
                  </div>
                  <div className="space-y-2">{pinnedTasks.map(renderTaskCard)}</div>
                </div>
              )}
              {unpinnedTasks.map(renderTaskCard)}
            </div>
          ) : null}
        </div>
      </motion.div>

      {/* Filter Sheet */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto z-[1500]">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-sm font-semibold">篩選條件</SheetTitle>
            <SheetDescription className="sr-only">篩選任務列表</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pb-6">
            {hasActiveFilters && (
              <button
                onClick={() => {
                  onClearAllFilters();
                  setFilterSheetOpen(false);
                }}
                className="flex items-center gap-1 text-xs text-destructive hover:underline min-h-[44px]"
              >
                <Trash2 className="h-3 w-3" />
                清除全部
              </button>
            )}

            <button
              onClick={() => onSetMyTasksOnly(!myTasksOnly)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-all border min-h-[36px]',
                myTasksOnly
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-muted text-muted-foreground border-transparent hover:bg-accent',
              )}
            >
              <UserCheck className="h-3 w-3" />
              只看自己任務
            </button>

            <div>
              <span className="text-xs font-medium text-muted-foreground">任務狀態</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {(['all', 'active', 'completed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => onSetStatusFilter(s)}
                    className={cn(
                      'rounded-full px-3 py-2 text-xs font-medium transition-all border min-h-[36px]',
                      statusFilter === s
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-muted text-muted-foreground border-transparent hover:bg-accent',
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
                {urgencyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onSetUrgencyFilter(opt.value)}
                    className={cn(
                      'rounded-full px-3 py-2 text-xs font-medium transition-all border min-h-[36px]',
                      urgencyFilter === opt.value
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-muted text-muted-foreground border-transparent hover:bg-accent',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-muted-foreground">任務類型</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {(Object.keys(taskTypeConfig) as TaskType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => onToggleTypeFilter(type)}
                    className={cn(
                      'rounded-full px-3 py-2 text-xs font-medium transition-all border min-h-[36px]',
                      activeFilters.includes(type)
                        ? taskTypeBadgeClass[type]
                        : 'bg-muted text-muted-foreground border-transparent hover:bg-accent',
                    )}
                  >
                    {taskTypeConfig[type].emoji} {taskTypeConfig[type].label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => onSetFloorOnly(!floorOnly)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-all border min-h-[36px]',
                floorOnly
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-muted text-muted-foreground border-transparent hover:bg-accent',
              )}
            >
              <Building2 className="h-3 w-3" />
              有樓層資料
            </button>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">時間範圍</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => onSetTimeFilter(range.value)}
                    className={cn(
                      'rounded-full px-3 py-2 text-xs font-medium transition-all border min-h-[36px]',
                      timeFilter === range.value
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-muted text-muted-foreground border-transparent hover:bg-accent',
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              {timeFilter === 'custom' && (
                <div className="mt-3">
                  <Calendar
                    mode="range"
                    selected={
                      customDateFrom && customDateTo
                        ? { from: customDateFrom, to: customDateTo }
                        : undefined
                    }
                    onSelect={(range: any) => onSetCustomDateRange(range?.from, range?.to)}
                    className="p-3 pointer-events-auto"
                  />
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-black/50 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImg}
            alt="放大照片"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default MobileBottomSheet;

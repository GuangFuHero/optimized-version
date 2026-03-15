import { useState, useMemo, useRef, useCallback } from 'react';
import { tasks as allTasks, Task, TaskType, TaskStatus, Urgency, PROJECT_NAME } from '@/data/tasks';
import { cn } from '@/lib/utils';
import TaskListPanel from '@/components/TaskListPanel';
import MapView, { MapViewHandle, RefugeZoneInfo } from '@/components/MapView';
import TaskDetail from '@/components/TaskDetail';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import UserAvatar from '@/components/UserAvatar';
import LayerControlPanel, { LayerConfig } from '@/components/LayerControlPanel';
import RefugeZoneDetail from '@/components/RefugeZoneDetail';
import ReportTaskModal from '@/components/ReportTaskModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { Locate, Maximize2, Plus, Minus, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const Index = () => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refugeZone, setRefugeZone] = useState<RefugeZoneInfo | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState('victim');
  const isMobile = useIsMobile();
  const mapRef = useRef<MapViewHandle>(null);

  // Filter state
  const [activeFilters, setActiveFilters] = useState<TaskType[]>([]);
  const [floorOnly, setFloorOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'all'>('all');
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();

  // Layer state
  const [layers, setLayers] = useState<LayerConfig>({
    baseMap: 'street',
    terrain: false,
    water: false,
    importantLocations: true,
    ngoZones: false,
  });

  const toggleTypeFilter = useCallback((type: TaskType) => {
    setActiveFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    setFloorOnly(false);
    setSearchQuery('');
    setTimeFilter('all');
    setStatusFilter('all');
    setUrgencyFilter('all');
    setMyTasksOnly(false);
    setCustomDateFrom(undefined);
    setCustomDateTo(undefined);
  }, []);

  const setCustomDateRange = useCallback((from?: Date, to?: Date) => {
    setCustomDateFrom(from);
    setCustomDateTo(to);
  }, []);

  // Compute filtered tasks
  const filteredTasks = useMemo(() => {
    let result = allTasks;

    if (activeFilters.length > 0) {
      result = result.filter(t => activeFilters.includes(t.type));
    }
    if (floorOnly) {
      result = result.filter(t => t.hasFloorData);
    }
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter);
    }
    if (urgencyFilter !== 'all') {
      result = result.filter(t => t.urgency === urgencyFilter);
    }
    if (myTasksOnly) {
      result = result.filter(t => t.assignedRoles.includes(currentRole));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    if (timeFilter === '1h') {
      const cutoff = new Date(Date.now() - 3600000);
      result = result.filter(t => new Date(t.lastUploadTime) >= cutoff);
    } else if (timeFilter === '12h') {
      const cutoff = new Date(Date.now() - 12 * 3600000);
      result = result.filter(t => new Date(t.lastUploadTime) >= cutoff);
    } else if (timeFilter === '24h') {
      const cutoff = new Date(Date.now() - 24 * 3600000);
      result = result.filter(t => new Date(t.lastUploadTime) >= cutoff);
    } else if (timeFilter === 'custom' && customDateFrom && customDateTo) {
      result = result.filter(t => {
        const d = new Date(t.lastUploadTime);
        return d >= customDateFrom && d <= customDateTo;
      });
    }

    return result;
  }, [activeFilters, floorOnly, searchQuery, timeFilter, statusFilter, urgencyFilter, myTasksOnly, currentRole, customDateFrom, customDateTo]);

  const filterProps = {
    activeFilters,
    floorOnly,
    searchQuery,
    timeFilter,
    statusFilter,
    urgencyFilter,
    myTasksOnly,
    customDateFrom,
    customDateTo,
    onToggleTypeFilter: toggleTypeFilter,
    onSetFloorOnly: setFloorOnly,
    onSetSearchQuery: setSearchQuery,
    onSetTimeFilter: setTimeFilter,
    onSetStatusFilter: setStatusFilter,
    onSetUrgencyFilter: setUrgencyFilter,
    onSetMyTasksOnly: setMyTasksOnly,
    onSetCustomDateRange: setCustomDateRange,
    onClearAllFilters: clearAllFilters,
  };

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
  };

  const handleViewDetail = (task: Task) => {
    setDetailTask(task);
  };

  const mapControlBtnClass = "h-11 w-11 rounded-xl bg-card/90 shadow-card backdrop-blur-md hover:shadow-elevated";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Desktop/Tablet sidebar */}
      {!isMobile && (
        <div
          className={`h-full flex-shrink-0 border-r border-border transition-all duration-300 ${
            sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-80 lg:w-96'
          }`}
        >
          <TaskListPanel
            tasks={filteredTasks}
            allTaskCount={allTasks.length}
            selectedTaskId={selectedTask?.id ?? null}
            onSelectTask={handleSelectTask}
            collapsed={false}
            onToggleCollapse={() => setSidebarCollapsed(true)}
            {...filterProps}
          />
        </div>
      )}

      {/* Collapsed sidebar toggle */}
      {!isMobile && sidebarCollapsed && (
        <TaskListPanel
          tasks={filteredTasks}
          allTaskCount={allTasks.length}
          selectedTaskId={selectedTask?.id ?? null}
          onSelectTask={handleSelectTask}
          collapsed={true}
          onToggleCollapse={() => setSidebarCollapsed(false)}
          {...filterProps}
        />
      )}

      {/* Map */}
      <div className="relative flex-1">
        {/* Project header - top left */}
        <div className={cn(
          "absolute top-4 z-[1000] flex items-center gap-2 rounded-xl bg-card/90 px-4 py-2.5 shadow-card backdrop-blur-md transition-all",
          sidebarCollapsed ? 'left-16' : 'left-4'
        )}>
          <div>
            <h1 className="text-sm font-semibold text-foreground">{PROJECT_NAME}</h1>
            <p className="text-[10px] text-muted-foreground">地震災害 · {filteredTasks.length} 個任務</p>
          </div>
        </div>

        {/* Desktop: top-right — report + avatar */}
        {!isMobile && (
          <div className="absolute top-4 right-4 z-[1100] flex items-center gap-2">
            <Button
              onClick={() => setReportModalOpen(true)}
              className="h-auto rounded-xl px-4 py-2.5 shadow-card gap-2 font-semibold"
            >
              <PlusCircle className="h-5 w-5" />
              回報
            </Button>
            <UserAvatar currentRole={currentRole} onRoleChange={setCurrentRole} />
          </div>
        )}

        {/* Mobile top-right controls */}
        {isMobile && (
          <div className="absolute top-4 right-4 z-[1100] flex items-center gap-2">
            <LayerControlPanel layers={layers} onLayersChange={setLayers} />
            <UserAvatar currentRole={currentRole} onRoleChange={setCurrentRole} />
          </div>
        )}

        {/* Desktop: right-bottom controls */}
        {!isMobile && (
          <div className="absolute right-4 bottom-4 z-[1000] flex flex-col gap-2 items-center">
            {/* ① Geolocate */}
            <Button variant="ghost" onClick={() => mapRef.current?.geolocate()} className={mapControlBtnClass} title="定位到現在位置">
              <Locate className="h-5 w-5" />
            </Button>
            {/* ② Fit all */}
            <Button variant="ghost" onClick={() => mapRef.current?.fitAll()} className={mapControlBtnClass} title="查看全部任務">
              <Maximize2 className="h-5 w-5" />
            </Button>

            <Separator className="w-8 bg-border/60" />

            {/* ③ Layer control */}
            <LayerControlPanel layers={layers} onLayersChange={setLayers} />

            <Separator className="w-8 bg-border/60" />

            {/* ④ Zoom +/- grouped */}
            <div className="flex flex-col rounded-xl bg-card/90 shadow-card backdrop-blur-md overflow-hidden">
              <Button variant="ghost" onClick={() => mapRef.current?.zoomIn()} className="h-10 w-11 rounded-none hover:bg-accent" title="放大">
                <Plus className="h-4 w-4" />
              </Button>
              <Separator className="bg-border/40" />
              <Button variant="ghost" onClick={() => mapRef.current?.zoomOut()} className="h-10 w-11 rounded-none hover:bg-accent" title="縮小">
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Mobile: bottom-right controls */}
        {isMobile && (
          <>
            {/* FAB Report button */}
            <button
              onClick={() => setReportModalOpen(true)}
              className="absolute left-4 bottom-20 z-[999] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-elevated flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="h-6 w-6" />
            </button>
            <div className="absolute right-4 bottom-20 z-[999] flex flex-col gap-2">
              <Button variant="ghost" onClick={() => mapRef.current?.geolocate()} className={mapControlBtnClass}>
                <Locate className="h-5 w-5" />
              </Button>
              <Button variant="ghost" onClick={() => mapRef.current?.fitAll()} className={mapControlBtnClass}>
                <Maximize2 className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}

        <MapView
          ref={mapRef}
          tasks={filteredTasks}
          allTasks={allTasks}
          selectedTask={selectedTask}
          onSelectTask={handleSelectTask}
          onViewDetail={handleViewDetail}
          onViewRefugeZone={setRefugeZone}
          layers={layers}
        />
      </div>

      {/* Mobile bottom sheet */}
      {isMobile && (
        <MobileBottomSheet
          tasks={filteredTasks}
          allTaskCount={allTasks.length}
          selectedTaskId={selectedTask?.id ?? null}
          onSelectTask={handleSelectTask}
          detailTask={detailTask}
          onViewDetail={handleViewDetail}
          onCloseDetail={() => setDetailTask(null)}
          {...filterProps}
        />
      )}

      {/* Task detail modal (desktop only) */}
      {!isMobile && detailTask && (
        <TaskDetail task={detailTask} onClose={() => setDetailTask(null)} />
      )}

      {/* Refuge zone detail */}
      {refugeZone && (
        <RefugeZoneDetail zone={refugeZone} onClose={() => setRefugeZone(null)} />
      )}

      {/* Report task modal */}
      {reportModalOpen && (
        <ReportTaskModal onClose={() => setReportModalOpen(false)} />
      )}
    </div>
  );
};

export default Index;

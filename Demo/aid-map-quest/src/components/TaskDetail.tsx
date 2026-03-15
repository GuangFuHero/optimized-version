import { useState } from 'react';
import { Task, taskTypeConfig, urgencyConfig, statusConfig, FloorData, taskTypeBadgeClass } from '@/data/tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Link2, Minus, Plus, ThumbsUp, ThumbsDown, User, Building2, Clock, Lock, MapPin, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
}

const TaskDetail = ({ task, onClose }: TaskDetailProps) => {
  const [floorData, setFloorData] = useState<FloorData[]>(task.floorData || []);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [upCount, setUpCount] = useState(Math.floor(Math.random() * 20) + 3);
  const [downCount, setDownCount] = useState(Math.floor(Math.random() * 5));
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const updateFloorCount = (index: number, delta: number) => {
    setFloorData(prev => prev.map((f, i) =>
      i === index ? { ...f, count: Math.max(0, f.count + delta) } : f
    ));
  };

  const setFloorCount = (index: number, count: number) => {
    setFloorData(prev => prev.map((f, i) => i === index ? { ...f, count } : f));
  };

  const totalPeople = floorData.reduce((sum, f) => sum + f.count, 0);

  const handleCopyLink = () => {
    const url = `${window.location.origin}?task=${task.id}`;
    navigator.clipboard.writeText(url);
    toast.success('連結已複製到剪貼簿');
  };

  const handleCopyAddress = () => {
    if (task.address) {
      navigator.clipboard.writeText(task.address);
      toast.success('地址已複製到剪貼簿');
    }
  };

  const handleVote = (type: 'up' | 'down') => {
    if (vote === type) {
      setVote(null);
      if (type === 'up') setUpCount(c => c - 1);
      else setDownCount(c => c - 1);
    } else {
      if (vote === 'up') setUpCount(c => c - 1);
      if (vote === 'down') setDownCount(c => c - 1);
      setVote(type);
      if (type === 'up') setUpCount(c => c + 1);
      else setDownCount(c => c + 1);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[2000] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="text-xl flex-shrink-0">{taskTypeConfig[task.type].emoji}</span>
            <h1 className="text-lg font-bold text-foreground truncate">{task.name}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5">
              <Link2 className="h-4 w-4" />
              分享
            </Button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn('border pointer-events-none', taskTypeBadgeClass[task.type])}>
                {taskTypeConfig[task.type].label}
              </Badge>
              <Badge className={cn('pointer-events-none', urgencyConfig[task.urgency].className)}>
                {urgencyConfig[task.urgency].label}
              </Badge>
              <Badge variant="outline" className={cn('border pointer-events-none', statusConfig[task.status].className)}>
                {statusConfig[task.status].label}
              </Badge>
              {task.pinned && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary pointer-events-none">
                  📌 置頂
                </Badge>
              )}
            </div>

            {/* Uploader info */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">上傳者</span>
                  <span className="text-sm font-medium text-foreground">{task.uploaderName}</span>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">單位</span>
                  <span className="text-sm font-medium text-foreground">{task.unitName}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">最後上傳</span>
                <span className="text-sm font-medium text-foreground">{task.lastUploadTime}</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-2">描述</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
            </div>

            {/* Images */}
            {task.images && task.images.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-2">現場照片</h2>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {task.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`現場照片 ${i + 1}`}
                      className="h-32 w-44 rounded-xl object-cover border border-border flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                      loading="lazy"
                      onClick={() => setLightboxImg(img)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Location: Address + Coordinates */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">位置資訊</span>
              </div>
              {task.address && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground flex-1">{task.address}</span>
                  <button
                    onClick={handleCopyAddress}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted p-2.5">
                  <span className="text-muted-foreground">經度</span>
                  <p className="mt-0.5 font-medium text-foreground">{task.lng.toFixed(4)}</p>
                </div>
                <div className="rounded-lg bg-muted p-2.5">
                  <span className="text-muted-foreground">緯度</span>
                  <p className="mt-0.5 font-medium text-foreground">{task.lat.toFixed(4)}</p>
                </div>
              </div>
            </div>

            {/* Private data - fixed layout */}
            <div className="relative rounded-xl border border-border" style={{ minHeight: '120px' }}>
              <div className="p-4 space-y-3 select-none blur-[6px] pointer-events-none" aria-hidden>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">聯絡電話</span>
                  <span className="text-sm font-medium text-foreground">09xx-xxx-xxx</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">現場聯絡人</span>
                  <span className="text-sm font-medium text-foreground">王 OO 隊長</span>
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-xl">
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-muted p-2.5">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">隱私資料</span>
                  <span className="text-xs text-muted-foreground">登入並取得權限後才能查看</span>
                  <Button size="sm" className="mt-1">登入查看</Button>
                </div>
              </div>
            </div>

            {task.hasFloorData && floorData.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">樓層剩餘人數</h2>
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    共 {totalPeople} 人
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">樓層</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">剩餘人數</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floorData.map((floor, i) => (
                        <tr key={floor.floor} className="border-t border-border">
                          <td className="px-4 py-2.5 font-medium text-foreground">{floor.floor}</td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              value={floor.count}
                              onChange={e => setFloorCount(i, parseInt(e.target.value) || 0)}
                              className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                              min={0}
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => updateFloorCount(i, -1)}
                                className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted transition-colors"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => updateFloorCount(i, 1)}
                                className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Update records - timeline */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">更新紀錄</h2>
              <div className="relative pl-6">
                {/* Timeline line */}
                <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
                <div className="space-y-4">
                  {task.updateRecords.map((record, i) => (
                    <div key={i} className="relative">
                      {/* Dot */}
                      <div className={cn(
                        'absolute -left-6 top-1 h-[18px] w-[18px] rounded-full border-2 flex items-center justify-center',
                        i === 0
                          ? 'border-primary bg-primary/20'
                          : 'border-border bg-card'
                      )}>
                        <div className={cn(
                          'h-2 w-2 rounded-full',
                          i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'
                        )} />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">{record.time}</span>
                        <p className="text-sm text-foreground mt-0.5">{record.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Voting */}
            <div className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-semibold text-foreground text-center mb-1">這是個好資訊嗎？</h2>
              <p className="text-xs text-muted-foreground text-center mb-4">評估這筆資料的準確性與實用性</p>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => handleVote('up')}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all",
                    vote === 'up'
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span>有幫助</span>
                  <span className="ml-1 text-xs opacity-70">{upCount}</span>
                </button>
                <button
                  onClick={() => handleVote('down')}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all",
                    vote === 'down'
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span>待確認</span>
                  <span className="ml-1 text-xs opacity-70">{downCount}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImg}
            alt="放大照片"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default TaskDetail;

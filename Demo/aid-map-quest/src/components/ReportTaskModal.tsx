import { useState, useRef, useEffect } from 'react';
import { X, MapPin, Camera, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TaskType, taskTypeConfig } from '@/data/tasks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import L from 'leaflet';

interface ReportTaskModalProps {
  onClose: () => void;
}

const ReportTaskModal = ({ onClose }: ReportTaskModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [contact, setContact] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [pinLocation, setPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.0, 120.22],
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setPinLocation({ lat, lng });

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          html: `<div style="
            width: 32px; height: 32px; background: hsl(28 91% 50%); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            border: 2px solid white;
          ">📍</div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const handleSubmit = () => {
    if (!title.trim() || !taskType) {
      toast.error('請填寫標題並選擇任務類型');
      return;
    }
    toast.success('回報已送出（示範功能）');
    onClose();
  };

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-background animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-foreground">回報任務</h1>
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">標題 *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：永康區民宅倒塌"
              className="h-12"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">描述 *</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="請描述現場狀況..."
              className="min-h-[100px]"
            />
          </div>

          {/* Task type */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">任務類型 *</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(taskTypeConfig) as TaskType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setTaskType(type)}
                  className={cn(
                    'rounded-full px-4 py-2.5 text-sm font-medium transition-all border min-h-[44px]',
                    taskType === type
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {taskTypeConfig[type].emoji} {taskTypeConfig[type].label}
                </button>
              ))}
            </div>
          </div>

          {/* Location - interactive map */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              位置 {pinLocation && <span className="text-xs text-muted-foreground ml-2">({pinLocation.lat.toFixed(4)}, {pinLocation.lng.toFixed(4)})</span>}
            </label>
            <div
              ref={mapContainerRef}
              className="w-full h-48 rounded-xl border border-border overflow-hidden"
            />
            <p className="text-xs text-muted-foreground mt-1">點擊地圖放置位置標記</p>
          </div>

          {/* Photos */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">照片（可選）</label>
            <div className="flex gap-2 flex-wrap">
              {photos.map((photo, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img src={URL.createObjectURL(photo)} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, pi) => pi !== i))}
                    className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Camera className="h-5 w-5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoAdd} className="hidden" />
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">聯絡方式（可選）</label>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="電話或其他聯絡方式"
                className="h-12"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="border-t border-border px-4 py-4 flex-shrink-0">
        <Button onClick={handleSubmit} className="w-full h-12 text-base font-semibold">
          送出回報
        </Button>
      </div>
    </div>
  );
};

export default ReportTaskModal;

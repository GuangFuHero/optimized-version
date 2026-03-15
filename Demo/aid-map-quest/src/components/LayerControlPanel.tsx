import { useState } from 'react';
import { Layers, X, Mountain, Droplets, MapPin, Moon, Sun, Map, Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';

export interface LayerConfig {
  baseMap: 'street' | 'satellite' | 'default';
  terrain: boolean;
  water: boolean;
  importantLocations: boolean;
  ngoZones: boolean;
}

interface LayerControlPanelProps {
  layers: LayerConfig;
  onLayersChange: (layers: LayerConfig) => void;
}

const LayerControlPanel = ({ layers, onLayersChange }: LayerControlPanelProps) => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();

  const update = (partial: Partial<LayerConfig>) => {
    onLayersChange({ ...layers, ...partial });
  };

  const panelContent = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">地圖圖層</h3>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">底圖</span>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button
            onClick={() => update({ baseMap: 'street' })}
            className={cn(
              'flex-1 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all min-h-[44px]',
              layers.baseMap === 'street'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            🗺️ 街道圖
          </button>
          <button
            onClick={() => update({ baseMap: 'satellite' })}
            className={cn(
              'flex-1 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all min-h-[44px]',
              layers.baseMap === 'satellite'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            🛰️ 衛星圖
          </button>
          <button
            onClick={() => update({ baseMap: 'default' })}
            className={cn(
              'w-full rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all min-h-[44px]',
              layers.baseMap === 'default'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            <Map className="h-4 w-4 inline mr-1.5" />
            原始地圖
          </button>
        </div>
      </div>

      <div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">分析圖層</span>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Mountain className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">地勢高低圖</span>
            </div>
            <Switch checked={layers.terrain} onCheckedChange={(v) => update({ terrain: v })} />
          </div>
          <div className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Droplets className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">水位圖</span>
            </div>
            <Switch checked={layers.water} onCheckedChange={(v) => update({ water: v })} />
          </div>
        </div>
      </div>

      <div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">資訊圖層</span>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">重要位置</span>
            </div>
            <Switch checked={layers.importantLocations} onCheckedChange={(v) => update({ importantLocations: v })} />
          </div>
          <div className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">NGO 處理區</span>
            </div>
            <Switch checked={layers.ngoZones} onCheckedChange={(v) => update({ ngoZones: v })} />
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-3">
          {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm text-foreground">深色模式</span>
        </div>
        <Switch checked={theme === 'dark'} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} />
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        className={cn(
          'h-11 w-11 rounded-xl bg-card/90 shadow-card backdrop-blur-md hover:shadow-elevated',
          open && 'bg-primary/10 text-primary'
        )}
      >
        <Layers className="h-5 w-5" />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200]"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          isMobile ? (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[1201] rounded-t-2xl bg-card p-5 pb-8 shadow-elevated"
            >
              <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-border" />
              {panelContent}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 right-14 z-[1201] w-72 rounded-2xl bg-card p-5 shadow-elevated border border-border"
            >
              {panelContent}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </>
  );
};

export default LayerControlPanel;

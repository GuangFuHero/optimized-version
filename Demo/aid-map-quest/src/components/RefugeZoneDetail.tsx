import { X, MapPin, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion } from 'framer-motion';
import type { RefugeZoneInfo } from '@/components/MapView';

interface RefugeZoneDetailProps {
  zone: RefugeZoneInfo;
  onClose: () => void;
}

const RefugeZoneDetail = ({ zone, onClose }: RefugeZoneDetailProps) => {
  const isMobile = useIsMobile();

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⛺</span>
          <div>
            <h2 className="text-base font-bold text-foreground">{zone.label}</h2>
            <p className="text-xs text-muted-foreground">{zone.sublabel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="rounded-xl border border-border p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">類型</span>
          <span className="text-xs font-medium text-foreground">避難收容場所</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">收容人數</span>
          <span className="text-xs font-medium text-foreground">約 200～500 人</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">狀態</span>
          <span className="text-xs font-medium text-supply">開放中</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">說明</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          此避難區域配備基本生活物資、飲用水及簡易醫療站。現場有志工及社工人員協助安置作業。
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">提供設施</h3>
        <div className="flex flex-wrap gap-2">
          {['飲用水', '帳篷', '毛毯', '簡易醫療', '充電站', '衛星電話'].map(item => (
            <span key={item} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[1300] rounded-t-2xl bg-card p-5 pb-8 shadow-elevated"
      >
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-border" />
        {content}
      </motion.div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-[400px] max-w-[90vw] rounded-2xl bg-card p-6 shadow-elevated border border-border"
      >
        {content}
      </motion.div>
    </div>
  );
};

export default RefugeZoneDetail;

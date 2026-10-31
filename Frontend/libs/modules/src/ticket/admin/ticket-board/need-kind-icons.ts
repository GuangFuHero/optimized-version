import {
  LifeBuoy,
  Package,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Each need type's icon on the board (tk-data's `TK_TASK_KIND`; 醫療 has none there). */
export const NEED_KIND_ICONS: Record<string, LucideIcon> = {
  rescue: LifeBuoy,
  hr: Users,
  supply: Package,
  medical: Stethoscope,
};

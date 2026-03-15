import { User, LogIn, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export const ROLES = [
  { id: 'victim', label: '災民', emoji: '🏠' },
  { id: 'command', label: '指揮所', emoji: '🎖️' },
  { id: 'rescue', label: '救難隊', emoji: '🆘' },
  { id: 'fire', label: '消防隊', emoji: '🚒' },
  { id: 'medical', label: '醫療團隊', emoji: '🚑' },
  { id: 'drone', label: '無人機隊伍', emoji: '🛸' },
  { id: 'local', label: '在地組織', emoji: '🏘️' },
  { id: 'online_volunteer', label: '線上志工', emoji: '💻' },
  { id: 'field_volunteer', label: '現場志工', emoji: '🤝' },
] as const;

interface UserAvatarProps {
  currentRole: string;
  onRoleChange: (role: string) => void;
}

const UserAvatar = ({ currentRole, onRoleChange }: UserAvatarProps) => {
  const activeRole = ROLES.find(r => r.id === currentRole)!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 w-11 rounded-full bg-card/90 shadow-card backdrop-blur-md hover:shadow-elevated"
        >
          <span className="text-lg">{activeRole.emoji}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[1200]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          目前角色：{activeRole.emoji} {activeRole.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <User className="mr-2 h-4 w-4" />
            切換角色
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="z-[1200]">
            {ROLES.map(role => (
              <DropdownMenuItem
                key={role.id}
                onClick={() => {
                  onRoleChange(role.id);
                  toast.success(`已切換為「${role.label}」`);
                }}
                className="min-h-[40px]"
              >
                <span className="mr-2">{role.emoji}</span>
                {role.label}
                {currentRole === role.id && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => toast.info('登入功能即將推出')} className="min-h-[40px]">
          <LogIn className="mr-2 h-4 w-4" />
          登入
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserAvatar;

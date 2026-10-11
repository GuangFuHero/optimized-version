import {
  CircleAlert,
  CircleHelp,
  Check,
  FileText,
  Grid2X2,
  MapIcon,
  MapPin,
  Newspaper,
  Package,
  Plus,
  Search,
  Settings,
  Sparkles,
  Truck,
  UserCog,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { SvgIcon, type SvgIconProps } from '@mui/material';

import { GoogleBrandIconSvg } from './generated/GoogleBrandIconSvg';
import { LineBrandIconSvg } from './generated/LineBrandIconSvg';
import { UserAvatarMarkIconSvg } from './generated/UserAvatarMarkIconSvg';

function themedIcon(component: LucideIcon) {
  return function Icon({ sx, ...props }: SvgIconProps) {
    return (
      <SvgIcon
        component={component}
        inheritViewBox
        {...props}
        sx={[{ fill: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
      />
    );
  };
}

export const Icons = {
  plus: themedIcon(Plus),
  map: themedIcon(MapIcon),
  dataGrid: themedIcon(Grid2X2),
  resources: themedIcon(Package),
  incidentLog: themedIcon(Newspaper),
  userManagement: themedIcon(UserCog),
  pin: themedIcon(MapPin),
  settings: themedIcon(Settings),
  support: themedIcon(CircleHelp),
  check: themedIcon(Check),
  close: themedIcon(X),
  details: themedIcon(FileText),
  logistics: themedIcon(Truck),
  aiAnalysis: themedIcon(Sparkles),
  warning: themedIcon(CircleAlert),
  person: themedIcon(UserRound),
  search: themedIcon(Search),
  googleBrand(props: SvgIconProps) {
    return <SvgIcon component={GoogleBrandIconSvg} inheritViewBox {...props} />;
  },
  lineBrand(props: SvgIconProps) {
    return <SvgIcon component={LineBrandIconSvg} inheritViewBox {...props} />;
  },
  userAvatarMark(props: SvgIconProps) {
    return (
      <SvgIcon component={UserAvatarMarkIconSvg} inheritViewBox {...props} />
    );
  },
};

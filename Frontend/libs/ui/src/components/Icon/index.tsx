import {
  ArrowLeftRight,
  ArrowRight,
  AtSign,
  BadgeCheck,
  Bell,
  BellOff,
  BookOpen,
  BriefcaseMedical,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  CircleX,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Grid2X2,
  HandHeart,
  Handshake,
  Hexagon,
  ImageOff,
  Info,
  LifeBuoy,
  Link,
  ListChecks,
  Lock,
  LogIn,
  MapIcon,
  MapPin,
  MapPinPlus,
  Merge,
  MessageCircle,
  Move,
  Newspaper,
  Package,
  Pencil,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Share,
  Share2,
  Shield,
  ShieldAlert,
  ShieldUser,
  SlidersHorizontal,
  Sparkles,
  SquareUserRound,
  Trash2,
  TriangleAlert,
  Truck,
  UserCog,
  UserRound,
  UserRoundCheck,
  UserRoundMinus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { SvgIcon, type SvgIconProps } from '@mui/material';

import { FacebookBrandIconSvg } from './generated/FacebookBrandIconSvg';
import { GoogleBrandIconSvg } from './generated/GoogleBrandIconSvg';
import { LineBrandIconSvg } from './generated/LineBrandIconSvg';
import { UserAvatarMarkIconSvg } from './generated/UserAvatarMarkIconSvg';
import { XBrandIconSvg } from './generated/XBrandIconSvg';

/**
 * A Lucide icon as an MUI `SvgIcon`, so it takes `sx`, `color` and `fontSize` as the theme sizes and
 * colours icons. For an icon kept outside `Icons`, such as a station type's.
 */
export function themedIcon(component: LucideIcon) {
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
  arrowLeftRight: themedIcon(ArrowLeftRight),
  arrowRight: themedIcon(ArrowRight),
  atSign: themedIcon(AtSign),
  badgeCheck: themedIcon(BadgeCheck),
  bell: themedIcon(Bell),
  bellOff: themedIcon(BellOff),
  bookOpen: themedIcon(BookOpen),
  briefcaseMedical: themedIcon(BriefcaseMedical),
  building: themedIcon(Building2),
  chevronDown: themedIcon(ChevronDown),
  chevronLeft: themedIcon(ChevronLeft),
  chevronRight: themedIcon(ChevronRight),
  chevronUp: themedIcon(ChevronUp),
  circleCheck: themedIcon(CircleCheck),
  circleMinus: themedIcon(CircleMinus),
  circleX: themedIcon(CircleX),
  clipboardList: themedIcon(ClipboardList),
  clock: themedIcon(Clock),
  copy: themedIcon(Copy),
  download: themedIcon(Download),
  ellipsis: themedIcon(Ellipsis),
  externalLink: themedIcon(ExternalLink),
  eye: themedIcon(Eye),
  eyeOff: themedIcon(EyeOff),
  globe: themedIcon(Globe),
  handHeart: themedIcon(HandHeart),
  handshake: themedIcon(Handshake),
  hexagon: themedIcon(Hexagon),
  imageOff: themedIcon(ImageOff),
  info: themedIcon(Info),
  /** The share sheet's own glyph: a box with an arrow out of it. */
  iosShare: themedIcon(Share),
  lifeBuoy: themedIcon(LifeBuoy),
  link: themedIcon(Link),
  listChecks: themedIcon(ListChecks),
  lock: themedIcon(Lock),
  logIn: themedIcon(LogIn),
  mapPinPlus: themedIcon(MapPinPlus),
  merge: themedIcon(Merge),
  messageCircle: themedIcon(MessageCircle),
  move: themedIcon(Move),
  pencil: themedIcon(Pencil),
  printer: themedIcon(Printer),
  pushPin: themedIcon(Pin),
  refresh: themedIcon(RefreshCw),
  share: themedIcon(Share2),
  shield: themedIcon(Shield),
  shieldAlert: themedIcon(ShieldAlert),
  shieldUser: themedIcon(ShieldUser),
  sliders: themedIcon(SlidersHorizontal),
  squareUser: themedIcon(SquareUserRound),
  trash: themedIcon(Trash2),
  triangleAlert: themedIcon(TriangleAlert),
  userCheck: themedIcon(UserRoundCheck),
  userMinus: themedIcon(UserRoundMinus),
  users: themedIcon(Users),
  googleBrand(props: SvgIconProps) {
    return <SvgIcon component={GoogleBrandIconSvg} inheritViewBox {...props} />;
  },
  lineBrand(props: SvgIconProps) {
    return <SvgIcon component={LineBrandIconSvg} inheritViewBox {...props} />;
  },
  facebookBrand(props: SvgIconProps) {
    return (
      <SvgIcon component={FacebookBrandIconSvg} inheritViewBox {...props} />
    );
  },
  xBrand(props: SvgIconProps) {
    return <SvgIcon component={XBrandIconSvg} inheritViewBox {...props} />;
  },
  userAvatarMark(props: SvgIconProps) {
    return (
      <SvgIcon component={UserAvatarMarkIconSvg} inheritViewBox {...props} />
    );
  },
};

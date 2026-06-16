import type { ComponentType } from 'react';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import MapRoundedIcon from '@mui/icons-material/MapRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import PriorityHighRoundedIcon from '@mui/icons-material/PriorityHighRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { SvgIcon, type SvgIconProps } from '@mui/material';

import { GoogleBrandIconSvg } from './generated/GoogleBrandIconSvg';
import { LineBrandIconSvg } from './generated/LineBrandIconSvg';
import { SearchIconSvg } from './generated/SearchIconSvg';
import { UserAvatarMarkIconSvg } from './generated/UserAvatarMarkIconSvg';

export const Icons = {
  plus: AddRoundedIcon,
  map: MapRoundedIcon,
  dataGrid: GridViewRoundedIcon,
  resources: Inventory2RoundedIcon,
  incidentLog: ArticleRoundedIcon,
  userManagement: ManageAccountsRoundedIcon,
  pin: PlaceRoundedIcon,
  settings: SettingsRoundedIcon,
  support: HelpOutlineRoundedIcon,
  check: CheckRoundedIcon,
  close: CloseRoundedIcon,
  details: DescriptionRoundedIcon,
  logistics: LocalShippingRoundedIcon,
  aiAnalysis: AutoAwesomeRoundedIcon,
  warning: PriorityHighRoundedIcon,
  person: PersonRoundedIcon,
  googleBrand(props: SvgIconProps) {
    return <SvgIcon component={GoogleBrandIconSvg} inheritViewBox {...props} />;
  },
  lineBrand(props: SvgIconProps) {
    return <SvgIcon component={LineBrandIconSvg} inheritViewBox {...props} />;
  },
  search(props: SvgIconProps) {
    return <SvgIcon component={SearchIconSvg} inheritViewBox {...props} />;
  },
  userAvatarMark(props: SvgIconProps) {
    return (
      <SvgIcon component={UserAvatarMarkIconSvg} inheritViewBox {...props} />
    );
  },
} satisfies Record<string, ComponentType<SvgIconProps>>;

// 'use client';

// import { Box, ButtonBase, Typography } from '@mui/material';
// import { useTheme } from '@mui/material/styles';

// import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

// import type { SidebarMenuItemData } from '../sidebar-menu-item';

// const PlusIcon = Icons.plus;
// const sidebarPrimaryActionTransition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

// interface SidebarPrimaryActionProps {
//   item: SidebarMenuItemData;
//   open?: boolean;
// }

// export function SidebarPrimaryAction({
//   item,
//   open = true,
// }: SidebarPrimaryActionProps) {
//   const sidebarPalette = getRescueColorScheme(useTheme()).adminShell.sidebar;

//   return (
//     <ButtonBase
//       disableRipple
//       sx={{
//         width: '100%',
//         minHeight: 32,
//         gap: open ? 2 : 0,
//         px: open ? 2 : 1,
//         py: 1,
//         borderRadius: '32px',
//         justifyContent: 'flex-start',
//         bgcolor: sidebarPalette.primaryAction,
//         color: sidebarPalette.primaryActionText,
//         transition: sidebarPrimaryActionTransition,
//         '&:hover': {
//           bgcolor: sidebarPalette.primaryActionHover,
//         },
//       }}
//     >
//       <Box
//         sx={{
//           width: 15,
//           height: 15,
//           color: sidebarPalette.primaryActionText,
//           display: 'inline-flex',
//           alignItems: 'center',
//           justifyContent: 'center',
//           flexShrink: 0,
//           '& > *': {
//             width: '100%',
//             height: '100%',
//           },
//           '& svg': {
//             display: 'block',
//             width: '100%',
//             height: '100%',
//           },
//         }}
//       >
//         {item.icon ?? <PlusIcon />}
//       </Box>
//       <Typography
//         aria-hidden={!open}
//         sx={{
//           opacity: open ? 1 : 0,
//           maxWidth: open ? 160 : 0,
//           overflow: 'hidden',
//           whiteSpace: 'nowrap',
//           my: 0,
//           color: sidebarPalette.primaryActionText,
//           fontSize: 14,
//           lineHeight: '16px',
//           fontWeight: 600,
//           letterSpacing: '0.7px',
//           textTransform: 'uppercase',
//           transition: sidebarPrimaryActionTransition,
//         }}
//       >
//         {item.label}
//       </Typography>
//     </ButtonBase>
//   );
// }

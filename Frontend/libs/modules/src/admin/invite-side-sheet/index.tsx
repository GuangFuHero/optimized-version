'use client';

import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import {
  Box,
  ButtonBase,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { type SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

const CloseIcon = Icons.close;
const WarningIcon = Icons.warning;
const InviteChevronIcon = KeyboardArrowDownRoundedIcon;
const CopyIcon = ContentCopyRoundedIcon;

const defaultInviteQrPattern = [
  '11111110000111111',
  '10000010110100001',
  '10111010010101101',
  '10111010101101101',
  '10111010010101101',
  '10000010110100001',
  '11111110101011111',
  '00000000010100000',
  '01101111100110110',
  '10010001011001001',
  '11101011101110111',
  '00110100010001100',
  '11001110111100110',
  '00000000101000000',
  '11111110110111111',
  '10000010001010001',
  '11111110111111111',
] as const;

export interface InviteSideSheetIconAction {
  ariaLabel?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface InviteSideSheetHeaderProps {
  title: string;
  subtitle: string;
  closeAction?: InviteSideSheetIconAction;
}

export interface InviteRoleOption {
  id: string;
  label: string;
}

export interface InviteRoleFieldProps {
  label: string;
  value: string;
  options?: readonly InviteRoleOption[];
  helperText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onChange?: (nextValue: string) => void;
}

export interface InviteLinkFieldProps {
  label: string;
  value: string;
  copyAction?: InviteSideSheetIconAction;
  expiryText?: string;
  expiryIcon?: ReactNode;
}

export interface InviteCredentialsCardProps {
  title: string;
  qrCode?: ReactNode;
  descriptionLines?: readonly string[];
  linkField?: InviteLinkFieldProps | null;
}

export interface InviteFooterAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
  ariaLabel?: string;
  onClick?: () => void;
}

export interface InviteFooterActionsProps {
  actions?: readonly InviteFooterAction[];
}

export interface InviteSideSheetProps {
  header?: InviteSideSheetHeaderProps;
  roleField?: InviteRoleFieldProps;
  credentialsCard?: InviteCredentialsCardProps | null;
  footer?: InviteFooterActionsProps;
  width?: number | string;
  minHeight?: number | string;
}

const defaultRoleOptions: readonly InviteRoleOption[] = [
  { id: 'super-admin', label: 'Super Admin' },
  { id: 'government', label: 'Government' },
  { id: 'ngo', label: 'NGO' },
  { id: 'volunteer', label: 'Volunteer' },
];

function createDefaultHeader(): InviteSideSheetHeaderProps {
  return {
    title: 'Invite New Member',
    subtitle: 'Generate secure access credentials.',
    closeAction: {
      ariaLabel: 'Close invite side sheet',
    },
  };
}

function createDefaultRoleField(): InviteRoleFieldProps {
  return {
    label: 'Assign Role',
    value: 'super-admin',
    options: defaultRoleOptions,
    helperText: 'Selecting a role determines system access levels.',
    ariaLabel: 'Assign role',
    onChange: () => undefined,
  };
}

function createDefaultLinkField(): InviteLinkFieldProps {
  return {
    label: 'OR SHARE INVITE LINK',
    value: 'https://cmd.sys/inv/x79k-2p8m-v4c1',
    copyAction: {
      ariaLabel: 'Copy invite link',
    },
    expiryText: 'Link expires in 48 hours.',
  };
}

function createDefaultCredentialsCard(): InviteCredentialsCardProps {
  return {
    title: 'ACCESS PROVISIONED',
    descriptionLines: [
      'Scan with authorized mobile device to',
      'authenticate.',
    ],
    linkField: createDefaultLinkField(),
  };
}

function createDefaultFooter(): InviteFooterActionsProps {
  return {
    actions: [
      {
        id: 'close',
        label: 'Close',
        variant: 'secondary',
        onClick: () => undefined,
      },
      {
        id: 'regenerate',
        label: 'Regenerate',
        variant: 'primary',
        onClick: () => undefined,
      },
    ],
  };
}

function InviteIconSlot({
  icon,
  width,
  height,
  color,
}: {
  icon?: ReactNode;
  width: number;
  height: number;
  color: string;
}) {
  if (!icon) {
    return null;
  }

  return (
    <Box
      sx={{
        width,
        height,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        '& > *': {
          width: '100%',
          height: '100%',
        },
        '& svg': {
          display: 'block',
          width: '100%',
          height: '100%',
        },
      }}
    >
      {icon}
    </Box>
  );
}

function useInviteSideSheetPalette() {
  return getRescueColorScheme(useTheme()).adminPanels.inviteSideSheet;
}

function resolveRoleLabel({
  options,
  value,
}: {
  options: readonly InviteRoleOption[];
  value: string;
}) {
  return options.find((option) => option.id === value)?.label ?? value;
}

function InviteQrCodePlaceholder() {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: `repeat(${defaultInviteQrPattern[0].length}, 1fr)`,
        gap: '1px',
        bgcolor: '#FFFFFF',
      }}
    >
      {defaultInviteQrPattern.flatMap((row, rowIndex) =>
        row.split('').map((cell, cellIndex) => (
          <Box
            key={`${rowIndex}-${cellIndex}`}
            sx={{
              bgcolor: cell === '1' ? '#151C22' : 'transparent',
            }}
          />
        )),
      )}
    </Box>
  );
}

function InviteFooterButton({ action }: { action: InviteFooterAction }) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();
  const isPrimary = action.variant === 'primary';

  return (
    <ButtonBase
      aria-label={action.ariaLabel ?? action.label}
      disableRipple
      onClick={action.onClick}
      sx={{
        minHeight: 32,
        px: 3,
        py: 1,
        borderRadius: '9999px',
        bgcolor: isPrimary
          ? inviteSideSheetPalette.actionSurface
          : 'transparent',
        color: isPrimary
          ? inviteSideSheetPalette.actionText
          : inviteSideSheetPalette.bodyText,
        transition: 'background-color 120ms ease',
        '&:hover': {
          bgcolor: isPrimary
            ? inviteSideSheetPalette.actionSurfaceHover
            : '#EDF4FD',
        },
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.6px',
          textAlign: 'center',
        }}
      >
        {action.label}
      </Typography>
    </ButtonBase>
  );
}

export function InviteSideSheetHeader({
  title,
  subtitle,
  closeAction = createDefaultHeader().closeAction,
}: InviteSideSheetHeaderProps) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  return (
    <Box
      sx={{
        px: 3,
        pt: 3,
        pb: '25px',
        borderBottom: `1px solid ${inviteSideSheetPalette.frameBorder}`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        bgcolor: inviteSideSheetPalette.frame,
      }}
    >
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: inviteSideSheetPalette.heading,
            fontSize: 20,
            lineHeight: '28px',
            fontWeight: 600,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            color: inviteSideSheetPalette.bodyText,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 400,
          }}
        >
          {subtitle}
        </Typography>
      </Stack>

      <ButtonBase
        aria-label={closeAction?.ariaLabel ?? 'Close invite side sheet'}
        disableRipple
        onClick={closeAction?.onClick}
        sx={{
          width: 30,
          height: 30,
          p: 1,
          borderRadius: '9999px',
          color: inviteSideSheetPalette.heading,
          flexShrink: 0,
        }}
      >
        <InviteIconSlot
          icon={closeAction?.icon ?? <CloseIcon />}
          width={14}
          height={14}
          color={inviteSideSheetPalette.heading}
        />
      </ButtonBase>
    </Box>
  );
}

export function InviteRoleField({
  label,
  value,
  options = defaultRoleOptions,
  helperText,
  ariaLabel,
  disabled = false,
  onChange,
}: InviteRoleFieldProps) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  const handleChange = (event: SelectChangeEvent<string>) => {
    onChange?.(event.target.value);
  };

  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      <Typography
        sx={{
          color: inviteSideSheetPalette.heading,
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.6px',
        }}
      >
        {label}
      </Typography>

      <Select
        displayEmpty
        fullWidth
        disabled={disabled}
        IconComponent={InviteChevronIcon}
        onChange={handleChange}
        value={value}
        inputProps={{ 'aria-label': ariaLabel ?? label }}
        renderValue={(selectedValue) =>
          resolveRoleLabel({ options, value: String(selectedValue) })
        }
        sx={{
          minHeight: 58,
          bgcolor: inviteSideSheetPalette.roleSurface,
          borderRadius: '16px',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: inviteSideSheetPalette.frameBorder,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: inviteSideSheetPalette.frameBorder,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: inviteSideSheetPalette.frameBorder,
            borderWidth: 1,
          },
          '& .MuiSelect-select': {
            px: '17px',
            py: '17px',
            pr: '48px',
            color: inviteSideSheetPalette.heading,
            fontSize: 16,
            lineHeight: '24px',
            fontWeight: 400,
            display: 'flex',
            alignItems: 'center',
          },
          '& .MuiSelect-icon': {
            right: 16,
            color: inviteSideSheetPalette.bodyText,
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.id} value={option.id}>
            {option.label}
          </MenuItem>
        ))}
      </Select>

      {helperText ? (
        <Typography
          sx={{
            color: inviteSideSheetPalette.bodyText,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 400,
          }}
        >
          {helperText}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function InviteLinkField({
  label,
  value,
  copyAction,
  expiryText,
  expiryIcon,
}: InviteLinkFieldProps) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Typography
        sx={{
          color: inviteSideSheetPalette.bodyText,
          fontSize: 10,
          lineHeight: '12px',
          fontWeight: 700,
          letterSpacing: '0.8px',
        }}
      >
        {label}
      </Typography>

      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            border: `1px solid ${inviteSideSheetPalette.frameBorder}`,
            borderRadius: '16px',
            bgcolor: inviteSideSheetPalette.frame,
            px: '17px',
            py: '9px',
            overflow: 'hidden',
          }}
        >
          <Typography
            sx={{
              color: inviteSideSheetPalette.bodyText,
              fontFamily: 'Liberation Mono, monospace',
              fontSize: 14,
              lineHeight: '20px',
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'center',
            }}
          >
            {value}
          </Typography>
        </Box>

        <ButtonBase
          aria-label={copyAction?.ariaLabel ?? 'Copy invite link'}
          disableRipple
          onClick={copyAction?.onClick}
          sx={{
            width: 38,
            height: 38,
            borderRadius: '16px',
            bgcolor: inviteSideSheetPalette.copySurface,
            color: inviteSideSheetPalette.copyText,
            flexShrink: 0,
            '&:hover': {
              bgcolor: inviteSideSheetPalette.copySurfaceHover,
            },
          }}
        >
          <InviteIconSlot
            icon={copyAction?.icon ?? <CopyIcon />}
            width={14}
            height={14}
            color={inviteSideSheetPalette.copyText}
          />
        </ButtonBase>
      </Box>

      {expiryText ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pt: 0.5 }}>
          <InviteIconSlot
            icon={expiryIcon ?? <WarningIcon />}
            width={12}
            height={14}
            color={inviteSideSheetPalette.warningText}
          />
          <Typography
            sx={{
              color: inviteSideSheetPalette.warningText,
              fontSize: 10,
              lineHeight: '12px',
              fontWeight: 700,
              letterSpacing: '0.8px',
            }}
          >
            {expiryText}
          </Typography>
        </Box>
      ) : null}
    </Stack>
  );
}

export function InviteCredentialsCard({
  title,
  qrCode,
  descriptionLines = [],
  linkField,
}: InviteCredentialsCardProps) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  return (
    <Stack
      spacing={2}
      sx={{
        width: '100%',
        bgcolor: inviteSideSheetPalette.bodySurface,
        border: `1px solid ${inviteSideSheetPalette.frameBorder}`,
        borderRadius: '16px',
        px: '25px',
        py: '25px',
        alignItems: 'center',
      }}
    >
      <Box
        sx={{
          width: '100%',
          borderBottom: `1px solid ${inviteSideSheetPalette.frameBorder}`,
          pb: '9px',
        }}
      >
        <Typography
          sx={{
            color: inviteSideSheetPalette.heading,
            fontSize: 14,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '1.4px',
          }}
        >
          {title}
        </Typography>
      </Box>

      <Box
        sx={{
          width: 192,
          height: 192,
          p: '10px',
          borderRadius: '16px',
          border: `2px solid ${inviteSideSheetPalette.qrBorder}`,
          bgcolor: inviteSideSheetPalette.frame,
          flexShrink: 0,
        }}
      >
        {qrCode ?? <InviteQrCodePlaceholder />}
      </Box>

      {descriptionLines.length > 0 ? (
        <Stack spacing={0} sx={{ alignItems: 'center' }}>
          {descriptionLines.map((line) => (
            <Typography
              key={line}
              sx={{
                color: inviteSideSheetPalette.bodyText,
                fontSize: 14,
                lineHeight: '20px',
                fontWeight: 400,
                textAlign: 'center',
              }}
            >
              {line}
            </Typography>
          ))}
        </Stack>
      ) : null}

      {linkField ? <InviteLinkField {...linkField} /> : null}
    </Stack>
  );
}

export function InviteFooterActions({
  actions = createDefaultFooter().actions,
}: InviteFooterActionsProps) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        px: 2,
        pt: '17px',
        pb: 2,
        borderTop: `1px solid ${inviteSideSheetPalette.frameBorder}`,
        bgcolor: inviteSideSheetPalette.frame,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        {actions.map((action) => (
          <InviteFooterButton key={action.id} action={action} />
        ))}
      </Box>
    </Box>
  );
}

export function InviteSideSheet({
  header = createDefaultHeader(),
  roleField = createDefaultRoleField(),
  credentialsCard = createDefaultCredentialsCard(),
  footer = createDefaultFooter(),
  width = 400,
  minHeight = 960,
}: InviteSideSheetProps) {
  const inviteSideSheetPalette = useInviteSideSheetPalette();

  return (
    <Box
      component="aside"
      sx={{
        width,
        maxWidth: '100%',
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: inviteSideSheetPalette.frame,
        borderLeft: `1px solid ${inviteSideSheetPalette.frameBorder}`,
      }}
    >
      <InviteSideSheetHeader {...header} />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: 3,
        }}
      >
        <Stack spacing={3} sx={{ width: '100%' }}>
          <InviteRoleField {...roleField} />
          {credentialsCard ? (
            <InviteCredentialsCard {...credentialsCard} />
          ) : null}
        </Stack>
      </Box>

      <InviteFooterActions actions={footer.actions} />
    </Box>
  );
}

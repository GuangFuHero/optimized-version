'use client';

import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import {
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { floorName } from '../../building/floors';
import { useBuilding } from '../../building/use-building';

const { color, radius } = designTokens;

/** `room`'s column (backend `check_lengths`), as the free-text field elsewhere in the form. */
const ROOM_MAX_LENGTH = 20;

interface BuildingPlaceProps {
  buildingUuid: string;
  /** The building's label for the floor; empty when the requester does not know it. */
  floor: string;
  room: string;
  onRoomChange: (room: string) => void;
  /** 改成其他地點: the form asks for a landmark and an address again, as for any request. */
  onLeave: () => void;
}

/**
 * Where a request filed from a building's floor is (prototype `SiteTicketCreateDrawer`, its card for a
 * floor picked): the building and the floor, already answered by the tap that opened the form, so not
 * asked again as a landmark and an address. On a floor the building divides into areas, the area is
 * picked from them (the backend takes one of them or 其他); on any other, the room is typed. A way out
 * stays, for whoever tapped the wrong floor.
 */
export function BuildingPlace({
  buildingUuid,
  floor,
  room,
  onRoomChange,
  onLeave,
}: BuildingPlaceProps) {
  const { building, hasData } = useBuilding(buildingUuid);
  const areas =
    building?.floors.find((candidate) => candidate.label === floor)?.areas ??
    [];

  return (
    <Stack data-field="address" spacing={1.5}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.secondary.subtle,
          border: `1px solid ${color.border.default}`,
        }}
      >
        <ApartmentRoundedIcon
          sx={{ fontSize: 18, color: color.fg.neutral.subtle }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: displayTextSize[13],
              lineHeight: 1.4,
              fontWeight: 600,
            }}
          >
            {/* 3F, not 3F 樓: the floor is the building's own name for it. */}
            {[
              building?.name ?? (hasData ? '這一棟已經不在了' : '載入中...'),
              floor ? floorName(floor) : '不確定在哪一層',
            ].join('　')}
          </Typography>
          {building?.address ? (
            <Typography
              sx={{
                fontSize: displayTextSize[11],
                lineHeight: 1.5,
                color: color.fg.neutral.subtle,
              }}
            >
              {building.address}
            </Typography>
          ) : null}
        </Box>
      </Box>

      {areas.length > 0 ? (
        <TextField
          select
          label="在這一層的哪一區"
          size="small"
          value={room}
          onChange={(event) => onRoomChange(event.target.value)}
        >
          <MenuItem value="">不確定</MenuItem>
          {areas.map((area) => (
            <MenuItem key={area} value={area}>
              {area}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <TextField
          label="戶／室"
          size="small"
          value={room}
          onChange={(event) => onRoomChange(event.target.value)}
          placeholder="302室"
          slotProps={{ htmlInput: { maxLength: ROOM_MAX_LENGTH } }}
        />
      )}

      <Button
        variant="text"
        size="small"
        onClick={onLeave}
        sx={{ alignSelf: 'flex-start', minHeight: 44 }}
      >
        改成其他地點
      </Button>
    </Stack>
  );
}

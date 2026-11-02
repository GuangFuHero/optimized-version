'use client';

import {
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { designTokens, displayTextSize, Icons } from '@rescue-frontend/ui';

import { floorName } from '../../building/floors';
import type { BuildingMap } from '../../building/use-building';

const { color, radius } = designTokens;

/** `room`'s column (backend `check_lengths`), as the free-text field elsewhere in the form. */
const ROOM_MAX_LENGTH = 20;

interface BuildingPlaceProps {
  /** As `useBuilding` read it: null until then, and for one deleted since. */
  building: BuildingMap | null;
  /** `useBuilding`'s `hasData`: read, or found deleted. */
  loaded: boolean;
  /** `useBuilding`'s `error`: it could not be read. */
  failed: boolean;
  /** The building's label for the floor; empty when the requester does not know it. */
  floor: string;
  /** The floor's areas, ending with 其他; empty where the room is typed instead. */
  areas: readonly string[];
  /** None of `areas` picked, once the form was tried. */
  areaMissing: boolean;
  room: string;
  onRoomChange: (room: string) => void;
  /** 改成其他地點: the form asks for a landmark and an address again, as for any request. */
  onLeave: () => void;
}

function buildingLine(
  building: BuildingMap | null,
  loaded: boolean,
  failed: boolean,
) {
  if (building) {
    return building.name;
  }
  if (loaded) {
    return '這一棟已經不在了';
  }

  return failed ? '這一棟的資料載入失敗' : '載入中…';
}

/**
 * Where a request filed from a building's floor is (prototype `SiteTicketCreateDrawer`, its card for a
 * floor picked): the building and the floor, already answered by the tap that opened the form, so not
 * asked again as a landmark and an address. On a floor the building divides into areas, one of them
 * must be picked, 其他 for whoever is not sure (the backend takes nothing else); on any other, the room
 * is typed. Neither until the building is read, as which one it is depends on it. A way out stays, for
 * whoever tapped the wrong floor.
 */
export function BuildingPlace({
  building,
  loaded,
  failed,
  floor,
  areas,
  areaMissing,
  room,
  onRoomChange,
  onLeave,
}: BuildingPlaceProps) {
  let roomField = null;

  if (loaded && areas.length > 0) {
    roomField = (
      <Box data-field="area">
        <TextField
          select
          required
          fullWidth
          label="在這一層的哪一區"
          size="small"
          // Blank until one is picked: a room the menu does not offer, as a draft can hold, is none.
          value={areas.includes(room) ? room : ''}
          onChange={(event) => onRoomChange(event.target.value)}
          error={areaMissing}
          helperText={
            areaMissing ? '必填，不確定就選「其他」' : '不確定就選「其他」'
          }
        >
          {areas.map((area) => (
            <MenuItem key={area} value={area}>
              {area}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    );
  } else if (loaded) {
    roomField = (
      <TextField
        label="戶／室"
        size="small"
        value={room}
        onChange={(event) => onRoomChange(event.target.value)}
        placeholder="302室"
        slotProps={{
          htmlInput: { maxLength: ROOM_MAX_LENGTH, autoComplete: 'off' },
        }}
      />
    );
  }

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
        <Icons.building
          sx={{
            fontSize: designTokens.iconSize.md,
            color: color.fg.neutral.subtle,
          }}
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
              buildingLine(building, loaded, failed),
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

      {roomField}

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

import { z } from 'zod';

export const reverseGeocodeResponse = z.object({
  address: z.string(),
  county: z.string(),
  city: z.string(),
  lane: z.string(),
  alley: z.string(),
  no: z.string(),
  floor: z.string(),
  room: z.string(),
});

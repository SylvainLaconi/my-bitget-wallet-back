import { z } from 'zod';

export const BitgetCoinSchema = z.object({
  coin: z.string(),
  available: z.string(),
  frozen: z.string(),
  locked: z.string(),
  limitAvailable: z.string(),
  uTime: z.string(),
});

export type BitgetCoin = z.infer<typeof BitgetCoinSchema>;

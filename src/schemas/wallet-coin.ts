import { z } from 'zod';

export const WalletCoinSchema = z.object({
  id: z.string(),
  token: z.string(),
  available: z.number(),
  frozen: z.number(),
  locked: z.number(),
  limitAvailable: z.number(),
  uTime: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string(),
  tokenId: z.string(),
});

export type WalletCoin = z.infer<typeof WalletCoinSchema>;

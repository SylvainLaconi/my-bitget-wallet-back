import { z } from 'zod';
import { WalletCoinSchema } from './wallet-coin';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  password: z.string(),
  wallet: z.array(WalletCoinSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

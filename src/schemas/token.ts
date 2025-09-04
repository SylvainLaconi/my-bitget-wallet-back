import { z } from 'zod';

export const tokenInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ticker: z.string().min(1, 'Ticker is required'),
});

export const tokenOutputSchema = z.object({
  id: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  name: z.string(),
  ticker: z.string(),
});

export type TokenInput = z.infer<typeof tokenInputSchema>;
export type TokenOutput = z.infer<typeof tokenOutputSchema>;

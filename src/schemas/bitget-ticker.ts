import { z } from 'zod';

export const BitgetTickerSchema = z.object({
  instId: z.string(),
  lastPr: z.string(),
  open24h: z.string(),
  high24h: z.string(),
  low24h: z.string(),
  change24h: z.string(),
  bidPr: z.string(),
  askPr: z.string(),
  bidSz: z.string(),
  askSz: z.string(),
  baseVolume: z.string(),
  quoteVolume: z.string(),
  openUtc: z.string(),
  changeUtc24h: z.string(),
  ts: z.string(),
});

export type BitgetTicker = z.infer<typeof BitgetTickerSchema>;

import { z } from 'zod';

export const BitgetOrderSchema = z.object({
  instId: z.string(),
  orderId: z.string(),
  clientOid: z.string(),
  size: z.string(),
  newSize: z.string(),
  notional: z.string(),
  orderType: z.string(),
  force: z.string(),
  side: z.string(),
  fillPrice: z.string(),
  tradeId: z.string(),
  baseVolume: z.string(),
  fillTime: z.string(),
  fillFee: z.string(),
  fillFeeCoin: z.string(),
  tradeScope: z.string(),
  accBaseVolume: z.string(),
  priceAvg: z.string(),
  status: z.string(),
  cTime: z.string(),
  uTime: z.string(),
  stpMode: z.string(),
  feeDetail: z.array(
    z.object({
      feeCoin: z.string(),
      fee: z.string(),
    }),
  ),
  enterPointSource: z.string(),
});

export type BitgetOrder = z.infer<typeof BitgetOrderSchema>;

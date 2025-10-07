import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './prisma';
import { authMiddleware } from './middlewares/auth';
import { decrypt } from './utils/crypto';
import { connectBitget, BitgetPayload, Channel, getEarnQuantity } from './bitget';

import authRoutes from './routes/auth';
import tokensRoutes from './routes/tokens';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:5173';

app.use(
  cors({
    origin: FRONT_URL,
    methods: 'GET, POST, OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tokens', tokensRoutes);
app.get('/keep-alive', (req, res) => {
  console.info('🔄 Keep-alive');
  res.send('OK');
});

// Typage clients SSE
type SSEClient = { res: Response; userId: string };
let clients: SSEClient[] = [];

// Connexion WS Bitget par user
const userWS: Record<string, boolean> = {};

app.get('/stream', authMiddleware, async (req, res: Response) => {
  const userId = req.userId!;
  if (!userId) return res.status(401).end();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).end();

  // --- Headers SSE ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Ajouter client SSE
  const client: SSEClient = { res, userId };
  clients.push(client);
  console.info(`👥 Client SSE connecté pour userId=${userId} (${clients.length} total)`);

  // --- Snapshot initial depuis DB ---
  const initialWallet = await prisma.walletCoin.findMany({
    where: { userId },
    include: { token: true },
    orderBy: { token: { ticker: 'asc' } },
  });

  res.write(`event: snapshot\ndata: ${JSON.stringify(initialWallet)}\n\n`);

  // --- WS unifié Bitget ---
  if (user.apiKey && user.apiSecret && user.passphrase && !userWS[userId]) {
    let earnQuantity = '0';
    userWS[userId] = true;

    const symbols = initialWallet.map((c) => `${c.token.ticker}USDT`);

    connectBitget(
      decrypt(user.apiKey),
      decrypt(user.apiSecret),
      decrypt(user.passphrase),
      [
        { channel: 'account', instType: 'SPOT', isPrivate: true, coin: 'default' },
        { channel: 'orders', instType: 'SPOT', isPrivate: true, instId: 'default' },
        ...symbols.map((s) => ({
          channel: 'ticker' as Channel,
          instType: 'SPOT',
          instId: s,
          isPrivate: false,
        })),
      ],
      async (payload: BitgetPayload) => {
        // --- Wallet snapshot/update ---
        if (payload.type === 'accountSnapshot') {
          for (const coin of payload.data) {
            const token = await prisma.token.upsert({
              where: { ticker: coin.coin },
              update: {},
              create: { ticker: coin.coin, name: coin.coin },
            });

            // Récupérer les quantités EARN pour le coin
            try {
              const res = await getEarnQuantity(
                coin.coin,
                decrypt(user.apiKey!),
                decrypt(user.apiSecret!),
                decrypt(user.passphrase!),
              );

              earnQuantity = res.find((r: any) => r.coin === coin.coin)?.amount || 0;
            } catch (error) {
              console.error('Error getting earn quantity:', error);
            }
            await prisma.walletCoin.upsert({
              where: { userId_tokenId: { userId, tokenId: token.id } },
              update: {
                available: parseFloat(coin.available),
                frozen: parseFloat(coin.frozen),
                locked: parseFloat(coin.locked),
                limitAvailable: parseFloat(coin.limitAvailable),
                earnQuantity: parseFloat(earnQuantity),
                uTime: coin.uTime,
              },
              create: {
                userId,
                tokenId: token.id,
                available: parseFloat(coin.available),
                frozen: parseFloat(coin.frozen),
                locked: parseFloat(coin.locked),
                limitAvailable: parseFloat(coin.limitAvailable),
                earnQuantity: parseFloat(earnQuantity),
                uTime: coin.uTime,
              },
              include: { token: true },
            });
          }

          const wallet = await prisma.walletCoin.findMany({
            where: { userId },
            include: { token: true },
            orderBy: { token: { ticker: 'asc' } },
          });

          clients
            .filter((c) => c.userId === userId)
            .forEach((c) => c.res.write(`event: snapshot\ndata: ${JSON.stringify(wallet)}\n\n`));
        }

        if (payload.type === 'accountUpdate') {
          const coin = payload.data;
          const token = await prisma.token.upsert({
            where: { ticker: coin.coin },
            update: {},
            create: { ticker: coin.coin, name: coin.coin },
          });

          try {
            const res = await getEarnQuantity(
              coin.coin,
              decrypt(user.apiKey!),
              decrypt(user.apiSecret!),
              decrypt(user.passphrase!),
            );
            earnQuantity = res.find((r: any) => r.coin === coin.coin)?.amount || '0';
          } catch (error) {
            console.error('Error getting earn quantity:', error);
          }

          const updatedCoin = await prisma.walletCoin.upsert({
            where: { userId_tokenId: { userId, tokenId: token.id } },
            update: {
              available: parseFloat(coin.available),
              frozen: parseFloat(coin.frozen),
              locked: parseFloat(coin.locked),
              limitAvailable: parseFloat(coin.limitAvailable),
              earnQuantity: parseFloat(earnQuantity),
              uTime: coin.uTime,
            },
            create: {
              userId,
              tokenId: token.id,
              available: parseFloat(coin.available),
              frozen: parseFloat(coin.frozen),
              locked: parseFloat(coin.locked),
              limitAvailable: parseFloat(coin.limitAvailable),
              earnQuantity: parseFloat(earnQuantity),
              uTime: coin.uTime,
            },
            include: { token: true },
          });

          clients
            .filter((c) => c.userId === userId)
            .forEach((c) => c.res.write(`event: update\ndata: ${JSON.stringify(updatedCoin)}\n\n`));
        }

        // --- Orders snapshot/update ---
        if (payload.type === 'ordersSnapshot' || payload.type === 'ordersUpdate') {
          clients
            .filter((c) => c.userId === userId)
            .forEach((c) =>
              c.res.write(`event: orders\ndata: ${JSON.stringify(payload.data)}\n\n`),
            );
        }

        // --- Prix marché ---
        if (payload.type === 'ticker') {
          clients
            .filter((c) => c.userId === userId)
            .forEach((c) => c.res.write(`event: price\ndata: ${JSON.stringify(payload.data)}\n\n`));
        }
      },
    );
  }

  // Keep-alive SSE
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: "keep-alive"\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients = clients.filter((c) => c !== client);
    console.info(`❌ Client SSE déconnecté userId=${userId} (${clients.length} restants)`);
  });
});

app.listen(PORT, () => {
  console.info(`✅ Server running on http://localhost:${PORT}`);
});

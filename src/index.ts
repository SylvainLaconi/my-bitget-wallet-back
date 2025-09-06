import express, { Request, Response } from 'express';
import { authMiddleware } from './middlewares/auth';
import { connectBitgetWallet } from './bitget';
import { prisma } from './prisma';
import { BitgetCoin } from './schemas/bitget-coin';
import authRoutes from './routes/auth';
import tokensRoutes from './routes/tokens';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { decrypt } from './utils/crypto';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:5173';

const corsOptions = {
  origin: FRONT_URL,
  methods: 'GET, POST, OPTIONS',
  allowedHeaders: 'Content-Type, Authorization',
  credentials: true,
};

// Middleware CORS (simple)
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tokens', tokensRoutes);

// Typage pour les clients SSE
type SSEClient = {
  res: Response;
  userId: string;
};

// Liste des clients connectés
let clients: SSEClient[] = [];
const userWebSockets: Record<string, WebSocket> = {};

// Endpoint SSE avec auth
app.get('/stream', authMiddleware, async (req, res: Response) => {
  const userId = req.userId!;
  if (!userId) return res.status(401).end();

  // Récupérer l'utilisateur
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).end();

  // --- Headers SSE ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Ajouter le client
  const client: SSEClient = { res, userId };
  clients.push(client);
  console.info(`👥 Client SSE connecté pour userId=${userId} (${clients.length} total)`);

  // --- Snapshot initial depuis la DB ---
  const initialWallet = await prisma.walletCoin.findMany({
    where: { userId },
    include: { token: true },
    orderBy: { token: { ticker: 'asc' } },
  });

  res.write(`event: snapshot\ndata: ${JSON.stringify(initialWallet)}\n\n`);

  // --- Démarrage du WS Bitget (si pas déjà actif pour ce user) ---
  if (user.apiKey && user.apiSecret && user.passphrase && !userWebSockets[userId]) {
    connectBitgetWallet(
      userId,
      decrypt(user.apiKey),
      decrypt(user.apiSecret),
      decrypt(user.passphrase),
      async (payload) => {
        if ('snapshot' in payload) {
          // 💾 Snapshot complet depuis WS → replace en DB
          for (const coin of payload.snapshot) {
            const token = await prisma.token.upsert({
              where: { ticker: coin.coin },
              update: {},
              create: { ticker: coin.coin, name: coin.coin },
            });

            await prisma.walletCoin.upsert({
              where: { userId_tokenId: { userId, tokenId: token.id } },
              update: {
                available: parseFloat(coin.available),
                frozen: parseFloat(coin.frozen),
                locked: parseFloat(coin.locked),
                limitAvailable: parseFloat(coin.limitAvailable),
                uTime: coin.uTime,
              },
              create: {
                userId,
                tokenId: token.id,
                available: parseFloat(coin.available),
                frozen: parseFloat(coin.frozen),
                locked: parseFloat(coin.locked),
                limitAvailable: parseFloat(coin.limitAvailable),
                uTime: coin.uTime,
              },
            });
          }

          // 🔥 Push snapshot aux clients SSE
          const wallet = await prisma.walletCoin.findMany({
            where: { userId },
            include: { token: true },
            orderBy: { token: { ticker: 'asc' } },
          });

          clients
            .filter((c) => c.userId === userId)
            .forEach((c) => c.res.write(`event: snapshot\ndata: ${JSON.stringify(wallet)}\n\n`));
        }

        if ('update' in payload) {
          const coin = payload.update;

          const token = await prisma.token.upsert({
            where: { ticker: coin.coin },
            update: {},
            create: { ticker: coin.coin, name: coin.coin },
          });

          const updatedCoin = await prisma.walletCoin.upsert({
            where: { userId_tokenId: { userId, tokenId: token.id } },
            update: {
              available: parseFloat(coin.available),
              frozen: parseFloat(coin.frozen),
              locked: parseFloat(coin.locked),
              limitAvailable: parseFloat(coin.limitAvailable),
              uTime: coin.uTime,
            },
            create: {
              userId,
              tokenId: token.id,
              available: parseFloat(coin.available),
              frozen: parseFloat(coin.frozen),
              locked: parseFloat(coin.locked),
              limitAvailable: parseFloat(coin.limitAvailable),
              uTime: coin.uTime,
            },
            include: { token: true },
          });

          // 🔥 Push update aux clients SSE
          clients
            .filter((c) => c.userId === userId)
            .forEach((c) => c.res.write(`event: update\ndata: ${JSON.stringify(updatedCoin)}\n\n`));
        }
      },
      () => {
        delete userWebSockets[userId];
      },
    );
  }

  // Keep-alive ping
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: "keep-alive"\n\n`);
  }, 15000);

  // Déconnexion client
  req.on('close', () => {
    clearInterval(keepAlive);
    clients = clients.filter((c) => c !== client);
    console.info(`❌ Client SSE déconnecté userId=${userId} (${clients.length} restants)`);
  });
});

app.listen(PORT, () => {
  console.info(`✅ Server running on http://localhost:${PORT}`);
});

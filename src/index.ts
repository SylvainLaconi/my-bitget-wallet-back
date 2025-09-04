import express, { Request, Response } from 'express';
import { authMiddleware } from './middlewares/auth';
import { connectBitgetWallet } from './bitget';
import { prisma } from './prisma';
import { BitgetCoin } from './schemas/bitget-coin';
import authRoutes from './routes/auth';
import tokensRoutes from './routes/tokens';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:3000';

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

// // Liste des clients connectés
// let clients: SSEClient[] = [];

// // Endpoint SSE avec auth
// app.get('/stream', authMiddleware, async (req: Request, res: Response) => {
//   const userId = req.userId!;
//   if (!userId) return res.status(401).end();

//   // Headers SSE
//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//   res.flushHeaders();

//   // Ajouter le client
//   const client: SSEClient = { res, userId };
//   clients.push(client);
//   console.log(`👥 Client SSE connecté pour userId=${userId} (${clients.length} total)`);

//   // --- Charger les coins depuis la BDD ---
//   const wallet = await prisma.walletCoin.findMany({ where: { userId } });
//   wallet.forEach((coin) => res.write(`data: ${JSON.stringify(coin)}\n\n`));

//   // Ping keep-alive
//   const keepAlive = setInterval(() => {
//     res.write(`event: ping\ndata: "keep-alive"\n\n`);
//   }, 15000);

//   // Déconnexion du client
//   req.on('close', () => {
//     clearInterval(keepAlive);
//     clients = clients.filter((c) => c !== client);
//     console.log(`❌ Client SSE déconnecté userId=${userId} (${clients.length} restants)`);
//   });
// });

// // Connexion Bitget
// connectBitgetWallet(async (coin: BitgetCoin & { userId: string }) => {
//   let tokenId: string;

//   const token = await prisma.token.findUnique({
//     where: {
//       ticker: coin.coin,
//     },
//   });

//   if (!token) {
//     // create token
//     const newToken = await prisma.token.create({
//       data: {
//         ticker: coin.coin,
//         name: coin.coin,
//       },
//     });
//     tokenId = newToken.id;
//   } else {
//     tokenId = token.id;
//   }

//   // Upsert en BDD
//   await prisma.walletCoin.upsert({
//     where: {
//       userId_tokenId: {
//         userId: coin.userId,
//         tokenId,
//       },
//     },
//     update: {
//       available: parseFloat(coin.available),
//       frozen: parseFloat(coin.frozen),
//       locked: parseFloat(coin.locked),
//       limitAvailable: parseFloat(coin.limitAvailable),
//       uTime: coin.uTime,
//     },
//     create: {
//       available: parseFloat(coin.available),
//       frozen: parseFloat(coin.frozen),
//       locked: parseFloat(coin.locked),
//       limitAvailable: parseFloat(coin.limitAvailable),
//       uTime: coin.uTime,
//       userId: coin.userId,
//       tokenId,
//     },
//   });

//   // Envoyer uniquement aux clients correspondants
//   clients
//     .filter((c) => c.userId === coin.userId)
//     .forEach((c) => c.res.write(`data: ${JSON.stringify(coin)}\n\n`));
// });

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

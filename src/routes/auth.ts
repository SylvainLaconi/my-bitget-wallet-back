import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middlewares/auth';
import { encrypt } from '../utils/crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

// Inscription
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email, password: hashed },
    });
    res.json({ id: user.id, email: user.email });
  } catch (e) {
    res.status(400).json({ error: 'Utilisateur déjà existant' });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(401).json({ error: 'Utilisateur inconnu' });

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect' });

  const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

  res.json({ accessToken, user: { id: user.id, email: user.email } });
});

// Informations de l'utilisateur
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.userId!;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'Utilisateur inconnu' });

  res.json({ id: user.id, email: user.email });
});

// Renseigner les clés API Bitget
router.post('/bitget-api', authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const { apiKey, apiSecret, passphrase } = req.body;

  if (!apiKey || !apiSecret || !passphrase) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: encrypt(apiKey),
      apiSecret: encrypt(apiSecret),
      passphrase: encrypt(passphrase),
    },
  });

  res.json({ message: 'Clés Bitget sauvegardées ✅' });
});

// Mettre à jour les clés API Bitget
router.put('/bitget-api', authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const { apiKey, apiSecret, passphrase } = req.body;

  if (!apiKey || !apiSecret || !passphrase) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: encrypt(apiKey),
      apiSecret: encrypt(apiSecret),
      passphrase: encrypt(passphrase),
    },
  });

  res.json({ message: 'Clés Bitget sauvegardées ✅' });
});

export default router;

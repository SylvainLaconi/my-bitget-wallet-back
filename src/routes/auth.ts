import { Router } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middlewares/auth';

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

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

  // Set HTTP-only cookie
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 3600_000, // 1h
    domain: process.env.FRONT_DOMAIN,
  });

  res.json({ token, user: { id: user.id, email: user.email } });
});

// Déconnexion
router.post('/logout', (req, res) => {
  // Supprime le cookie en le réinitialisant
  res.cookie('jwt', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 0, // expire immédiatement
    path: '/',
    domain: process.env.FRONT_DOMAIN,
  });
  res.json({ message: 'Déconnecté' });
});

// Informations de l'utilisateur
router.get('/me', authMiddleware, async (req, res) => {
  // on récupére le userId de l'utilisateur
  const userId = (req as any).userId!;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'Utilisateur inconnu' });

  // on renvoie les informations de l'utilisateur
  res.json({ id: user.id, email: user.email });
});

export default router;

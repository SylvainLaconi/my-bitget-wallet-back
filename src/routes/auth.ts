import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middlewares/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

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
  // const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

  // // Set HTTP-only cookie
  // res.cookie('refreshToken', refreshToken, {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === 'production',
  //   sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  //   maxAge: 7 * 24 * 60 * 60 * 1000,
  // });

  res.json({ accessToken, user: { id: user.id, email: user.email } });
});

// // REFRESH TOKEN
// router.get('/refresh-token', (req: Request, res: Response) => {
//   const token = req.cookies.refreshToken;
//   if (!token) return res.status(401).json({ error: 'Non authentifié' });

//   try {
//     const payload = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
//     const newAccessToken = jwt.sign({ userId: payload.userId }, JWT_SECRET, { expiresIn: '15m' });
//     res.json({ accessToken: newAccessToken });
//   } catch {
//     return res.status(401).json({ error: 'Refresh token invalide' });
//   }
// });

// // Déconnexion
// router.post('/logout', (req: Request, res: Response) => {
//   // Supprime le cookie en le réinitialisant
//   res.cookie('refreshToken', '', {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === 'production',
//     sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
//     maxAge: 0, // expire immédiatement
//   });
//   res.json({ message: 'Déconnecté' });
// });

// Informations de l'utilisateur
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  // on récupére le userId de l'utilisateur
  const userId = (req as any).userId!;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'Utilisateur inconnu' });

  // on renvoie les informations de l'utilisateur
  res.json({ id: user.id, email: user.email });
});

export default router;

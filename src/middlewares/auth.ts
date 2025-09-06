import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// JWT_SECRET est défini dans le fichier .env
const JWT_SECRET = process.env.JWT_SECRET!;

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['authorization']?.split(' ')[1] || req.query.token?.toString();
  if (!token) return res.status(401).json({ error: 'Non authentifié' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };

    req.userId = payload.userId;
    next();
  } catch (e) {
    console.error(e);
    return res.status(401).json({ error: 'Token invalide' });
  }
}

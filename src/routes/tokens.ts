import { Router } from "express";
import { prisma } from "../prisma";
import { tokenInputSchema, tokenOutputSchema, TokenInput, TokenOutput } from "../schemas/token";

const router = Router();

// GET /tokens
router.get("/", async (_req, res) => {
  const tokens: TokenOutput[] = (await prisma.token.findMany()).map((token: TokenOutput) => tokenOutputSchema.parse(token));
  res.json(tokens);
});

// POST /tokens
router.post("/", async (req, res) => {
  try {
    const validatedData: TokenInput = tokenInputSchema.parse(req.body);

    const token = await prisma.token.create({
      data: validatedData,
    });

    const parsedToken: TokenOutput = tokenOutputSchema.parse(token);

    res.status(201).json(parsedToken);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Unknown error" });
    }
  }
});

export default router;

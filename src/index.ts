import express from "express";
import tokenRoutes from "./routes/tokens";

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware pour parser le JSON
app.use(express.json());

// Route pour les tokens
app.use("/tokens", tokenRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

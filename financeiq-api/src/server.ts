import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import openFinanceRoutes from './routes/openFinanceRoutes';
import indicatorsRoutes from './routes/indicatorsRoutes';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'FinanceIQ API funcionando corretamente.',
    timestamp: new Date().toISOString()
  });
});

app.use('/open-finance', openFinanceRoutes);

app.use('/indicators', indicatorsRoutes);

app.use((req, res) => {
  return res.status(404).json({
    error: true,
    message: 'Rota não encontrada.'
  });
});

app.listen(PORT, () => {
  console.log(`FinanceIQ API rodando na porta ${PORT}`);
});
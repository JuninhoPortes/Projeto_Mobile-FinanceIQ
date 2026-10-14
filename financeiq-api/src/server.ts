import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config();

const app = createApp();

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FinanceIQ API rodando na porta ${PORT}`);
});

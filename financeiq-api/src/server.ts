import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config();

if (process.env.RECEIPT_ANALYSIS_MODE === 'real') {
  console.error('Modo real exige uma entrada explícita: piloto ou npm run receipts:backend na raiz.');
  process.exitCode = 1;
} else {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FinanceIQ API rodando na porta ${PORT}`);
  });
}

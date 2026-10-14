import express, { Request, Response, type RequestHandler } from 'express';
import cors from 'cors';
import openFinanceRoutes from './routes/openFinanceRoutes';
import indicatorsRoutes from './routes/indicatorsRoutes';
import { createReceiptRoutes } from './routes/receiptRoutes';
import { createFirebaseTokenVerifier } from './services/firebaseAdminService';
import type { ReceiptTokenVerifier } from './types/receiptAuth';

interface ReceiptAuthDependencies {
  verifyToken?: ReceiptTokenVerifier;
  pilotUIDs?: string;
  receiptAnalysis?: RequestHandler;
}

// Separada do listen para testar as rotas reais sem credenciais ou serviços externos.
export function createApp(dependencies: ReceiptAuthDependencies = {}) {
  const app = express();
  app.use(cors());

  // Parser multipart exclusivo da rota, após autenticação/autorização e quotas.
  app.use('/receipts', createReceiptRoutes(
    dependencies.verifyToken ?? createFirebaseTokenVerifier(),
    dependencies.pilotUIDs ?? process.env.RECEIPT_PILOT_UIDS,
    dependencies.receiptAnalysis
  ));

  app.use(express.json());
  app.get('/health', (_req: Request, res: Response) => {
    return res.status(200).json({
      status: 'ok',
      message: 'FinanceIQ API funcionando corretamente.',
      timestamp: new Date().toISOString()
    });
  });
  app.use('/open-finance', openFinanceRoutes);
  app.use('/indicators', indicatorsRoutes);
  app.use((_req: Request, res: Response) => {
    return res.status(404).json({ error: true, message: 'Rota não encontrada.' });
  });
  return app;
}

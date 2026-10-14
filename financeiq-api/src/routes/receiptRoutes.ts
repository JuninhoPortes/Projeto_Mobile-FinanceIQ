import { Router, type RequestHandler } from 'express';
import { analyzeReceipt } from '../controllers/receiptController';
import { createReceiptAuthentication, createReceiptAuthorization } from '../middleware/receiptAuth';
import type { ReceiptTokenVerifier } from '../types/receiptAuth';
import { createReceiptUpload } from '../middleware/receiptUpload';

export function createReceiptRoutes(verifyToken: ReceiptTokenVerifier, pilotUIDs?: string, upload: RequestHandler = createReceiptUpload()) {
  const router = Router();
  router.post('/analyze', createReceiptAuthentication(verifyToken), createReceiptAuthorization(pilotUIDs), upload, analyzeReceipt);
  return router;
}

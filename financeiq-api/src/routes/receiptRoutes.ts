import { Router } from 'express';
import { analyzeReceipt } from '../controllers/receiptController';
import { createReceiptAuthentication, createReceiptAuthorization } from '../middleware/receiptAuth';
import type { ReceiptTokenVerifier } from '../types/receiptAuth';

export function createReceiptRoutes(verifyToken: ReceiptTokenVerifier, pilotUIDs?: string) {
  const router = Router();
  router.post('/analyze', createReceiptAuthentication(verifyToken), createReceiptAuthorization(pilotUIDs), analyzeReceipt);
  return router;
}

import { Router } from 'express';

import { openFinanceController } from '../controllers/openFinanceController';

const router = Router();

router.get('/accounts/:userId', openFinanceController.getAccounts);

router.get('/balances/:userId', openFinanceController.getBalances);

router.get('/transactions/:userId', openFinanceController.getTransactions);

router.post('/sync/:userId', openFinanceController.syncTransactions);

export default router;
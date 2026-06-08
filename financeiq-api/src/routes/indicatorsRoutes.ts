import { Router } from 'express';

import { indicatorsController } from '../controllers/indicatorsController';

const router = Router();

router.get('/selic', indicatorsController.getSelic);

router.get('/ipca', indicatorsController.getIpca);

router.get('/dollar', indicatorsController.getDollar);

router.get('/summary', indicatorsController.getSummary);

export default router;
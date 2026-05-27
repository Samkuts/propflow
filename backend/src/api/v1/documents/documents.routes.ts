import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as ctrl from './documents.controller';

const router = Router();
router.use(authenticate);

router.post('/upload-url', ctrl.requestUpload);
router.get('/', ctrl.list);
router.get('/:id/download-url', ctrl.getDownloadUrl);
router.delete('/:id', ctrl.remove);

export default router;

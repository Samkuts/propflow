import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireManager } from '../../../middleware/rbac.middleware';
import * as ctrl from './messages.controller';

const router = Router();
router.use(authenticate);

router.get('/inbox', ctrl.inbox);
router.get('/sent', ctrl.sent);
router.get('/unread-count', ctrl.unreadCount);
router.get('/recipients', ctrl.recipients);
router.post('/broadcast', requireManager, ctrl.broadcast);
router.post('/', ctrl.send);
router.patch('/mark-all-read', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);

export default router;

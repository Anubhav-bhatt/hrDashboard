const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getUsers,
  getUserById,
  updateUserStatus,
  getActivities
} = require('../controllers/adminController');

// All admin routes require an authenticated user with ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id/status', updateUserStatus);
router.get('/activities', getActivities);
router.get('/activity', getActivities);

module.exports = router;

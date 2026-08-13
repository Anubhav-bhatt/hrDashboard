const express = require('express');
const router = express.Router();
const outlookController = require('../controllers/outlookController');

// Microsoft OAuth Endpoints
router.get('/connect', outlookController.connectOutlook);
router.get('/callback', outlookController.handleCallback);
router.get('/status', outlookController.getOutlookStatus);
router.post('/disconnect', outlookController.disconnectOutlook);

// Folder Discovery Endpoint
router.get('/folders', outlookController.getFolders);

module.exports = router;


const prisma = require('../config/prisma');
const microsoftAuthService = require('../services/microsoftAuthService');
const outlookService = require('../services/outlookService');

/**
 * @desc    Initiate Microsoft OAuth 2.0 PKCE authentication flow
 * @route   GET /api/outlook/connect
 * @access  Public
 */
const connectOutlook = async (req, res, next) => {
  try {
    const authUrl = await microsoftAuthService.getAuthUrl();
    return res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Handle Microsoft OAuth 2.0 redirect callback using Prisma
 * @route   GET /api/outlook/callback
 * @access  Public
 */
const handleCallback = async (req, res, next) => {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: `Microsoft OAuth Error: ${error_description || error}`
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is missing from callback.'
      });
    }

    const tokenResponse = await microsoftAuthService.acquireTokenByCode(code);
    // outlookService exposes getCurrentUser; the previous getUserProfile call
    // did not exist and threw a TypeError on every successful OAuth return.
    const userProfile = await outlookService.getCurrentUser(tokenResponse.accessToken);

    const microsoftUserId = userProfile.id || (tokenResponse.account && tokenResponse.account.homeAccountId);
    const email = userProfile.email || (tokenResponse.account && tokenResponse.account.username);
    const displayName = userProfile.displayName || (tokenResponse.account && tokenResponse.account.name) || 'HR Recruiter';

    if (!microsoftUserId || !email) {
      return res.status(502).json({
        success: false,
        code: 'OUTLOOK_PROFILE_UNAVAILABLE',
        message: 'Microsoft did not return enough account information to complete the connection.'
      });
    }

    await prisma.outlookConnection.upsert({
      where: { microsoftUserId },
      update: {
        email,
        displayName,
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken || null,
        expiresAt: tokenResponse.expiresOn ? new Date(tokenResponse.expiresOn) : null
      },
      create: {
        microsoftUserId,
        email,
        displayName,
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken || null,
        expiresAt: tokenResponse.expiresOn ? new Date(tokenResponse.expiresOn) : null
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}?outlook_connected=true`);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get active Outlook connection status using Prisma
 * @route   GET /api/outlook/status
 * @access  Public
 */
const getOutlookStatus = async (req, res, next) => {
  try {
    const connection = await prisma.outlookConnection.findFirst({
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        connectedAt: true
      }
    });

    if (!connection) {
      return res.status(200).json({
        success: true,
        data: { connected: false }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        connected: true,
        email: connection.email,
        displayName: connection.displayName,
        connectedAt: connection.connectedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Outlook mail folders using Prisma
 * @route   GET /api/outlook/folders
 * @access  Public
 */
const getFolders = async (req, res, next) => {
  try {
    const connection = await prisma.outlookConnection.findFirst({
      orderBy: { connectedAt: 'desc' }
    });

    // Previously this fell back to a mock token and returned invented folders,
    // which looked like a real mailbox to the recruiter. An unconnected mailbox
    // is now reported as such.
    if (!connection || !connection.accessToken) {
      return res.status(409).json({
        success: false,
        code: 'OUTLOOK_NOT_CONNECTED',
        message: 'Microsoft Outlook is not connected. Connect your mailbox to browse mail folders.'
      });
    }

    const folders = await outlookService.getMailFolders(connection.accessToken);

    return res.status(200).json({
      success: true,
      data: folders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Disconnect active Outlook connection using Prisma
 * @route   POST /api/outlook/disconnect
 * @access  Public
 */
const disconnectOutlook = async (req, res, next) => {
  try {
    await prisma.outlookConnection.deleteMany({});
    return res.status(200).json({
      success: true,
      message: 'Outlook disconnected successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  connectOutlook,
  handleCallback,
  getOutlookStatus,
  getFolders,
  disconnectOutlook
};

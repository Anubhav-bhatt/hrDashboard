const msal = require('@azure/msal-node');

const SCOPES = ['User.Read', 'Mail.Read'];

/**
 * Creates MSAL Confidential Client Application configuration
 */
const getMsalConfig = () => {
  const clientId = process.env.MICROSOFT_CLIENT_ID || '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || '';
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret
    }
  };
};

/**
 * Checks if real Microsoft OAuth credentials are configured
 * @returns {boolean}
 */
const isOAuthConfigured = () => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  return Boolean(clientId && clientSecret && clientId !== 'your_microsoft_client_id_here');
};

/**
 * Generates Auth Code URL for Microsoft Login
 */
const getAuthCodeUrl = async () => {
  if (!isOAuthConfigured()) {
    // If credentials are not configured, return fallback direct redirect callback URL for mock mode testing
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/api/outlook/callback';
    return `${redirectUri}?code=MOCK_AUTH_CODE`;
  }

  const pca = new msal.ConfidentialClientApplication(getMsalConfig());
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/api/outlook/callback';

  const authCodeUrlParameters = {
    scopes: SCOPES,
    redirectUri,
    prompt: 'select_account'
  };

  return await pca.getAuthCodeUrl(authCodeUrlParameters);
};

/**
 * Exchanges authorization code for Access & Refresh Tokens
 */
const acquireTokenByCode = async (code) => {
  if (!isOAuthConfigured() || code === 'MOCK_AUTH_CODE') {
    // Return realistic mock tokens for development testing when credentials aren't set
    return {
      accessToken: 'MOCK_ACCESS_TOKEN_' + Date.now(),
      refreshToken: 'MOCK_REFRESH_TOKEN_' + Date.now(),
      expiresOn: new Date(Date.now() + 3600 * 1000),
      account: {
        homeAccountId: 'mock-user-id-12345',
        username: 'hr.manager@acmecorp.com',
        name: 'HR Recruitment Team'
      }
    };
  }

  const pca = new msal.ConfidentialClientApplication(getMsalConfig());
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/api/outlook/callback';

  const tokenRequest = {
    code,
    scopes: SCOPES,
    redirectUri
  };

  const response = await pca.acquireTokenByCode(tokenRequest);
  return response;
};

module.exports = {
  isOAuthConfigured,
  getAuthCodeUrl,
  acquireTokenByCode,
  SCOPES
};

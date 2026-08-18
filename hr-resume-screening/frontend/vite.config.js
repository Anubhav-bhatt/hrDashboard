import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server configuration.
 *
 * The proxy exists to remove a recurring local-setup trap. `VITE_API_URL` has to
 * name a host, and the moment that host is a machine's LAN IP the setup rots: the
 * address changes on the next DHCP lease, and because the session cookie is
 * `sameSite=lax`, a page served from `localhost` while the API is addressed by IP
 * is treated as cross-site, so the cookie is silently never sent. The symptom is
 * a sign-in screen that hangs rather than an error that names the cause.
 *
 * Setting `VITE_API_URL=/api` avoids all of it: requests go to the page's own
 * origin and Vite forwards them, so there is no cross-origin request, no CORS
 * preflight, no cookie question, and no machine-specific address in anyone's
 * configuration.
 *
 * This is additive and opt-in. `services/api.js` still defaults to
 * `http://localhost:5000/api` when `VITE_API_URL` is unset, so an existing setup
 * and every production build behave exactly as before — a proxy only applies to
 * the dev server, which production never runs.
 *
 * The target is configurable through `VITE_DEV_API_PROXY` for anyone running the
 * backend on another port, and defaults to localhost. No machine's address is
 * committed here.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_API_PROXY || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: false
        }
      }
    }
  };
});

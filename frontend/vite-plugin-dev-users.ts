import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

interface DevUser {
  name: string;
  email: string;
  token: string;
}

/**
 * Dev-only multi-login support. Reads a gitignored `dev-users.json` (relative to the Vite
 * root, i.e. `frontend/`) and exposes:
 *   - GET  /__dev_users    → the list of authenticated identities
 *   - POST /__switch_user  → rewrite VITE_AGENT_TOKEN in the .env files + restart the server
 * The browser pill (UserSwitcher) uses these to switch the active user.
 */
export function devUsers(): Plugin {
  return {
    name: 'dev-users',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      const usersFile = path.resolve(root, 'dev-users.json');
      // Token lives in both env files (see dev.sh); keep them in sync on switch.
      const envFiles = [
        path.resolve(root, '.env'),
        path.resolve(root, '../examples/starter/.env'),
      ];

      const readUsers = (): DevUser[] => {
        try {
          const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
          return Array.isArray(parsed) ? (parsed as DevUser[]) : [];
        } catch {
          return [];
        }
      };

      server.middlewares.use('/__dev_users', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(readUsers()));
      });

      server.middlewares.use('/__switch_user', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', () => {
          let token = '';
          try {
            token = (JSON.parse(body) as { token?: string }).token ?? '';
          } catch {
            /* invalid body → handled below */
          }
          // Only ever write a token we already know about.
          if (!token || !readUsers().some((u) => u.token === token)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'unknown token' }));
            return;
          }
          const line = `VITE_AGENT_TOKEN=${token}`;
          for (const file of envFiles) {
            try {
              if (!fs.existsSync(file)) continue;
              const content = fs.readFileSync(file, 'utf8');
              const next = /^VITE_AGENT_TOKEN=.*$/m.test(content)
                ? content.replace(/^VITE_AGENT_TOKEN=.*$/m, line)
                : `${content.endsWith('\n') || content === '' ? content : `${content}\n`}${line}\n`;
              fs.writeFileSync(file, next);
            } catch {
              /* best-effort: a missing/unwritable env file shouldn't block the switch */
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
          // Restart after responding so the client receives its 200 first.
          setTimeout(() => {
            void server.restart();
          }, 50);
        });
      });
    },
  };
}

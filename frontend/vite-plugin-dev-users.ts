import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

interface DevUser {
  name: string;
  email: string;
  token: string;
  /** Worker the identity is authenticated against; distinguishes the same email across envs. */
  workerUrl?: string;
}

/** Set or append `KEY=value` in a dotenv file's contents. */
function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const sep = content === '' || content.endsWith('\n') ? '' : '\n';
  return `${content}${sep}${line}\n`;
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
      const frontendEnv = path.resolve(root, '.env');
      const starterEnv = path.resolve(root, '../examples/starter/.env');

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
          // Only ever switch to a token we already know about.
          const user = readUsers().find((u) => u.token === token);
          if (!token || !user) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'unknown token' }));
            return;
          }
          // Switching identities may also mean switching environments (prod ↔ dev),
          // so rewrite the URL vars alongside the token. Both env files carry the token;
          // each carries a different subset of URL vars (see dev.sh / setup.sh).
          const wsBase = (user.workerUrl ?? '')
            .replace(/^https:\/\//, 'wss://')
            .replace(/^http:\/\//, 'ws://');
          const fileVars: Array<[string, Array<[string, string]>]> = [
            [
              frontendEnv,
              [
                ['VITE_AGENT_TOKEN', user.token],
                ...(user.workerUrl
                  ? ([
                      ['VITE_SERVER_URL', user.workerUrl],
                      ['VITE_WS_URL', wsBase],
                    ] as Array<[string, string]>)
                  : []),
              ],
            ],
            [
              starterEnv,
              [
                ['VITE_AGENT_TOKEN', user.token],
                ...(wsBase ? ([['VITE_GAME_URL', `${wsBase}/ws`]] as Array<[string, string]>) : []),
              ],
            ],
          ];
          for (const [file, vars] of fileVars) {
            try {
              if (!fs.existsSync(file)) continue;
              let content = fs.readFileSync(file, 'utf8');
              for (const [key, value] of vars) content = setEnvLine(content, key, value);
              fs.writeFileSync(file, content);
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

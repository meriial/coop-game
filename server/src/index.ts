import { GameRoom } from './game-room';

interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/ws') {
      const id = env.GAME_ROOM.idFromName('main-room');
      return env.GAME_ROOM.get(id).fetch(request);
    }

    return new Response(
      JSON.stringify({ status: 'ok', game: 'Workshop Pixel Art', ws: '/ws' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  },
} satisfies ExportedHandler<Env>;

export { GameRoom };

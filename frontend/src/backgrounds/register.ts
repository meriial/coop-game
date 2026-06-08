// Side-effect module: registers all built-in backgrounds. Import once before the
// registry is read (useWebSocket imports this so defaults resolve at startup).
import { register } from './registry';
import { shiftingGrid } from './shifting-grid';

register(shiftingGrid);

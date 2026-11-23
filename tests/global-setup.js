import { startRelay } from './relay.mjs';
export default async function () {
  const wss = startRelay(8787);
  return async () => new Promise((r) => wss.close(r));
}

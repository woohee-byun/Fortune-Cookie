import warm from './messages.json';
import witty from './messages_witty.json';

// Kept as separate arrays so a tone toggle can be added later.
export const messages = { warm: warm as string[], witty: witty as string[] };
const pool = [...messages.warm, ...messages.witty];
let lastIndex = -1;

/** Random message from the combined pool, never the same one twice in a row. */
export function pickMessage(): string {
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1) while (i === lastIndex) i = Math.floor(Math.random() * pool.length);
  lastIndex = i;
  return pool[i];
}

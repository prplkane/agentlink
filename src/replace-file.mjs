import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Windows may deny opening or replacing a name while another handle is closing.
// Preserve the operation's original error if access remains denied.
export async function retryWindowsSharing(operation, deadline = Infinity, signal) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await operation(); }
    catch (cause) {
      const remaining = deadline - Date.now();
      if (process.platform !== 'win32' || remaining <= 0 || attempt === 5 || !['EACCES', 'EPERM', 'EBUSY'].includes(cause.code)) throw cause;
      await delay(Math.min(remaining, 50 * (attempt + 1)), undefined, { signal });
    }
  }
}

export function replaceFile(source, destination) {
  return retryWindowsSharing(() => rename(source, destination));
}

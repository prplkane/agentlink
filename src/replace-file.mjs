import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Windows readers can briefly prevent replacing an otherwise writable file.
// Retry the same atomic rename; never unlink the destination to make it succeed.
export async function replaceFile(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(source, destination); }
    catch (cause) {
      if (process.platform !== 'win32' || attempt === 5 || !['EACCES', 'EPERM', 'EBUSY'].includes(cause.code)) throw cause;
      await delay(50 * (attempt + 1));
    }
  }
}

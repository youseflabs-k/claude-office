import { open, stat } from 'node:fs/promises';
import { PROBE_CHUNK } from '../config.js';

const KEYS = ['sessionId', 'cwd', 'gitBranch', 'aiTitle', 'slug', 'version', 'timestamp'];

// Transcripts reach 100MB+. Metadata lives in the first and last few lines, so
// read only the head and tail — this stays constant-time in file size.
export async function probeSession(path) {
  const { size } = await stat(path);
  const meta = { sizeBytes: size };

  const fh = await open(path, 'r');
  try {
    const chunks = [];

    const headLen = Math.min(PROBE_CHUNK, size);
    const head = Buffer.alloc(headLen);
    await fh.read(head, 0, headLen, 0);
    chunks.push(head);

    if (size > PROBE_CHUNK * 2) {
      const tail = Buffer.alloc(PROBE_CHUNK);
      await fh.read(tail, 0, PROBE_CHUNK, size - PROBE_CHUNK);
      chunks.push(tail);
    }

    for (const chunk of chunks) {
      for (const line of chunk.toString('utf8').split('\n')) {
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue; // truncated boundary line, or not a record
        }
        if (!parsed || typeof parsed !== 'object') continue;
        for (const key of KEYS) {
          if (parsed[key] != null && meta[key] === undefined) meta[key] = parsed[key];
        }
      }
    }

    return meta;
  } finally {
    await fh.close();
  }
}

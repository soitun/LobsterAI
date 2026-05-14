import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.tsx': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
};

interface PreviewSession {
  rootDir: string;
  token: string;
  filePath: string;
}

let server: http.Server | null = null;
let serverPort: number | null = null;
const sessions = new Map<string, PreviewSession>();

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const token = parsedUrl.searchParams.get('token');

  // URL format: /{sessionId}/relative/path/to/file
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 1) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const sessionId = parts[0];
  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404);
    res.end('Session Not Found');
    return;
  }

  if (token !== session.token) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const relativePath = parts.slice(1).join('/') || path.basename(session.filePath);
  const resolvedPath = path.resolve(session.rootDir, relativePath);

  // Path traversal protection
  if (!resolvedPath.startsWith(session.rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(resolvedPath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    });

    const stream = fs.createReadStream(resolvedPath);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
  });
}

export async function startHtmlPreviewServer(): Promise<number> {
  if (server && serverPort) {
    return serverPort;
  }

  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      try {
        handleRequest(req, res);
      } catch (e) {
        console.error('[HtmlPreviewServer] Request error:', e);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      }
    });

    s.on('error', (err) => {
      console.error('[HtmlPreviewServer] Server error:', err);
      reject(err);
    });

    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
        server = s;
        console.log(`[HtmlPreviewServer] Started on port ${serverPort}`);
        resolve(serverPort);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
  });
}

export async function stopHtmlPreviewServer(): Promise<void> {
  if (!server) return;

  return new Promise((resolve) => {
    server!.close(() => {
      console.log('[HtmlPreviewServer] Stopped');
      server = null;
      serverPort = null;
      sessions.clear();
      resolve();
    });
  });
}

export async function createPreviewSession(filePath: string): Promise<{ sessionId: string; url: string }> {
  const port = await startHtmlPreviewServer();
  const sessionId = crypto.randomBytes(16).toString('hex');
  const token = crypto.randomBytes(24).toString('hex');
  const rootDir = path.dirname(path.resolve(filePath)) + path.sep;
  const fileName = path.basename(filePath);

  sessions.set(sessionId, { rootDir, token, filePath: path.resolve(filePath) });

  const url = `http://127.0.0.1:${port}/${sessionId}/${encodeURIComponent(fileName)}?token=${token}`;
  return { sessionId, url };
}

export function destroyPreviewSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function isPreviewServerUrl(url: string): boolean {
  if (!serverPort) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === '127.0.0.1' && parsed.port === String(serverPort);
  } catch {
    return false;
  }
}

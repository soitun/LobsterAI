/**
 * MiniMax Image Understanding (VLM)
 *
 * 使用 MiniMax Coding Plan VLM 接口分析图片内容。
 * 支持 HTTP/HTTPS URL 和本地文件路径。
 *
 * Usage:
 *   node understand_image.js --image <url|path> --prompt <text>
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// --------------- config ---------------

const API_KEY = process.env.MINIMAX_API_KEY;
const API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';

// --------------- arg parsing ---------------

function parseArgs(argv) {
  const args = { image: null, prompt: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--image' || a === '-i') && argv[i + 1]) {
      args.image = argv[++i];
    } else if ((a === '--prompt' || a === '-p') && argv[i + 1]) {
      args.prompt = argv[++i];
    }
  }
  return args;
}

// --------------- helpers ---------------

function fail(msg) {
  console.log(JSON.stringify({ success: false, error: msg }));
  process.exit(1);
}

function detectFormat(contentTypeOrPath) {
  const s = contentTypeOrPath.toLowerCase();
  if (s.includes('png')) return 'png';
  if (s.includes('webp')) return 'webp';
  if (s.includes('jpeg') || s.includes('jpg')) return 'jpeg';
  return 'jpeg'; // default
}

/**
 * Download an HTTP/HTTPS URL and return { buffer, format }.
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'MiniMax-Skill/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} downloading image`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        resolve({ buffer, format: detectFormat(ct) });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Read a local file and return { buffer, format }.
 */
function readLocalImage(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const buffer = fs.readFileSync(abs);
  return { buffer, format: detectFormat(abs) };
}

/**
 * Convert image to base64 data URL.
 */
async function toDataUrl(imageSource) {
  let result;
  if (/^https?:\/\//i.test(imageSource)) {
    result = await downloadImage(imageSource);
  } else {
    result = readLocalImage(imageSource);
  }
  const b64 = result.buffer.toString('base64');
  return `data:image/${result.format};base64,${b64}`;
}

/**
 * Call MiniMax VLM API.
 */
function callVlm(prompt, imageDataUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_HOST}/v1/coding_plan/vlm`);
    const body = JSON.stringify({ prompt, image_url: imageDataUrl });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'MM-API-Source': 'Minimax-MCP',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          const data = JSON.parse(raw);
          resolve(data);
        } catch {
          reject(new Error(`Invalid JSON response: ${raw.slice(0, 500)}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --------------- main ---------------

async function main() {
  const args = parseArgs(process.argv);

  if (!API_KEY) {
    fail('MINIMAX_API_KEY 环境变量未设置。请设置后重试。');
  }
  if (!args.image) {
    fail('缺少 --image 参数。请提供图片 URL 或本地文件路径。');
  }
  if (!args.prompt) {
    fail('缺少 --prompt 参数。请提供对图片的分析请求。');
  }

  try {
    const dataUrl = await toDataUrl(args.image);
    const resp = await callVlm(args.prompt, dataUrl);

    const baseResp = resp.base_resp || {};
    if (baseResp.status_code !== 0) {
      fail(`API Error [${baseResp.status_code}]: ${baseResp.status_msg || 'unknown'}`);
    }

    const content = resp.content || '';
    if (!content) {
      fail('API 返回了空内容');
    }

    console.log(JSON.stringify({ success: true, content }));
  } catch (e) {
    fail(e.message || String(e));
  }
}

main();

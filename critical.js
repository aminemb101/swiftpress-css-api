import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { critical } from 'critical';
import morgan from 'morgan';
import PQueue from 'p-queue';
import optimizeMinimalCss from './minimal.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(directory, 'public', 'css');
const port = Number(process.env.PORT) || 3000;
const queue = new PQueue({ concurrency: 1 });
const jobs = new Map();

await mkdir(outputDirectory, { recursive: true });

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(morgan('combined'));

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function jobResponse(job, baseUrl) {
  return {
    id: job.id,
    status: job.status,
    strategy: job.strategy,
    url: job.url,
    ...(job.error ? { error: job.error } : {}),
    ...(job.status === 'completed'
      ? { resultUrl: `${baseUrl}/api/css/jobs/${job.id}/css` }
      : {}),
    statusUrl: `${baseUrl}/api/css/jobs/${job.id}`,
  };
}

async function optimizeCss(strategy, url) {
  if (strategy === 'minimal') return optimizeMinimalCss(url);

  const result = await critical({ src: url, inline: false });
  if (typeof result?.css !== 'string') {
    throw new Error('critical did not return CSS');
  }
  return result.css;
}

async function notifyCallback(callbackUrl, payload) {
  if (!callbackUrl) return;

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`Callback returned HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`Callback failed: ${error.message}`);
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * Create a CSS optimization job.
 * Body: { url, strategy: "critical" | "minimal", callbackUrl? }
 */
app.post('/api/css/jobs', async (req, res) => {
  const { url, strategy = 'critical', callbackUrl } = req.body ?? {};

  if (typeof url !== 'string') {
    return res.status(400).json({ error: 'url must be a valid HTTP(S) URL' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'url must be a valid HTTP(S) URL' });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are supported' });
  }
  if (!['critical', 'minimal'].includes(strategy)) {
    return res.status(400).json({ error: 'strategy must be "critical" or "minimal"' });
  }
  if (callbackUrl !== undefined) {
    try {
      const parsedCallback = new URL(callbackUrl);
      if (!['http:', 'https:'].includes(parsedCallback.protocol)) throw new Error();
    } catch {
      return res.status(400).json({ error: 'callbackUrl must be a valid HTTP(S) URL' });
    }
  }

  const job = {
    id: randomUUID(),
    status: 'queued',
    strategy,
    url: parsedUrl.toString(),
    callbackUrl,
    filename: `${randomUUID()}.css`,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  const baseUrl = getBaseUrl(req);

  queue.add(async () => {
    job.status = 'processing';
    try {
      const css = await optimizeCss(job.strategy, job.url);
      await writeFile(path.join(outputDirectory, job.filename), css, 'utf8');
      job.status = 'completed';
      await notifyCallback(job.callbackUrl, {
        status: job.status,
        id: job.id,
        url: job.url,
        resultUrl: `${baseUrl}/api/css/jobs/${job.id}/css`,
      });
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'CSS optimization failed';
      await notifyCallback(job.callbackUrl, {
        status: job.status,
        id: job.id,
        url: job.url,
        error: job.error,
      });
      console.error(`CSS job ${job.id} failed:`, error);
    }
  }).catch((error) => console.error('Could not enqueue CSS job:', error));

  return res.status(202).json(jobResponse(job, baseUrl));
});

app.get('/api/css/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(jobResponse(job, getBaseUrl(req)));
});

app.get('/api/css/jobs/:id/css', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') {
    return res.status(409).json({ error: 'CSS is not ready', status: job.status });
  }
  return res.type('text/css').download(path.join(outputDirectory, job.filename));
});

app.listen(port, () => {
  console.log(`CSS optimization API listening on http://localhost:${port}`);
});

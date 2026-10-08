import fs from 'node:fs/promises';
import path from 'node:path';
import { extname } from 'node:path';

const BASE_URL = (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com').replace(/\/$/, '');
const API_KEY = process.env.AGNES_API_KEY || '';
const VISION_MODEL = process.env.AGNES_VISION_MODEL || 'agnes-2.5-flash';
const IMAGE_MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.5-flash';
const VISION_FALLBACK = process.env.AGNES_VISION_FALLBACK_MODEL || 'agnes-2.0-flash';
const IMAGE_FALLBACK = process.env.AGNES_IMAGE_FALLBACK_MODEL || 'agnes-image-2.1-flash';
const VISION_TIMEOUT_MS = Number(process.env.AGNES_VISION_TIMEOUT_MS || 180000);
const IMAGE_TIMEOUT_MS = Number(process.env.AGNES_IMAGE_TIMEOUT_MS || 300000);

function requireKey() {
  if (!API_KEY) throw new Error('AGNES_API_KEY is not configured.');
}

function mimeFor(file) {
  const ext = extname(file).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[ext] || 'application/octet-stream';
}

export async function fileToDataUri(file) {
  const data = await fs.readFile(file);
  return `data:${mimeFor(file)};base64,${data.toString('base64')}`;
}

async function requestJson(endpoint, body, timeoutMs = VISION_TIMEOUT_MS) {
  requireKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      const message = data?.error?.message || data?.message || text || `HTTP ${res.status}`;
      const err = new Error(`Agnes API ${res.status}: ${message}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeImage(file, prompt, model = VISION_MODEL) {
  const imageUrl = await fileToDataUri(file);
  const body = {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }],
    max_tokens: 4096
  };
  try {
    return { model, response: await requestJson('/v1/chat/completions', body) };
  } catch (err) {
    if ((err.status === 400 || err.status === 404 || err.status === 422) && model !== VISION_FALLBACK) {
      return { model: VISION_FALLBACK, response: await requestJson('/v1/chat/completions', { ...body, model: VISION_FALLBACK }) };
    }
    throw err;
  }
}

export async function generateImage({ prompt, size = '2K', ratio = '9:16', images = [], model = IMAGE_MODEL, responseFormat = 'url' }) {
  const body = {
    model,
    prompt,
    size,
    ratio,
    extra_body: { response_format: responseFormat }
  };
  if (images.length) body.extra_body.image = images;
  try {
    return { model, response: await requestJson('/v1/images/generations', body, IMAGE_TIMEOUT_MS) };
  } catch (err) {
    if ((err.status === 400 || err.status === 404 || err.status === 422) && model !== IMAGE_FALLBACK) {
      const fallbackBody = { ...body, model: IMAGE_FALLBACK };
      delete fallbackBody.ratio;
      return { model: IMAGE_FALLBACK, response: await requestJson('/v1/images/generations', fallbackBody, IMAGE_TIMEOUT_MS) };
    }
    throw err;
  }
}

export function extractText(response) {
  const text = response?.choices?.[0]?.message?.content ?? '';
  if (!text) {
    const shape = response && typeof response === 'object' ? Object.keys(response).join(', ') : 'none';
    throw new Error(`Agnes Vision returned an empty response. Expected choices[0].message.content. Top-level keys: ${shape}`);
  }
  return text;
}

export function extractImages(response) {
  return response?.data || [];
}

export function configSummary() {
  return {
    apiKey: Boolean(API_KEY),
    baseUrl: BASE_URL,
    visionModel: VISION_MODEL,
    visionFallback: VISION_FALLBACK,
    imageModel: IMAGE_MODEL,
    imageFallback: IMAGE_FALLBACK,
    visionTimeoutMs: VISION_TIMEOUT_MS,
    imageTimeoutMs: IMAGE_TIMEOUT_MS
  };
}

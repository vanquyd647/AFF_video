/* ═══ Gemini API Service (Server-side) ═══ */
import crypto from 'crypto';
import config from '../config.js';

const BASE_URL = config.geminiBaseUrl;

// ─── Encrypt/Decrypt API Key ───
const ALGO = 'aes-256-gcm';
const KEY = crypto.scryptSync(config.appSecret, 'salt', 32);

export function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decryptApiKey(encrypted) {
  try {
    const [ivHex, tagHex, data] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new Error('API key decryption failed');
  }
}

// ─── Validate API Key ───
export async function validateApiKey(apiKey) {
  try {
    const res = await fetch(`${BASE_URL}/models?key=${apiKey}`);
    if (!res.ok) throw new Error('Invalid key');
    const data = await res.json();
    return { valid: true, models: data.models?.map(m => m.name) || [] };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── Generate Text (with images) ───
export async function generateText(apiKey, modelId, prompt, images = []) {
  const parts = [];

  // Add text prompt
  parts.push({ text: prompt });

  // Add images
  if (images?.length) {
    for (const img of images) {
      parts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.data,
        }
      });
    }
  }

  const url = `${BASE_URL}/models/${modelId}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 16384,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join('') || '';

  // Extract token usage
  const usage = data.usageMetadata || {};
  const tokenUsage = {
    promptTokens: usage.promptTokenCount || 0,
    completionTokens: usage.candidatesTokenCount || 0,
    totalTokens: usage.totalTokenCount || 0,
  };

  return { text, tokenUsage };
}

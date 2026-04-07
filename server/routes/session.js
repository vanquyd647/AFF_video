/* ═══ Session Routes ═══ */
import { Router } from 'express';
import {
  createSession, getSession, updateSession,
  saveSessionImages, savePortrait, saveSettings, saveResult, deleteSession,
} from '../services/sessionManager.js';
import { encryptApiKey, decryptApiKey, validateApiKey } from '../services/gemini.js';

const router = Router();

// ─── Create Session ───
router.post('/', async (req, res, next) => {
  try {
    const session = await createSession();
    res.json({ token: session.token, session: sanitize(session) });
  } catch (err) { next(err); }
});

// ─── Get Session ───
router.get('/', async (req, res, next) => {
  try {
    const session = req.session;
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session: sanitize(session) });
  } catch (err) { next(err); }
});

// ─── Save API Key (encrypted) ───
router.post('/apikey', async (req, res, next) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });

    // Validate first
    const validation = await validateApiKey(apiKey);
    if (!validation.valid) {
      return res.status(401).json({ error: 'API key không hợp lệ', details: validation.error });
    }

    // Encrypt and save
    const encrypted = encryptApiKey(apiKey);
    await updateSession(req.session.token, { apiKeyEncrypted: encrypted });

    res.json({ valid: true, message: 'API key saved securely' });
  } catch (err) { next(err); }
});

// ─── Check if API key exists ───
router.get('/apikey', async (req, res) => {
  const hasKey = !!req.session?.apiKeyEncrypted;
  res.json({ hasKey });
});

// ─── Save Settings ───
router.put('/settings', async (req, res, next) => {
  try {
    const session = await saveSettings(req.session.token, req.body);
    res.json({ session: sanitize(session) });
  } catch (err) { next(err); }
});

// ─── Save Images ───
router.put('/images', async (req, res, next) => {
  try {
    const { images } = req.body;
    const session = await saveSessionImages(req.session.token, images || []);
    res.json({ imageCount: session.images.length });
  } catch (err) { next(err); }
});

// ─── Save Portrait ───
router.put('/portrait', async (req, res, next) => {
  try {
    const { portrait } = req.body;
    await savePortrait(req.session.token, portrait);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Save Result ───
router.put('/result', async (req, res, next) => {
  try {
    const { result, step } = req.body;
    await saveResult(req.session.token, result, step);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Delete Session ───
router.delete('/', async (req, res, next) => {
  try {
    await deleteSession(req.session.token);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Strip sensitive data before sending to client
function sanitize(session) {
  const obj = session.toObject ? session.toObject() : { ...session };
  delete obj.apiKeyEncrypted;
  delete obj.__v;
  // Don't send full image data back (large)
  if (obj.images?.length) {
    obj.images = obj.images.map(img => ({
      mimeType: img.mimeType,
      name: img.name,
      hasData: !!img.data,
    }));
  }
  if (obj.portraitImage) {
    obj.portraitImage = { hasData: !!obj.portraitImage.data, mimeType: obj.portraitImage.mimeType };
  }
  return obj;
}

export default router;

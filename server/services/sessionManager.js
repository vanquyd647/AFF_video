/* ═══ Session Manager ═══ */
import crypto from 'crypto';
import Session from '../models/Session.js';

// ─── Create new session ───
export async function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const session = await Session.create({ token });
  return session;
}

// ─── Get session by token ───
export async function getSession(token) {
  if (!token) return null;
  const session = await Session.findOne({ token });
  if (session) {
    session.lastActiveAt = new Date();
    await session.save();
  }
  return session;
}

// ─── Update session ───
export async function updateSession(token, updates) {
  const session = await Session.findOneAndUpdate(
    { token },
    { ...updates, lastActiveAt: new Date() },
    { new: true }
  );
  return session;
}

// ─── Save images to session ───
export async function saveSessionImages(token, images) {
  return Session.findOneAndUpdate(
    { token },
    {
      images: images.map(img => ({
        data: img.data,
        mimeType: img.mimeType,
        name: img.name || 'image',
      })),
      lastActiveAt: new Date(),
    },
    { new: true }
  );
}

// ─── Save portrait to session ───
export async function savePortrait(token, portrait) {
  return Session.findOneAndUpdate(
    { token },
    {
      portraitImage: portrait ? { data: portrait.data, mimeType: portrait.mimeType } : null,
      lastActiveAt: new Date(),
    },
    { new: true }
  );
}

// ─── Save settings ───
export async function saveSettings(token, settings) {
  return Session.findOneAndUpdate(
    { token },
    { settings, lastActiveAt: new Date() },
    { new: true }
  );
}

// ─── Save result ───
export async function saveResult(token, result, step) {
  return Session.findOneAndUpdate(
    { token },
    { result, step, lastActiveAt: new Date() },
    { new: true }
  );
}

// ─── Delete session ───
export async function deleteSession(token) {
  return Session.deleteOne({ token });
}

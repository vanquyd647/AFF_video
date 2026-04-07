/* ═══════════════════════════════════════════════════════════════
   API Client — Calls backend server instead of Gemini directly
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '/api';

// ─── Models registry (display only, no API calls) ───
export const MODELS = {
  text: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Nhanh, suy luận tốt, tiết kiệm', badge: 'free', category: 'text' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Phân tích sâu, coding, reasoning mạnh', badge: 'paid', category: 'text' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Frontier-class, chi phí thấp', badge: 'free', category: 'text' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: 'Mới nhất, mạnh nhất, agentic', badge: 'paid', category: 'text' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', desc: 'Nhanh nhất, tiết kiệm nhất', badge: 'free', category: 'text' },
  ],
  image: [
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', desc: 'Studio-quality 4K, text chính xác', badge: 'paid', category: 'image' },
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', desc: 'Nhanh, production-scale', badge: 'free', category: 'image' },
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana', desc: 'Nhanh, creative workflows', badge: 'free', category: 'image' },
  ],
  video: [
    { id: 'veo-3.1-generate-preview', name: 'Veo 3.1', desc: 'Cinematic, audio native, first/last frame', badge: 'paid', category: 'video' },
    { id: 'veo-3.1-lite-generate-preview', name: 'Veo 3.1 Lite', desc: 'Chi phí thấp, developer-first', badge: 'paid', category: 'video' },
  ],
};

// ─── Session Token Management ───
let sessionToken = localStorage.getItem('session_token') || null;

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['x-session-token'] = sessionToken;
  return headers;
}

async function apiCall(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getHeaders(),
    ...options,
  });

  // Capture session token from response
  const newToken = res.headers.get('x-session-token');
  if (newToken) {
    sessionToken = newToken;
    localStorage.setItem('session_token', newToken);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server error: ${res.status}`);
  }

  return res.json();
}

// ─── Session API ───
export async function createSession() {
  const data = await apiCall('/session', { method: 'POST' });
  sessionToken = data.token;
  localStorage.setItem('session_token', data.token);
  return data;
}

export async function getSession() {
  try {
    return await apiCall('/session');
  } catch {
    // Session expired, create new one
    return createSession();
  }
}

export async function deleteSession() {
  await apiCall('/session', { method: 'DELETE' });
  sessionToken = null;
  localStorage.removeItem('session_token');
}

// ─── API Key ───
export async function saveApiKey(apiKey) {
  return apiCall('/session/apikey', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
}

export async function checkApiKey() {
  return apiCall('/session/apikey');
}

// ─── Settings ───
export async function saveSettings(settings) {
  return apiCall('/session/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ─── Images ───
export async function saveImages(images) {
  return apiCall('/session/images', {
    method: 'PUT',
    body: JSON.stringify({ images }),
  });
}

export async function savePortrait(portrait) {
  return apiCall('/session/portrait', {
    method: 'PUT',
    body: JSON.stringify({ portrait }),
  });
}

// ─── Save Result ───
export async function saveResult(result, step) {
  return apiCall('/session/result', {
    method: 'PUT',
    body: JSON.stringify({ result, step }),
  });
}

// ─── Generate ───
export async function generate({ model, category, notes, duration, videoStyle, hasPortrait, imageCount, images }) {
  return apiCall('/generate', {
    method: 'POST',
    body: JSON.stringify({ model, category, notes, duration, videoStyle, hasPortrait, imageCount, images }),
  });
}

// ─── History ───
export async function getHistory() {
  return apiCall('/history');
}

export async function getHistoryItem(id) {
  return apiCall(`/history/${id}`);
}

// ─── File to Base64 ───
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({ data: base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

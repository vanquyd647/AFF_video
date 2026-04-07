/* ═══════════════════════════════════════════════════════════════
   Gemini API Wrapper - Multi-model Support
   Model names verified from: https://ai.google.dev/gemini-api/docs/models
   ═══════════════════════════════════════════════════════════════ */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// ─── Available Models Registry (Official IDs from Google AI docs) ───
export const MODELS = {
  // Text / Analysis Models
  text: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Nhanh, suy luận tốt, tiết kiệm', badge: 'free', category: 'text' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Phân tích sâu, coding, reasoning mạnh', badge: 'paid', category: 'text' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Frontier-class, chi phí thấp', badge: 'free', category: 'text' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: 'Mới nhất, mạnh nhất, agentic', badge: 'paid', category: 'text' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', desc: 'Nhanh nhất, tiết kiệm nhất', badge: 'free', category: 'text' },
  ],
  // Image Generation Models (Nano Banana family)
  image: [
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', desc: 'Studio-quality 4K, text chính xác', badge: 'paid', category: 'image' },
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', desc: 'Nhanh, production-scale', badge: 'free', category: 'image' },
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana', desc: 'Nhanh, creative workflows', badge: 'free', category: 'image' },
  ],
  // Video Generation Models (Veo family)
  video: [
    { id: 'veo-3.1-generate-preview', name: 'Veo 3.1', desc: 'Cinematic, audio native, first/last frame', badge: 'paid', category: 'video' },
    { id: 'veo-3.1-lite-generate-preview', name: 'Veo 3.1 Lite', desc: 'Chi phí thấp, developer-first', badge: 'paid', category: 'video' },
  ],
};

// ─── Validate API Key ───
export async function validateApiKey(apiKey) {
  try {
    const res = await fetch(`${BASE_URL}/models?key=${apiKey}`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Invalid key');
    const data = await res.json();
    return { valid: true, models: data.models?.map(m => m.name) || [] };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── Text Generation (Analysis & Prompt Generation) ───
// Supports multiple images: pass images as array of {data, mimeType}
export async function generateText(apiKey, modelId, prompt, images = null) {
  const parts = [];

  if (typeof prompt === 'string') {
    parts.push({ text: prompt });
  } else if (Array.isArray(prompt)) {
    parts.push(...prompt);
  }

  // Support both old single-image format and new multi-image array
  if (images) {
    const imgArray = Array.isArray(images) ? images : [{ data: images, mimeType: 'image/jpeg' }];
    for (const img of imgArray) {
      if (img.data) {
        parts.push({
          inline_data: {
            mime_type: img.mimeType || 'image/jpeg',
            data: img.data,
          },
        });
      }
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(
    `${BASE_URL}/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error ${res.status}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('No response from model');

  return candidate.content?.parts?.map(p => p.text).join('') || '';
}

// ─── Image Generation (Nano Banana Pro/2) ───
export async function generateImage(apiKey, modelId, prompt, referenceImages = [], config = {}) {
  const parts = [{ text: prompt }];

  // Add reference images (product image, portrait, etc.)
  for (const img of referenceImages) {
    parts.push({
      inline_data: {
        mime_type: img.mimeType || 'image/jpeg',
        data: img.data,
      },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: config.aspectRatio || '9:16',
        imageSize: config.imageSize || '2K',
      },
    },
  };

  const res = await fetch(
    `${BASE_URL}/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Image API Error ${res.status}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('No image generated');

  const results = { images: [], text: '' };
  for (const part of candidate.content?.parts || []) {
    if (part.text) results.text += part.text;
    if (part.inlineData || part.inline_data) {
      const d = part.inlineData || part.inline_data;
      results.images.push({
        data: d.data,
        mimeType: d.mimeType || d.mime_type,
      });
    }
  }

  return results;
}

// ─── Video Generation (Veo 3.1) ───
export async function generateVideo(apiKey, modelId, prompt, config = {}) {
  const instance = { prompt };

  // First frame image (starting image)
  if (config.firstFrame) {
    instance.image = {
      bytesBase64Encoded: config.firstFrame.data,
      mimeType: config.firstFrame.mimeType || 'image/jpeg',
    };
  }

  // Reference images (up to 3)
  if (config.referenceImages?.length > 0) {
    instance.referenceImages = config.referenceImages.map(img => ({
      image: {
        bytesBase64Encoded: img.data,
        mimeType: img.mimeType || 'image/jpeg',
      },
      referenceType: 'asset',
    }));
  }

  const parameters = {};
  if (config.aspectRatio) parameters.aspectRatio = config.aspectRatio;
  if (config.resolution) parameters.resolution = config.resolution;

  // Last frame for interpolation
  if (config.lastFrame) {
    parameters.lastFrame = {
      bytesBase64Encoded: config.lastFrame.data,
      mimeType: config.lastFrame.mimeType || 'image/jpeg',
    };
  }

  const body = {
    instances: [instance],
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
  };

  const res = await fetch(
    `${BASE_URL}/models/${modelId}:predictLongRunning?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Video API Error ${res.status}`);
  }

  const data = await res.json();
  return data.name; // Operation name for polling
}

// ─── Video Extension (for > 8s clips) ───
export async function extendVideo(apiKey, modelId, prompt, videoUri, config = {}) {
  const instance = {
    prompt,
    video: { uri: videoUri },
  };

  const parameters = {};
  if (config.aspectRatio) parameters.aspectRatio = config.aspectRatio;
  if (config.resolution) parameters.resolution = config.resolution;

  const body = {
    instances: [instance],
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
  };

  const res = await fetch(
    `${BASE_URL}/models/${modelId}:predictLongRunning?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Video Extension Error ${res.status}`);
  }

  const data = await res.json();
  return data.name;
}

// ─── Poll Operation Status ───
export async function pollOperation(apiKey, operationName, onProgress) {
  let attempts = 0;
  const maxAttempts = 120; // 20 minutes max

  while (attempts < maxAttempts) {
    const res = await fetch(
      `${BASE_URL}/${operationName}?key=${apiKey}`,
      { method: 'GET' }
    );

    if (!res.ok) throw new Error('Failed to check operation status');

    const data = await res.json();

    if (data.done) {
      const video = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
      if (video?.uri) {
        return { uri: video.uri, done: true };
      }
      throw new Error('Video generation completed but no video URL found');
    }

    attempts++;
    onProgress?.({ progress: Math.min(95, (attempts / maxAttempts) * 100), status: 'generating' });
    await new Promise(r => setTimeout(r, 10000)); // Wait 10s
  }

  throw new Error('Video generation timed out');
}

// ─── Download Video ───
export async function downloadVideo(apiKey, videoUri) {
  const res = await fetch(`${videoUri}&key=${apiKey}`, {
    redirect: 'follow',
  });

  if (!res.ok) throw new Error('Failed to download video');
  const blob = await res.blob();
  return blob;
}

// ─── Utility: File to Base64 ───
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({ data: base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Utility: Base64 to Blob URL ───
export function base64ToUrl(base64, mimeType = 'image/png') {
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNums)], { type: mimeType });
  return URL.createObjectURL(blob);
}

// ─── Utility: Download Blob ───
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

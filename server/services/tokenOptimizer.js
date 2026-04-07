/* ═══ Token Optimizer ═══
   - Compress images before sending to Gemini API
   - Reduce token usage significantly
   ═══════════════════════ */
import sharp from 'sharp';
import config from '../config.js';

// ─── Optimize a single image ───
export async function optimizeImage(base64Data, mimeType = 'image/jpeg') {
  try {
    const buffer = Buffer.from(base64Data, 'base64');

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;
    const maxDim = config.maxImageDimension;

    let processor = sharp(buffer);

    // Resize if too large
    if (width > maxDim || height > maxDim) {
      processor = processor.resize(maxDim, maxDim, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to JPEG with quality 80 (significantly reduces size)
    const optimized = await processor
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    const originalSize = buffer.length;
    const newSize = optimized.length;
    const savedPercent = Math.round((1 - newSize / originalSize) * 100);

    return {
      data: optimized.toString('base64'),
      mimeType: 'image/jpeg',
      originalSize,
      optimizedSize: newSize,
      savedPercent,
    };
  } catch (err) {
    // If optimization fails, return original
    console.warn('Image optimization failed, using original:', err.message);
    return {
      data: base64Data,
      mimeType,
      originalSize: base64Data.length,
      optimizedSize: base64Data.length,
      savedPercent: 0,
    };
  }
}

// ─── Optimize multiple images ───
export async function optimizeImages(images) {
  if (!images?.length) return { images: [], stats: { totalSaved: 0, totalOriginal: 0 } };

  const results = await Promise.all(
    images.map(img => optimizeImage(img.data, img.mimeType))
  );

  const stats = {
    totalOriginal: results.reduce((s, r) => s + r.originalSize, 0),
    totalOptimized: results.reduce((s, r) => s + r.optimizedSize, 0),
    totalSavedPercent: 0,
  };
  stats.totalSavedPercent = Math.round((1 - stats.totalOptimized / stats.totalOriginal) * 100);

  const optimizedImages = results.map((r, i) => ({
    data: r.data,
    mimeType: r.mimeType,
    name: images[i]?.name || `image_${i}`,
  }));

  return { images: optimizedImages, stats };
}

// ─── Estimate tokens for text ───
export function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil((text || '').length / 4);
}

// ─── Estimate tokens for image ───
export function estimateImageTokens(base64Data) {
  // Gemini charges ~258 tokens per image tile (256x256)
  // A 1024x1024 image = 16 tiles = ~4128 tokens
  const sizeBytes = Buffer.from(base64Data, 'base64').length;
  const approxPixels = sizeBytes / 3; // rough RGB estimate
  const side = Math.sqrt(approxPixels);
  const tiles = Math.ceil(side / 256) ** 2;
  return tiles * 258;
}

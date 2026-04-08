/* ═══ Generate: Analyze + Create Prompts ═══
   POST /api/generate
*/
import { connectDB } from '../lib/db.js';
import { authenticateRequest, handleCors, setCorsHeaders } from '../lib/auth.js';
import { decryptApiKey, generateText } from '../lib/gemini.js';
import { optimizeImages } from '../lib/tokenOptimizer.js';
import { buildMegaPrompt } from '../src/templates.js';
import History from '../lib/models/History.js';
import Session from '../lib/models/Session.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const session = await authenticateRequest(req, res);

    if (!session?.apiKeyEncrypted) {
      return res.status(401).json({ error: 'Chưa cấu hình API key. Vui lòng thêm API key trước.' });
    }

    const apiKey = decryptApiKey(session.apiKeyEncrypted);
    const {
      model, category, notes, duration, videoStyle,
      hasPortrait, imageCount, images,
    } = req.body;

    if (!images?.length) {
      return res.status(400).json({ error: 'Cần ít nhất 1 ảnh sản phẩm' });
    }

    const validImages = images.filter(img => typeof img?.data === 'string' && img.data.trim().length > 0);
    if (!validImages.length) {
      return res.status(400).json({ error: 'Dữ liệu ảnh không hợp lệ. Mỗi ảnh cần trường data (base64).' });
    }

    // Optimize images (compress + resize)
    console.log(`[OPTIMIZE] ${validImages.length} images before sending to Gemini...`);
    const { images: optimizedImages, stats } = await optimizeImages(validImages);

    if (!optimizedImages.length) {
      return res.status(400).json({ error: 'Không có ảnh hợp lệ để xử lý. Vui lòng tải lại ảnh và thử lại.' });
    }

    console.log(`[OPTIMIZE] Saved ${stats.totalSavedPercent}% (${Math.round(stats.totalOriginal / 1024)}KB → ${Math.round(stats.totalOptimized / 1024)}KB)`);

    // Build prompt
    const prompt = buildMegaPrompt({
      category: category || session.settings?.category,
      notes: notes || session.settings?.notes,
      duration: duration || session.settings?.duration,
      videoStyle: videoStyle || session.settings?.videoStyle,
      hasPortrait: hasPortrait || session.settings?.portraitEnabled,
      imageCount: optimizedImages.length,
    });

    // Call Gemini
    const startTime = Date.now();
    const { text: raw, tokenUsage } = await generateText(
      apiKey,
      model || session.settings?.textModel || 'gemini-2.5-flash',
      prompt,
      optimizedImages
    );
    const durationMs = Date.now() - startTime;

    console.log(`[GENERATE] Model: ${model}, Tokens: ${tokenUsage.totalTokens}, Time: ${durationMs}ms`);

    // Parse JSON response
    const parsed = parseAIResponse(raw);

    // Save to history
    try {
      await History.create({
        sessionToken: session.token,
        type: 'generation',
        input: { imageCount: validImages.length, category, duration, videoStyle, model, notes },
        result: parsed,
        tokenUsage,
        durationMs,
      });
    } catch (histErr) {
      console.warn('[HISTORY] Failed to save:', histErr.message);
    }

    // Save result to session
    await Session.findOneAndUpdate(
      { token: session.token },
      { result: parsed, step: 2, lastActiveAt: new Date() }
    );

    res.status(200).json({
      result: parsed,
      tokenUsage,
      optimization: stats,
      durationMs,
    });
  } catch (err) {
    console.error('[GENERATE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ═══ JSON Parser (robust) ═══
function parseAIResponse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('AI không trả về nội dung hợp lệ. Thử lại hoặc đổi model.');
  }

  let jsonStr = raw;

  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('AI không trả về JSON hợp lệ. Thử lại hoặc đổi model.');
    }
    jsonStr = raw.substring(firstBrace, lastBrace + 1);
  }

  jsonStr = sanitizeJSON(jsonStr);

  try {
    return JSON.parse(jsonStr);
  } catch (e1) {
    try {
      return JSON.parse(aggressiveSanitize(jsonStr));
    } catch {
      throw new Error(`JSON parse lỗi: ${e1.message}. Thử lại hoặc đổi model.`);
    }
  }
}

function sanitizeJSON(str) {
  str = str.replace(/\/\/[^\n]*/g, '');
  str = str.replace(/\/\*[\s\S]*?\*\//g, '');
  str = str.replace(/,\s*([\]}])/g, '$1');
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return str;
}

function aggressiveSanitize(str) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; result += ch; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }
    if (inString && (ch === '\n' || ch === '\r')) { result += '\\n'; continue; }
    if (inString && ch === '\t') { result += '\\t'; continue; }
    result += ch;
  }
  return result.replace(/,\s*([\]}])/g, '$1');
}

/* ═══ API Routes — Generate ═══ */
import { Router } from 'express';
import { decryptApiKey, generateText } from '../services/gemini.js';
import { optimizeImages } from '../services/tokenOptimizer.js';
import { buildMegaPrompt } from '../../src/templates.js';
import History from '../models/History.js';
import Session from '../models/Session.js';

const router = Router();

// ─── Generate: Analyze + Create Prompts ───
router.post('/generate', async (req, res, next) => {
  try {
    const session = req.session;
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

    // Optimize images (compress + resize)
    console.log(`[OPTIMIZE] ${images.length} images before sending to Gemini...`);
    const { images: optimizedImages, stats } = await optimizeImages(images);
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
        input: { imageCount: images.length, category, duration, videoStyle, model, notes },
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

    res.json({
      result: parsed,
      tokenUsage,
      optimization: stats,
      durationMs,
    });
  } catch (err) { next(err); }
});

// ─── History ───
router.get('/history', async (req, res, next) => {
  try {
    const token = req.session.token;
    const history = await History.find({ sessionToken: token })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-result.frames -result.clips')
      .lean();
    res.json({ history });
  } catch (err) { next(err); }
});

router.get('/history/:id', async (req, res, next) => {
  try {
    const item = await History.findOne({
      _id: req.params.id,
      sessionToken: req.session.token,
    }).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (err) { next(err); }
});

// ═══ JSON Parser (robust) ═══
function parseAIResponse(raw) {
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

export default router;

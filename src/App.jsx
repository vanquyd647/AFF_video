import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';
import { MODELS, validateApiKey, generateText, fileToBase64 } from './api';
import { CATEGORIES, VIDEO_STYLES, DURATION_OPTIONS, buildMegaPrompt } from './templates';

// ─── Session helpers ───
const SESSION_KEY = 'tiktok_ai_session';

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSession(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage full — clear old data and retry
    if (e.name === 'QuotaExceededError') {
      localStorage.removeItem(SESSION_KEY);
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
    }
  }
}

// Recreate blob URLs from base64 data
function restoreImageUrls(images) {
  if (!images?.length) return [];
  return images.map(img => {
    if (img.url && img.url.startsWith('blob:')) {
      // Old blob URL is dead after page reload, recreate
      try {
        const byteChars = atob(img.data);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: img.mimeType || 'image/jpeg' });
        return { ...img, url: URL.createObjectURL(blob) };
      } catch { return { ...img, url: '' }; }
    }
    return img;
  });
}

function restoreSingleImage(img) {
  if (!img?.data) return null;
  try {
    const byteChars = atob(img.data);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNums)], { type: img.mimeType || 'image/jpeg' });
    return { ...img, url: URL.createObjectURL(blob) };
  } catch { return null; }
}

export default function App() {
  // ─── Load saved session ───
  const [session] = useState(() => loadSession());

  // ─── State (restored from session) ───
  const [step, setStep] = useState(session.step || 0);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [apiStatus, setApiStatus] = useState('idle');
  const [showKey, setShowKey] = useState(false);
  const [textModel, setTextModel] = useState(session.textModel || MODELS.text[0].id);

  // Product (restored)
  const [productImages, setProductImages] = useState(() => restoreImageUrls(session.productImages));
  const [portraitEnabled, setPortraitEnabled] = useState(session.portraitEnabled || false);
  const [portraitImage, setPortraitImage] = useState(() => restoreSingleImage(session.portraitImage));
  const [category, setCategory] = useState(session.category || 'auto');
  const [notes, setNotes] = useState(session.notes || '');

  // Video config (restored)
  const [videoStyle, setVideoStyle] = useState(session.videoStyle || 'product_showcase');
  const [duration, setDuration] = useState(session.duration || 16);

  // Results (restored)
  const [result, setResult] = useState(session.result || null);
  const [generating, setGenerating] = useState(false);

  // ─── Auto-save session on state change ───
  useEffect(() => {
    // Strip blob URLs (not serializable), keep base64 data
    const imgData = productImages.map(({ url, file, ...rest }) => rest);
    const portraitData = portraitImage ? (({ url, file, ...rest }) => rest)(portraitImage) : null;

    saveSession({
      step, textModel, category, notes, videoStyle, duration,
      portraitEnabled,
      productImages: imgData,
      portraitImage: portraitData,
      result,
    });
  }, [step, textModel, productImages, portraitEnabled, portraitImage, category, notes, videoStyle, duration, result]);

  // ─── Auto-validate saved API key on mount ───
  useEffect(() => {
    if (apiKey) {
      validateApiKey(apiKey).then(r => {
        if (r.valid) setApiStatus('valid');
      });
    }
  }, []);

  // Toast
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message: msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  // Steps
  const steps = [
    { label: 'API Key', icon: '🔑' },
    { label: 'Cấu Hình & Sinh', icon: '⚡' },
    { label: 'Kết Quả', icon: '📋' },
  ];

  // ─── Validate Key ───
  const handleValidateKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setApiStatus('checking');
    const r = await validateApiKey(apiKey);
    if (r.valid) {
      setApiStatus('valid');
      localStorage.setItem('gemini_api_key', apiKey);
      addToast('✅ API Key hợp lệ!', 'success');
    } else {
      setApiStatus('invalid');
      addToast('❌ API Key không hợp lệ.', 'error');
    }
  }, [apiKey, addToast]);

  // ─── Multi Image Upload ───
  const handleMultiUpload = useCallback(async (files) => {
    const imgs = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const { data, mimeType } = await fileToBase64(f);
      imgs.push({ data, mimeType, url: URL.createObjectURL(f), name: f.name });
    }
    setProductImages(prev => [...prev, ...imgs]);
    if (imgs.length) addToast(`📸 Đã thêm ${imgs.length} ảnh`, 'success');
  }, [addToast]);

  const removeImage = useCallback((i) => {
    setProductImages(prev => {
      const next = [...prev];
      if (next[i]?.url) URL.revokeObjectURL(next[i].url);
      next.splice(i, 1);
      return next;
    });
  }, []);

  const handleSingleUpload = useCallback(async (file, setter) => {
    if (!file?.type.startsWith('image/')) return;
    const { data, mimeType } = await fileToBase64(file);
    setter({ data, mimeType, url: URL.createObjectURL(file) });
  }, []);

  // ═══ MAIN: Sinh tất cả trong 1 lần gọi AI ═══
  const handleGenerate = useCallback(async () => {
    if (productImages.length === 0 || apiStatus !== 'valid') return;
    setGenerating(true);
    setResult(null);
    try {
      const prompt = buildMegaPrompt({
        category,
        notes,
        duration,
        videoStyle,
        hasPortrait: portraitEnabled && !!portraitImage,
        imageCount: productImages.length,
      });

      const images = productImages.map(img => ({ data: img.data, mimeType: img.mimeType }));

      addToast(`🧠 Đang phân tích ${productImages.length} ảnh + sinh prompts... (30-60s)`, 'info');

      const raw = await generateText(apiKey, textModel, prompt, images);

      // Robust JSON parsing
      const parsed = parseAIResponse(raw);

      if (!parsed.frames?.length || !parsed.clips?.length) {
        throw new Error('AI trả về thiếu dữ liệu frames hoặc clips. Thử lại.');
      }

      setResult(parsed);
      setStep(2);
      addToast(`✅ Hoàn tất! ${parsed.frames.length} frames + ${parsed.clips.length} clips`, 'success');
    } catch (err) {
      addToast(`❌ Lỗi: ${err.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  }, [productImages, apiKey, apiStatus, textModel, category, notes, duration, videoStyle, portraitEnabled, portraitImage, addToast]);

  // ─── Copy helpers ───
  const copy = useCallback((text, label) => {
    navigator.clipboard.writeText(text);
    addToast(`📋 Đã copy ${label}!`, 'success');
  }, [addToast]);

  const copyAll = useCallback((items, field, label) => {
    const text = items.map((p, i) => `=== ${label} ${i + 1} ===\n${typeof p === 'string' ? p : p[field] || JSON.stringify(p)}`).join('\n\n');
    navigator.clipboard.writeText(text);
    addToast(`📋 Đã copy tất cả ${items.length} ${label}!`, 'success');
  }, [addToast]);

  const dur = DURATION_OPTIONS.find(d => d.seconds === duration) || DURATION_OPTIONS[0];

  // ═══════════ RENDER ═══════════
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-icon">🎬</span>
          <span>TikTok Marketing AI</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--c-text-3)', fontWeight: 400, marginLeft: '4px' }}>Prompt Generator</span>
        </div>
        <span className={`api-key-status ${apiStatus}`}>
          {apiStatus === 'valid' ? '🟢 Connected' : apiStatus === 'checking' ? '🟡 Checking...' : apiStatus === 'invalid' ? '🔴 Invalid' : '⚪ Not set'}
        </span>
      </header>

      <div style={{ padding: '0 var(--gap-xl)', background: 'rgba(10,10,18,0.5)', borderBottom: '1px solid var(--c-border)' }}>
        <nav className="steps-nav">
          {steps.map((s, i) => (
            <button key={i} className={`step-item ${step === i ? 'active' : ''} ${i < step ? 'completed' : ''}`} onClick={() => i <= step && setStep(i)}>
              <span className="step-num">{i < step ? '✓' : i + 1}</span>
              <span>{s.icon} {s.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <main className="app-main">

        {/* ═══ STEP 0: API Key ═══ */}
        {step === 0 && (
          <div className="fade-in">
            <div className="glass-card glow">
              <div className="card-header"><div className="card-icon purple">🔑</div><h3>Cấu Hình API</h3></div>
              <div className="input-group" style={{ marginBottom: '20px' }}>
                <label>Gemini API Key</label>
                <div className="api-key-wrapper">
                  <input type={showKey ? 'text' : 'password'} className="input-field mono" placeholder="AIza..."
                    value={apiKey} onChange={e => { setApiKey(e.target.value); setApiStatus('idle'); }} />
                  <button className="btn btn-icon btn-ghost" onClick={() => setShowKey(!showKey)}>{showKey ? '🙈' : '👁'}</button>
                  <button className="btn btn-primary btn-sm" onClick={handleValidateKey} disabled={!apiKey.trim() || apiStatus === 'checking'}>
                    {apiStatus === 'checking' ? <span className="spinner" /> : '✓ Xác Nhận'}
                  </button>
                </div>
              </div>
              <div className="divider" />
              <div className="input-group">
                <label>📝 Model Phân Tích & Sinh Prompt</label>
                <div className="model-grid">
                  {MODELS.text.map(m => (
                    <div key={m.id} className={`model-card ${textModel === m.id ? 'selected' : ''}`} onClick={() => setTextModel(m.id)}>
                      <div className="model-name">{m.name}</div>
                      <div className="model-desc">{m.desc}</div>
                      <span className={`model-badge ${m.badge}`}>{m.badge === 'free' ? 'Free' : 'Paid'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: '24px', textAlign: 'right' }}>
                <button className="btn btn-primary btn-lg" disabled={apiStatus !== 'valid'} onClick={() => setStep(1)}>Tiếp Tục →</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 1: All-in-one Config → Generate ═══ */}
        {step === 1 && (
          <div className="fade-in">
            {/* Product Images */}
            <div className="glass-card glow" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <div className="card-icon purple">📸</div>
                <h3>Ảnh Sản Phẩm</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--c-text-3)', marginLeft: 'auto' }}>{productImages.length} ảnh</span>
              </div>
              <MultiUploadZone images={productImages} onUpload={handleMultiUpload} onRemove={removeImage}
                onClearAll={() => { productImages.forEach(i => URL.revokeObjectURL(i.url)); setProductImages([]); }} />
            </div>

            <div className="section-grid">
              {/* Portrait */}
              <div className="glass-card">
                <div className="card-header"><div className="card-icon pink">👤</div><h3>Chân Dung (Tuỳ Chọn)</h3></div>
                <div className="toggle-wrapper" style={{ marginBottom: '12px' }}>
                  <div className={`toggle ${portraitEnabled ? 'active' : ''}`} onClick={() => setPortraitEnabled(!portraitEnabled)} />
                  <span className="toggle-label">{portraitEnabled ? 'Bật' : 'Tắt'}</span>
                </div>
                {portraitEnabled && (
                  <UploadZone image={portraitImage} onUpload={f => handleSingleUpload(f, setPortraitImage)} onClear={() => setPortraitImage(null)} label="Ảnh chân dung" />
                )}
              </div>

              {/* Category */}
              <div className="glass-card">
                <div className="card-header"><div className="card-icon green">🏷️</div><h3>Loại Sản Phẩm</h3></div>
                <div className="category-pills">
                  {CATEGORIES.map(c => (
                    <button key={c.id} className={`category-pill ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>{c.label}</button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="glass-card">
                <div className="card-header"><div className="card-icon pink">⏱️</div><h3>Thời Lượng Video</h3></div>
                <div className="duration-selector">
                  {DURATION_OPTIONS.map(d => (
                    <button key={d.seconds} className={`duration-btn ${duration === d.seconds ? 'active' : ''}`} onClick={() => setDuration(d.seconds)}>{d.label}</button>
                  ))}
                </div>
                <div className="duration-info">⚡ {dur.clips} clips × 8s = {dur.seconds}s → Cần {dur.frames} ảnh (thuật toán N+1)</div>
              </div>

              {/* Video Style */}
              <div className="glass-card">
                <div className="card-header"><div className="card-icon purple">🎨</div><h3>Phong Cách Video</h3></div>
                <div className="model-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {VIDEO_STYLES.map(s => (
                    <div key={s.id} className={`model-card ${videoStyle === s.id ? 'selected' : ''}`} onClick={() => setVideoStyle(s.id)}>
                      <div className="model-name">{s.label}</div>
                      <div className="model-desc">{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="glass-card section-full">
                <div className="card-header"><div className="card-icon green">📝</div><h3>Ghi Chú Thêm</h3></div>
                <textarea className="input-field" placeholder="VD: Nhấn mạnh giá rẻ, target gen Z, dùng tone funny, sản phẩm chống nước..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Generate Button */}
            <div className="glass-card glow" style={{ marginTop: '20px', textAlign: 'center', padding: '24px' }}>
              <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: 'var(--c-text-2)' }}>
                {productImages.length > 0 ? (
                  <>📸 {productImages.length} ảnh SP • ⏱️ {dur.seconds}s ({dur.clips} clips) • 🖼️ {dur.frames} frames • 🎨 {VIDEO_STYLES.find(s => s.id === videoStyle)?.label}</>
                ) : (
                  <span style={{ color: 'var(--c-text-3)' }}>⚠️ Chưa upload ảnh sản phẩm</span>
                )}
              </div>
              <button className="btn btn-primary btn-lg" disabled={productImages.length === 0 || generating} onClick={handleGenerate} style={{ minWidth: '320px' }}>
                {generating ? (
                  <><span className="spinner" /> Đang phân tích & sinh prompt... (có thể mất 30-60s)</>
                ) : (
                  <>🚀 Phân Tích & Sinh {dur.frames} Frame + {dur.clips} Clip Prompts</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: Results ═══ */}
        {step === 2 && result && (
          <div className="fade-in">

            {/* Thumbnails */}
            {productImages.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
                {productImages.map((img, i) => (
                  <img key={i} src={img.url} alt={`SP ${i + 1}`} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--c-border)', flexShrink: 0 }} />
                ))}
              </div>
            )}

            {/* Analysis */}
            <div className="glass-card glow" style={{ marginBottom: '20px' }}>
              <div className="card-header"><div className="card-icon green">🔍</div><h3>Phân Tích Sản Phẩm</h3></div>
              <div className="analysis-grid">
                <AI label="Tên SP" value={result.analysis?.productName} />
                <AI label="Loại" value={CATEGORIES.find(c => c.id === result.analysis?.category)?.label || result.analysis?.category} />
                <AI label="Đối Tượng" value={result.analysis?.targetAudience} />
                <AI label="USP" value={result.analysis?.usp} />
                <AI label="Tone" value={result.analysis?.suggestedTone} />
                <AI label="Cảm Xúc" value={result.analysis?.emotionalHook} />
                <div className="analysis-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="analysis-label">Mô Tả Hình Ảnh SP</div>
                  <div className="analysis-value">{result.analysis?.visualDescription || '—'}</div>
                </div>
                <div className="analysis-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="analysis-label">Đặc Điểm</div>
                  <div className="tag-list">{result.analysis?.keyFeatures?.map((f, i) => <span key={i} className="tag">{f}</span>)}</div>
                </div>
                <div className="analysis-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="analysis-label">Góc Marketing</div>
                  <div className="tag-list">{result.analysis?.marketingAngles?.map((a, i) => <span key={i} className="tag">{a}</span>)}</div>
                </div>
              </div>
            </div>

            {/* Storyboard Summary */}
            {result.storyboardSummary && (
              <div className="glass-card" style={{ marginBottom: '20px', background: 'var(--c-primary-dim)', borderColor: 'rgba(139,92,246,0.3)' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>📖 Kịch Bản Video</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--c-text-2)', lineHeight: 1.7 }}>{result.storyboardSummary}</div>
              </div>
            )}

            {/* Visual Storyboard Timeline */}
            <div className="glass-card glow" style={{ marginBottom: '20px' }}>
              <div className="card-header"><div className="card-icon purple">🖼️</div><h3>Storyboard N+1 — {result.frames?.length} Frames</h3></div>
              <p style={{ fontSize: '0.8rem', color: 'var(--c-text-3)', marginBottom: '12px' }}>
                Tạo {result.frames?.length} ảnh bằng <strong>Nano Banana Pro</strong>. Mỗi cặp ảnh liền kề = first/last frame cho 1 clip video.
              </p>
              <div className="storyboard">
                {result.frames?.map((frame, i) => (
                  <StoryboardCard key={i} frame={frame} index={i} total={result.frames.length}
                    onCopy={() => copy(frame.prompt, `Frame ${i + 1}`)} />
                ))}
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary btn-sm" onClick={() => copyAll(result.frames, 'prompt', 'Frame Prompt')}>📋 Copy Tất Cả Frame Prompts</button>
              </div>
            </div>

            {/* Frame Prompts Detail */}
            <div className="glass-card" style={{ marginBottom: '20px' }}>
              <div className="card-header"><div className="card-icon green">🎨</div><h3>Chi Tiết Frame Prompts (Nano Banana Pro)</h3></div>
              {result.frames?.map((frame, i) => (
                <PromptCard key={i}
                  title={`Frame ${i + 1}/${result.frames.length} — ${frame.label}`}
                  subtitle={frame.description}
                  prompt={frame.prompt}
                  onCopy={() => copy(frame.prompt, `Frame ${i + 1}`)} />
              ))}
            </div>

            {/* Video Clip Prompts */}
            <div className="glass-card glow" style={{ marginBottom: '20px' }}>
              <div className="card-header"><div className="card-icon pink">🎬</div><h3>Video Clip Prompts — {result.clips?.length} Clips (Veo 3.1)</h3></div>
              <p style={{ fontSize: '0.8rem', color: 'var(--c-text-3)', marginBottom: '12px' }}>
                Copy prompt + đính kèm ảnh first frame & last frame khi tạo video trên <strong>Veo 3.1</strong>.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className="btn btn-primary btn-sm" onClick={() => copyAll(result.clips, 'prompt', 'Clip Prompt')}>📋 Copy Tất Cả Clip Prompts</button>
              </div>
              {result.clips?.map((clip, i) => (
                <PromptCard key={i}
                  title={`Clip ${i + 1}/${result.clips.length} — ${clip.label}`}
                  subtitle={`${clip.description} | First: Frame ${(clip.firstFrame ?? i) + 1} → Last: Frame ${(clip.lastFrame ?? i + 1) + 1}`}
                  prompt={clip.prompt}
                  onCopy={() => copy(clip.prompt, `Clip ${i + 1}`)} />
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Quay lại chỉnh sửa</button>
              <button className="btn btn-secondary" onClick={() => {
                const all = `=== PHÂN TÍCH ===\n${JSON.stringify(result.analysis, null, 2)}\n\n=== KỊCH BẢN ===\n${result.storyboardSummary}\n\n=== FRAME PROMPTS ===\n${result.frames?.map((f, i) => `--- Frame ${i + 1}: ${f.label} ---\n${f.prompt}`).join('\n\n')}\n\n=== CLIP PROMPTS ===\n${result.clips?.map((c, i) => `--- Clip ${i + 1}: ${c.label} ---\n${c.prompt}`).join('\n\n')}`;
                copy(all, 'toàn bộ kết quả');
              }}>📋 Copy Toàn Bộ</button>
              <button className="btn btn-primary" onClick={() => { setResult(null); setStep(1); }}>🔄 Sinh Lại Mới</button>
            </div>
          </div>
        )}
      </main>

      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </div>
  );
}

// ═══════════════ JSON PARSER (robust) ═══════════════

function parseAIResponse(raw) {
  // Extract JSON block from AI response
  let jsonStr = raw;

  // Try to find JSON in markdown code block first
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // Find the outermost { ... }
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('AI không trả về JSON hợp lệ. Thử lại hoặc đổi model.');
    }
    jsonStr = raw.substring(firstBrace, lastBrace + 1);
  }

  // Sanitize common AI JSON issues
  jsonStr = sanitizeJSON(jsonStr);

  // Try parsing
  try {
    return JSON.parse(jsonStr);
  } catch (e1) {
    // Second attempt: more aggressive cleanup
    try {
      jsonStr = aggressiveSanitize(jsonStr);
      return JSON.parse(jsonStr);
    } catch (e2) {
      throw new Error(`JSON parse lỗi: ${e1.message}. Thử lại hoặc đổi model khác (Gemini 2.5 Pro ổn hơn).`);
    }
  }
}

function sanitizeJSON(str) {
  // Remove single-line comments (// ...)
  str = str.replace(/\/\/[^\n]*/g, '');

  // Remove multi-line comments (/* ... */)
  str = str.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove trailing commas before } or ]
  str = str.replace(/,\s*([\]}])/g, '$1');

  // Remove control characters (except \n \r \t)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return str;
}

function aggressiveSanitize(str) {
  // Fix unescaped newlines inside string values
  // Strategy: process character by character
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString && (ch === '\n' || ch === '\r')) {
      // Replace unescaped newlines in strings with \\n
      result += '\\n';
      continue;
    }

    if (inString && ch === '\t') {
      result += '\\t';
      continue;
    }

    result += ch;
  }

  // Remove trailing commas again
  result = result.replace(/,\s*([\]}])/g, '$1');

  return result;
}

// ═══════════════ COMPONENTS ═══════════════

function AI({ label, value }) {
  return <div className="analysis-item"><div className="analysis-label">{label}</div><div className="analysis-value">{value || '—'}</div></div>;
}

function MultiUploadZone({ images, onUpload, onRemove, onClearAll }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  return (
    <div>
      <div className={`upload-zone ${drag ? 'drag-over' : ''}`} style={{ minHeight: images.length > 0 ? '80px' : '160px' }}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) onUpload(Array.from(e.dataTransfer.files)); }}>
        <div className="upload-icon">📁</div>
        <div className="upload-text">Kéo thả nhiều ảnh sản phẩm hoặc click để chọn</div>
        <div className="upload-hint">PNG, JPG, WebP • Chọn nhiều ảnh cùng lúc</div>
        <input ref={ref} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) onUpload(Array.from(e.target.files)); e.target.value = ''; }} />
      </div>
      {images.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>📸 {images.length} ảnh</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => ref.current?.click()}>+ Thêm</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={onClearAll}>🗑️ Xoá hết</button>
            </div>
          </div>
          <div className="multi-image-grid">
            {images.map((img, i) => (
              <div key={i} className="multi-image-item">
                <img src={img.url} alt={img.name || `SP ${i + 1}`} />
                <div className="multi-image-overlay"><button className="multi-image-remove" onClick={() => onRemove(i)}>✕</button></div>
                <div className="multi-image-label">#{i + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadZone({ image, onUpload, onClear, label }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  return (
    <div className={`upload-zone ${image ? 'has-image' : ''} ${drag ? 'drag-over' : ''}`}
      onClick={() => !image && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]); }}>
      {image ? (
        <>
          <img src={image.url} alt="Preview" className="upload-preview" />
          <div className="upload-overlay">
            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onClear(); }}>🗑️</button>
            <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); ref.current?.click(); }} style={{ marginLeft: '8px' }}>🔄</button>
          </div>
        </>
      ) : (
        <>
          <div className="upload-icon">📁</div>
          <div className="upload-text">{label}</div>
        </>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onUpload(e.target.files[0]); }} />
    </div>
  );
}

function PromptCard({ title, subtitle, prompt, onCopy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '10px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <div className="flex-between" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: '2px' }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onCopy(); }}>📋 Copy</button>
          <span style={{ fontSize: '0.8rem', color: 'var(--c-text-3)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      <div style={{
        padding: open ? '0 14px 14px' : '0 14px 10px',
        fontFamily: 'var(--font-mono)', fontSize: '0.78rem', lineHeight: 1.7,
        color: open ? 'var(--c-text-2)' : 'var(--c-text-3)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        maxHeight: open ? '600px' : '60px', overflow: 'hidden',
        transition: 'max-height 0.3s ease',
      }}>
        {prompt}
      </div>
    </div>
  );
}

function StoryboardCard({ frame, index, total, onCopy }) {
  return (
    <>
      <div className="storyboard-frame" onClick={onCopy} title={`Click để copy prompt Frame ${index + 1}`} style={{ cursor: 'pointer' }}>
        <div className="frame-placeholder" style={{ flexDirection: 'column', gap: '4px', padding: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🖼️</span>
          <span style={{ fontSize: '0.55rem', color: 'var(--c-text-3)', textAlign: 'center', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {frame.description?.substring(0, 50)}
          </span>
        </div>
        <div className="frame-label">#{index + 1} {frame.label?.substring(0, 15)}</div>
      </div>
      {index < total - 1 && (
        <div className="storyboard-connector">
          <span className="arrow">→</span>
          <span>Clip {index + 1}</span>
          <span style={{ fontSize: '0.6rem' }}>8s</span>
        </div>
      )}
    </>
  );
}

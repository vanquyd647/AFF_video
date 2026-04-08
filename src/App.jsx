import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';
import {
  MODELS, fileToBase64, createSession, getSession, deleteSession,
  saveApiKey, checkApiKey, saveSettings, saveImages, savePortrait as savePortraitApi,
  saveResult as saveResultApi, generate, getHistory,
} from './api';
import { CATEGORIES, VIDEO_STYLES, DURATION_OPTIONS } from './templates';

export default function App() {
  // ─── State ───
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [apiStatus, setApiStatus] = useState('idle'); // idle | checking | valid | invalid
  const [showKey, setShowKey] = useState(false);
  const [textModel, setTextModel] = useState(MODELS.text[0].id);

  // Product
  const [productImages, setProductImages] = useState([]);
  const [portraitEnabled, setPortraitEnabled] = useState(false);
  const [portraitImage, setPortraitImage] = useState(null);
  const [category, setCategory] = useState('auto');
  const [notes, setNotes] = useState('');

  // Video config
  const [videoStyle, setVideoStyle] = useState('product_showcase');
  const [duration, setDuration] = useState(16);

  // Results
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null); // { tokenUsage, optimization, durationMs }

  // History
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

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

  // ─── Init: restore session from server ───
  useEffect(() => {
    (async () => {
      try {
        const { session } = await getSession();
        if (session) {
          // Restore settings
          if (session.settings) {
            setTextModel(session.settings.textModel || MODELS.text[0].id);
            setCategory(session.settings.category || 'auto');
            setVideoStyle(session.settings.videoStyle || 'product_showcase');
            setDuration(session.settings.duration || 16);
            setPortraitEnabled(session.settings.portraitEnabled || false);
            setNotes(session.settings.notes || '');
          }
          if (session.step) setStep(session.step);
          if (session.result) setResult(session.result);

          // Restore image count (images are on server, show placeholders)
          if (session.images?.length) {
            setProductImages(session.images.map((img, i) => ({
              mimeType: img.mimeType,
              name: img.name || `SP ${i + 1}`,
              hasData: true,
              url: '', // no blob URL, show placeholder
            })));
          }
        }

        // Check if API key is saved on server
        const { hasKey } = await checkApiKey();
        if (hasKey) setApiStatus('valid');
      } catch {
        // No session yet, that's fine
      }
    })();
  }, []);

  // ─── Save API Key (to server, encrypted) ───
  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setApiStatus('checking');
    try {
      await saveApiKey(apiKey);
      setApiStatus('valid');
      setApiKey(''); // Clear from frontend memory
      addToast('✅ API Key đã lưu an toàn trên server!', 'success');
    } catch (err) {
      setApiStatus('invalid');
      addToast(`❌ ${err.message}`, 'error');
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
    setProductImages(prev => {
      const next = [...prev, ...imgs];
      // Save to server (background)
      saveImages(next.map(({ url, ...rest }) => rest)).catch(() => {});
      return next;
    });
    if (imgs.length) addToast(`📸 Đã thêm ${imgs.length} ảnh`, 'success');
  }, [addToast]);

  const removeImage = useCallback((i) => {
    setProductImages(prev => {
      const next = [...prev];
      if (next[i]?.url) URL.revokeObjectURL(next[i].url);
      next.splice(i, 1);
      saveImages(next.map(({ url, ...rest }) => rest)).catch(() => {});
      return next;
    });
  }, []);

  const handleSingleUpload = useCallback(async (file, setter) => {
    if (!file?.type.startsWith('image/')) return;
    const { data, mimeType } = await fileToBase64(file);
    const img = { data, mimeType, url: URL.createObjectURL(file) };
    setter(img);
    savePortraitApi({ data, mimeType }).catch(() => {});
  }, []);

  // ─── Auto-save settings when they change ───
  const settingsTimer = useRef(null);
  useEffect(() => {
    if (apiStatus !== 'valid') return;
    clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      saveSettings({ textModel, category, videoStyle, duration, portraitEnabled, notes }).catch(() => {});
    }, 1000);
  }, [textModel, category, videoStyle, duration, portraitEnabled, notes, apiStatus]);

  // ═══ MAIN: Generate via backend ═══
  const handleGenerate = useCallback(async () => {
    if (productImages.length === 0 || apiStatus !== 'valid') return;
    setGenerating(true);
    setResult(null);
    setTokenInfo(null);
    try {
      const images = productImages.map(({ url, ...rest }) => rest);

      addToast('🧠 Đang phân tích & sinh prompt... (30-60s)', 'info');

      const data = await generate({
        model: textModel,
        category, notes, duration, videoStyle,
        hasPortrait: portraitEnabled && !!portraitImage,
        imageCount: productImages.length,
        images,
      });

      setResult(data.result);
      setTokenInfo({
        tokenUsage: data.tokenUsage,
        optimization: data.optimization,
        durationMs: data.durationMs,
      });
      setStep(2);
      addToast(`✅ Hoàn tất! Tokens: ${data.tokenUsage?.totalTokens || '?'}, Time: ${Math.round((data.durationMs || 0) / 1000)}s`, 'success');
    } catch (err) {
      addToast(`❌ ${err.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  }, [productImages, apiStatus, textModel, category, notes, duration, videoStyle, portraitEnabled, portraitImage, addToast]);

  // ─── History ───
  const loadHistory = useCallback(async () => {
    try {
      const { history: h } = await getHistory();
      setHistory(h || []);
      setShowHistory(true);
    } catch { addToast('❌ Không tải được lịch sử', 'error'); }
  }, [addToast]);

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

  // ─── Clear Session ───
  const handleClearSession = useCallback(async () => {
    try {
      await deleteSession();
      setStep(0); setApiStatus('idle'); setApiKey('');
      setProductImages([]); setPortraitImage(null); setResult(null);
      setNotes(''); setCategory('auto'); setDuration(16);
      setVideoStyle('product_showcase'); setTokenInfo(null);
      addToast('🗑️ Đã xoá phiên làm việc', 'success');
    } catch { addToast('❌ Không xoá được session', 'error'); }
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadHistory} title="Lịch sử">📜</button>
          <button className="btn btn-ghost btn-sm" onClick={handleClearSession} title="Xoá session" style={{ color: 'var(--c-danger)' }}>🗑️</button>
          <span className={`api-key-status ${apiStatus}`}>
            {apiStatus === 'valid' ? '🟢 Secured' : apiStatus === 'checking' ? '🟡 Checking...' : apiStatus === 'invalid' ? '🔴 Invalid' : '⚪ Not set'}
          </span>
        </div>
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

        {/* ═══ STEP 0: API Key (saved to server) ═══ */}
        {step === 0 && (
          <div className="fade-in">
            <div className="glass-card glow">
              <div className="card-header"><div className="card-icon purple">🔑</div><h3>Cấu Hình API</h3></div>
              {apiStatus === 'valid' ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔒</div>
                  <div style={{ fontWeight: 600, color: 'var(--c-success)' }}>API Key đã lưu an toàn trên server</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--c-text-3)', marginTop: '4px' }}>Key được mã hoá AES-256-GCM, không lưu trên trình duyệt</div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setApiStatus('idle'); }}>🔄 Đổi Key</button>
                    <button className="btn btn-primary btn-lg" onClick={() => setStep(1)}>Tiếp Tục →</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="input-group" style={{ marginBottom: '16px' }}>
                    <label>Gemini API Key</label>
                    <div className="api-key-wrapper">
                      <input type={showKey ? 'text' : 'password'} className="input-field mono" placeholder="AIza..."
                        value={apiKey} onChange={e => setApiKey(e.target.value)} />
                      <button className="btn btn-icon btn-ghost" onClick={() => setShowKey(!showKey)}>{showKey ? '🙈' : '👁'}</button>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveApiKey} disabled={!apiKey.trim() || apiStatus === 'checking'}>
                        {apiStatus === 'checking' ? <span className="spinner" /> : '🔒 Lưu An Toàn'}
                      </button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--c-text-3)', marginTop: '6px' }}>
                      🛡️ Key sẽ được mã hoá và lưu trên server. Không lưu trên trình duyệt.
                    </div>
                  </div>
                </>
              )}
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
              {apiStatus === 'valid' && (
                <div style={{ marginTop: '24px', textAlign: 'right' }}>
                  <button className="btn btn-primary btn-lg" onClick={() => setStep(1)}>Tiếp Tục →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 1: Config & Generate ═══ */}
        {step === 1 && (
          <div className="fade-in">
            <div className="glass-card glow" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <div className="card-icon purple">📸</div>
                <h3>Ảnh Sản Phẩm</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--c-text-3)', marginLeft: 'auto' }}>{productImages.length} ảnh</span>
              </div>
              <MultiUploadZone images={productImages} onUpload={handleMultiUpload} onRemove={removeImage}
                onClearAll={() => { productImages.forEach(i => i.url && URL.revokeObjectURL(i.url)); setProductImages([]); saveImages([]).catch(() => {}); }} />
            </div>

            <div className="section-grid">
              <div className="glass-card">
                <div className="card-header"><div className="card-icon pink">👤</div><h3>Chân Dung (Tuỳ Chọn)</h3></div>
                <div className="toggle-wrapper" style={{ marginBottom: '12px' }}>
                  <div className={`toggle ${portraitEnabled ? 'active' : ''}`} onClick={() => setPortraitEnabled(!portraitEnabled)} />
                  <span className="toggle-label">{portraitEnabled ? 'Bật' : 'Tắt'}</span>
                </div>
                {portraitEnabled && (
                  <UploadZone image={portraitImage} onUpload={f => handleSingleUpload(f, setPortraitImage)} onClear={() => { setPortraitImage(null); savePortraitApi(null).catch(() => {}); }} label="Ảnh chân dung" />
                )}
              </div>

              <div className="glass-card">
                <div className="card-header"><div className="card-icon green">🏷️</div><h3>Loại Sản Phẩm</h3></div>
                <div className="category-pills">
                  {CATEGORIES.map(c => (
                    <button key={c.id} className={`category-pill ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>{c.label}</button>
                  ))}
                </div>
              </div>

              <div className="glass-card">
                <div className="card-header"><div className="card-icon pink">⏱️</div><h3>Thời Lượng Video</h3></div>
                <div className="duration-selector">
                  {DURATION_OPTIONS.map(d => (
                    <button key={d.seconds} className={`duration-btn ${duration === d.seconds ? 'active' : ''}`} onClick={() => setDuration(d.seconds)}>{d.label}</button>
                  ))}
                </div>
                <div className="duration-info">⚡ {dur.clips} clips × 8s = {dur.seconds}s → Cần {dur.frames} ảnh (thuật toán N+1)</div>
              </div>

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

              <div className="glass-card section-full">
                <div className="card-header"><div className="card-icon green">📝</div><h3>Ghi Chú Thêm</h3></div>
                <textarea className="input-field" placeholder="VD: Nhấn mạnh giá rẻ, target gen Z, dùng tone funny..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

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
                  <><span className="spinner" /> Đang phân tích & sinh prompt...</>
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

            {/* Token Info bar */}
            {tokenInfo && (
              <div className="glass-card" style={{ marginBottom: '16px', padding: '12px 16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--c-text-3)' }}>
                <span>🪙 Tokens: <strong style={{ color: 'var(--c-text-1)' }}>{tokenInfo.tokenUsage?.totalTokens?.toLocaleString()}</strong></span>
                <span>⏱️ Time: <strong style={{ color: 'var(--c-text-1)' }}>{Math.round((tokenInfo.durationMs || 0) / 1000)}s</strong></span>
                {tokenInfo.optimization?.totalSavedPercent > 0 && (
                  <span>🗜️ Image optimized: <strong style={{ color: 'var(--c-success)' }}>-{tokenInfo.optimization.totalSavedPercent}%</strong></span>
                )}
              </div>
            )}

            {productImages.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
                {productImages.map((img, i) => (
                  img.url ? (
                    <img key={i} src={img.url} alt={`SP ${i + 1}`} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--c-border)', flexShrink: 0 }} />
                  ) : (
                    <div key={i} style={{ width: '56px', height: '56px', borderRadius: '8px', border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--c-text-3)', background: 'var(--c-bg-2)', flexShrink: 0 }}>📷 {i + 1}</div>
                  )
                ))}
              </div>
            )}

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

            {result.storyboardSummary && (
              <div className="glass-card" style={{ marginBottom: '20px', background: 'var(--c-primary-dim)', borderColor: 'rgba(139,92,246,0.3)' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>📖 Kịch Bản Video</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--c-text-2)', lineHeight: 1.7 }}>{result.storyboardSummary}</div>
              </div>
            )}

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

            {result.videoPromptPack?.length > 0 && (
              <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div className="card-header"><div className="card-icon purple">🎥</div><h3>Image-to-Video Prompt Pack — {result.videoPromptPack.length} Prompts</h3></div>
                <p style={{ fontSize: '0.8rem', color: 'var(--c-text-3)', marginBottom: '12px' }}>
                  Bộ prompt bổ sung cho Veo (image-to-video), phù hợp các biến thể quay khác nhau.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => copyAll(result.videoPromptPack, 'prompt', 'Video Prompt Pack')}>📋 Copy Tất Cả Video Prompt Pack</button>
                </div>
                {result.videoPromptPack.map((item, i) => (
                  <PromptCard key={i}
                    title={`Pack ${i + 1}/${result.videoPromptPack.length} — ${item.label || `Variation ${i + 1}`}`}
                    subtitle={[item.motionAmount ? `Motion: ${item.motionAmount}` : '', item.cinematography ? `Camera: ${item.cinematography}` : ''].filter(Boolean).join(' | ') || item.description}
                    prompt={item.prompt}
                    onCopy={() => copy(item.prompt, `Video Pack ${i + 1}`)} />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Quay lại chỉnh sửa</button>
              <button className="btn btn-secondary" onClick={() => {
                const all = `=== PHÂN TÍCH ===\n${JSON.stringify(result.analysis, null, 2)}\n\n=== KỊCH BẢN ===\n${result.storyboardSummary}\n\n=== FRAME PROMPTS ===\n${result.frames?.map((f, i) => `--- Frame ${i + 1}: ${f.label} ---\n${f.prompt}`).join('\n\n')}\n\n=== CLIP PROMPTS ===\n${result.clips?.map((c, i) => `--- Clip ${i + 1}: ${c.label} ---\n${c.prompt}`).join('\n\n')}`;
                copy(all, 'toàn bộ kết quả');
              }}>📋 Copy Toàn Bộ</button>
              <button className="btn btn-primary" onClick={() => { setResult(null); setTokenInfo(null); setStep(1); }}>🔄 Sinh Lại Mới</button>
            </div>
          </div>
        )}
      </main>

      {/* ═══ History Modal ═══ */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="glass-card" style={{ maxWidth: '600px', width: '90%', maxHeight: '70vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <div className="card-icon purple">📜</div>
              <h3>Lịch Sử Generate</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(false)} style={{ marginLeft: 'auto' }}>✕</button>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--c-text-3)' }}>Chưa có lịch sử</div>
            ) : (
              history.map((h, i) => (
                <div key={i} style={{ padding: '12px', borderBottom: '1px solid var(--c-border)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{h.input?.category || 'auto'} • {h.input?.duration}s • {h.input?.videoStyle}</strong>
                    <span style={{ color: 'var(--c-text-3)', fontSize: '0.75rem' }}>{new Date(h.createdAt).toLocaleString('vi')}</span>
                  </div>
                  <div style={{ color: 'var(--c-text-3)', fontSize: '0.75rem', marginTop: '4px' }}>
                    📸 {h.input?.imageCount} ảnh • 🪙 {h.tokenUsage?.totalTokens} tokens • ⏱️ {Math.round((h.durationMs || 0) / 1000)}s
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </div>
  );
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
                {img.url ? (
                  <img src={img.url} alt={img.name || `SP ${i + 1}`} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg-3)', fontSize: '0.7rem', color: 'var(--c-text-3)' }}>📷 {img.name || i + 1}</div>
                )}
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

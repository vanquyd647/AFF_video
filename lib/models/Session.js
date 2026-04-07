/* ═══ Session Model (Serverless) ═══ */
import mongoose from 'mongoose';

// Prevent model recompilation in serverless hot reloads
const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  apiKeyEncrypted: { type: String, default: null },
  settings: {
    textModel: { type: String, default: 'gemini-2.5-flash' },
    category: { type: String, default: 'auto' },
    videoStyle: { type: String, default: 'product_showcase' },
    duration: { type: Number, default: 16 },
    portraitEnabled: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  images: [{
    data: String,       // base64
    mimeType: String,
    name: String,
  }],
  portraitImage: {
    data: String,
    mimeType: String,
  },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  step: { type: Number, default: 0 },
  lastActiveAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// TTL index — auto-delete after 7 days of inactivity
sessionSchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);

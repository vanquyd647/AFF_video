/* ═══ History Model (Serverless) ═══ */
import mongoose from 'mongoose';

const historySchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, index: true },
  type: { type: String, enum: ['generation'], default: 'generation' },
  input: {
    imageCount: Number,
    category: String,
    duration: Number,
    videoStyle: String,
    model: String,
    notes: String,
  },
  result: {
    analysis: mongoose.Schema.Types.Mixed,
    storyboardSummary: String,
    frames: [mongoose.Schema.Types.Mixed],
    clips: [mongoose.Schema.Types.Mixed],
  },
  tokenUsage: {
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
  },
  durationMs: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Auto-delete history after 30 days
historySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export default mongoose.models.History || mongoose.model('History', historySchema);

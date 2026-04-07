/* ═══ MongoDB Connection Singleton for Vercel Serverless ═══
   Reuses connection across invocations within the same lambda container */
import mongoose from 'mongoose';

let cached = global.__mongooseCache;

if (!cached) {
  cached = global.__mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    }).then((m) => {
      console.log('✅ MongoDB connected (serverless)');
      return m;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

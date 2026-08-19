/**
 * Application configuration.
 *
 * Firebase config comes from config.json or environment variables.
 * Gemini API key is NO LONGER needed — the backend uses Vertex AI with Application Default Credentials.
 */

import raw from "@/config.json";

// Firebase config from config.json or env vars
export const firebaseConfig = {
  apiKey: process.env.REACT_APP_FB_API_KEY || raw.firebase?.apiKey || "",
  authDomain: process.env.REACT_APP_FB_AUTH_DOMAIN || raw.firebase?.authDomain || "",
  projectId: process.env.REACT_APP_FB_PROJECT_ID || raw.firebase?.projectId || "",
  storageBucket: process.env.REACT_APP_FB_STORAGE_BUCKET || raw.firebase?.storageBucket || "",
  messagingSenderId: process.env.REACT_APP_FB_SENDER_ID || raw.firebase?.messagingSenderId || "",
  appId: process.env.REACT_APP_FB_APP_ID || raw.firebase?.appId || "",
};

// Firebase is always required
export const FIREBASE_READY = !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_"));

// Gemini is always available via backend proxy
export const GEMINI_READY = true;

// Demo mode removed
export const IS_DEMO = false;

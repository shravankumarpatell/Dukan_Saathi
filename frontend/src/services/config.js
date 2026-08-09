import cfg from "@/config.json";

const env = process.env;

function pick(envVal, jsonVal) {
  if (envVal && envVal.trim() && !envVal.startsWith("YOUR_")) return envVal.trim();
  if (jsonVal && !String(jsonVal).startsWith("YOUR_")) return jsonVal;
  return "";
}

export const firebaseConfig = {
  apiKey: pick(env.REACT_APP_FIREBASE_API_KEY, cfg.firebase.apiKey),
  authDomain: pick(env.REACT_APP_FIREBASE_AUTH_DOMAIN, cfg.firebase.authDomain),
  projectId: pick(env.REACT_APP_FIREBASE_PROJECT_ID, cfg.firebase.projectId),
  storageBucket: pick(env.REACT_APP_FIREBASE_STORAGE_BUCKET, cfg.firebase.storageBucket),
  messagingSenderId: pick(env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID, cfg.firebase.messagingSenderId),
  appId: pick(env.REACT_APP_FIREBASE_APP_ID, cfg.firebase.appId),
};

export const geminiConfig = {
  apiKey: pick(env.REACT_APP_GEMINI_API_KEY, cfg.gemini.apiKey),
  model: pick(env.REACT_APP_GEMINI_MODEL, cfg.gemini.model) || "gemini-flash-latest",
};

export const FIREBASE_READY = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const GEMINI_READY = Boolean(geminiConfig.apiKey);
// The whole app falls back to DEMO mode (local storage + local NLU) until Firebase is configured.
export const IS_DEMO = !FIREBASE_READY;

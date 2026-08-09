// Auth abstraction. DEMO mode -> local demo shop. Firebase mode -> Google sign-in.
import { IS_DEMO } from "@/services/config";
import { auth, googleProvider } from "@/firebase";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";

const DEMO_USER_KEY = "dukansaathi_demo_user";

export function onAuth(cb) {
  if (IS_DEMO) {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    cb(raw ? JSON.parse(raw) : null);
    const handler = (e) => {
      if (e.key === DEMO_USER_KEY) cb(e.newValue ? JSON.parse(e.newValue) : null);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
  return onAuthStateChanged(auth, (u) => {
    if (!u) return cb(null);
    cb({ uid: u.uid, name: u.displayName || "Shop Owner", email: u.email, photo: u.photoURL });
  });
}

export async function signInDemo(shopName) {
  const user = { uid: "demo-shop", name: shopName || "Demo Owner", email: "demo@dukansaathi.app", photo: null, shopName: shopName || "Demo Tiles & Sanitary" };
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new StorageEvent("storage", { key: DEMO_USER_KEY, newValue: JSON.stringify(user) }));
  return user;
}

export async function signInGoogle() {
  const res = await signInWithPopup(auth, googleProvider);
  const u = res.user;
  return { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL };
}

export async function signOut() {
  if (IS_DEMO) {
    localStorage.removeItem(DEMO_USER_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: DEMO_USER_KEY, newValue: null }));
    return;
  }
  await fbSignOut(auth);
}

/**
 * Authentication service — Firebase Auth only.
 * Demo mode has been removed.
 */

import { getAuth, signInWithPopup, GoogleAuthProvider, signOut as fbSignOut } from "firebase/auth";
import "@/firebase";

const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

/**
 * Listen for auth state changes. Calls cb with user object or null.
 */
export function onAuth(cb) {
  return auth.onAuthStateChanged((fbUser) => {
    if (fbUser) {
      cb({
        uid: fbUser.uid,
        name: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
        email: fbUser.email,
        picture: fbUser.photoURL,
      });
    } else {
      cb(null);
    }
  });
}

/**
 * Sign in with Google.
 */
export async function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Sign out.
 */
export async function signOut() {
  return fbSignOut(auth);
}

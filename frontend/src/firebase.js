/**
 * Firebase client SDK initialization.
 * Always initializes — Firebase is required for authentication.
 */

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { firebaseConfig, FIREBASE_READY } from "@/services/config";

let app = null;
let auth = null;
let googleProvider = null;

if (FIREBASE_READY) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
}

export { app, auth, googleProvider };

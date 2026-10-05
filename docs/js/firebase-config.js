// Paste the web-app config from Firebase console → Project settings → Your apps.
// These values are safe to publish; access is controlled by firestore.rules and storage.rules.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// Region the Cloud Functions are deployed to (must match functions/index.js).
export const functionsRegion = "us-central1";

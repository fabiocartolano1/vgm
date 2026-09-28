// Init Firebase (SDK "compat", chargé en <script> classique juste avant, voir index.html).
// Expose window.db pour que app.js puisse lire/écrire dans Firestore sans bundler.
const firebaseConfig = {
  apiKey: "AIzaSyBd0nyfsLL7Fc3D7tzD7GdlzJYYyHMgZfM",
  authDomain: "video-game-masters.firebaseapp.com",
  projectId: "video-game-masters",
  storageBucket: "video-game-masters.firebasestorage.app",
  messagingSenderId: "637475692689",
  appId: "1:637475692689:web:a2f69ed50749416c525f30",
  measurementId: "G-L0N2PGNQC7",
};

firebase.initializeApp(firebaseConfig);
window.db = firebase.firestore();

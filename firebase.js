// Init Firebase (SDK "compat", chargé en <script> classique juste avant, voir index.html).
// Expose window.db pour que app.js puisse lire/écrire dans Firestore sans bundler.
// authDomain par défaut (déjà autorisé dans le client OAuth Google). La
// connexion passe par une popup (voir app.js), qui ne dépend pas du stockage
// partagé entre .web.app et .firebaseapp.com que Safari et Chrome bloquent.
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
window.auth = firebase.auth();
window.functions = firebase.functions();

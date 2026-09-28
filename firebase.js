// Init Firebase (SDK "compat", chargé en <script> classique juste avant, voir index.html).
// Expose window.db pour que app.js puisse lire/écrire dans Firestore sans bundler.
// authDomain pointe sur le domaine Hosting de l'app (et non sur
// <projet>.firebaseapp.com, la valeur par défaut) : Firebase Hosting
// proxifie automatiquement /__/auth/handler et /__/auth/iframe vers Auth,
// ce qui rend tout le flux "same origin" du point de vue du navigateur.
// Sans ça, la redirection de connexion Google échoue silencieusement sur
// Safari iOS (ITP bloque le storage cross-site entre .web.app et
// .firebaseapp.com, considérés comme deux sites différents) : on revient
// sur la page après avoir choisi son compte, sans jamais être connecté.
const firebaseConfig = {
  apiKey: "AIzaSyBd0nyfsLL7Fc3D7tzD7GdlzJYYyHMgZfM",
  authDomain: "video-game-masters.web.app",
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

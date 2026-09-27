// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBd0nyfsLL7Fc3D7tzD7GdlzJYYyHMgZfM",
    authDomain: "video-game-masters.firebaseapp.com",
    projectId: "video-game-masters",
    storageBucket: "video-game-masters.firebasestorage.app",
    messagingSenderId: "637475692689",
    appId: "1:637475692689:web:a2f69ed50749416c525f30",
    measurementId: "G-L0N2PGNQC7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
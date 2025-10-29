// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
  authDomain: "portisapp.firebaseapp.com",
  projectId: "portisapp",
  storageBucket: "portisapp.firebasestorage.app",
  messagingSenderId: "38313359657",
  appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
  measurementId: "G-HQ29Y8Z2DY"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

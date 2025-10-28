// =======================
// 1. CONFIGURACIÓN DE FIREBASE
// =======================
// ¡¡¡PEGA AQUÍ TU OBJETO firebaseConfig!!!
const firebaseConfig = {
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38"
};

// =======================
// 2. INICIALIZACIÓN DE SERVICIOS
// =======================
// No necesitas "exportar" nada, los SDKs se adjuntan
// al objeto global 'firebase'
firebase.initializeApp(firebaseConfig);

// Hacemos que 'auth' y 'db' sean fáciles de acceder
// (aunque también puedes usar firebase.auth() y firebase.firestore())
const auth = firebase.auth();
const db = firebase.firestore();
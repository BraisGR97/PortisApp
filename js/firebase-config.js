// js/firebase-config.js
// Firebase SDK (compat) + configuración
// NOTA: estamos usando las versiones "compat" para poder usar la API global
// y mantener el código simple para este ejemplo.

const firebaseScriptApp = document.createElement('script');
firebaseScriptApp.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js";
document.head.appendChild(firebaseScriptApp);

const firebaseScriptAuth = document.createElement('script');
firebaseScriptAuth.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js";
document.head.appendChild(firebaseScriptAuth);

const firebaseScriptFirestore = document.createElement('script');
firebaseScriptFirestore.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js";
document.head.appendChild(firebaseScriptFirestore);

// Espera a que los scripts se carguen antes de inicializar
firebaseScriptFirestore.onload = () => {
  const firebaseConfig = {
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
    measurementId: "G-HQ29Y8Z2DY"
  };

  // Inicializar Firebase (compat)
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Exportar referencias globales para usar en los scripts
  window.auth = firebase.auth();
  window.db = firebase.firestore();
};

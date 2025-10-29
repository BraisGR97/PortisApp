// js/firebase-config.js
// Carga de SDK compat desde CDN y inicialización con tu config

(function loadFirebaseCompat(){
  const urls = [
    "https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js"
  ];

  let loaded = 0;
  function scriptLoaded(){
    loaded++;
    if(loaded === urls.length){
      initFirebase();
    }
  }

  urls.forEach(src=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = scriptLoaded;
    s.onerror = ()=> console.error("No se pudo cargar", src);
    document.head.appendChild(s);
  });

  function initFirebase(){
    const firebaseConfig = {
      apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
      authDomain: "portisapp.firebaseapp.com",
      projectId: "portisapp",
      storageBucket: "portisapp.firebasestorage.app",
      messagingSenderId: "38313359657",
      appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
      measurementId: "G-HQ29Y8Z2DY"
    };

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    window.auth = firebase.auth();
    window.db = firebase.firestore();
    console.log("✅ Firebase inicializado (compat).");
  }
})();

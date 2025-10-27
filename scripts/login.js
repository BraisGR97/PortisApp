// ----- Configura Firebase -----
// Sustituye con tu propia configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
  authDomain: "portisapp.firebaseapp.com",
  projectId: "portisapp",
  storageBucket: "portisapp.firebasestorage.app",
  messagingSenderId: "38313359657",
  appId: "1:38313359657:web:ae73a0f8f7556bed92df38"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Usuarios válidos predefinidos
const validUsers = {
  "usuario1": "pass1",
  "usuario2": "pass2",
  "usuario3": "pass3"
};

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const message = document.getElementById('message');

loginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if(validUsers[username] && validUsers[username] === password){
    // Guardar usuario actual
    localStorage.setItem('currentUser', username);

    // Crear documento de usuario en Firebase si no existe
    const userRef = db.collection('users').doc(username);
    userRef.get().then(doc => {
      if(!doc.exists){
        userRef.set({ createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      // Redirigir al menú principal
      window.location.href = 'main.html';
    });
  } else {
    message.textContent = "Usuario o contraseña incorrectos";
  }
});

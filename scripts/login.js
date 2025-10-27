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

// Usuarios predefinidos (para login inicial)
const validUsers = {
  "usuario1": "pass1",
  "usuario2": "pass2"
};

// DOM login
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const message = document.getElementById('message');

// DOM registro
const registerModal = document.getElementById('registerModal');
const closeRegister = document.getElementById('closeRegister');
const regUser = document.getElementById('regUser');
const regPass = document.getElementById('regPass');
const regConfirm = document.getElementById('regConfirm');
const confirmRegister = document.getElementById('confirmRegister');
const regMessage = document.getElementById('regMessage');

// --- LOGIN ---
loginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if(validUsers[username] && validUsers[username] === password){
    localStorage.setItem('currentUser', username);

    const userRef = db.collection('users').doc(username);
    userRef.get().then(doc => {
      if(!doc.exists){
        userRef.set({ createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      window.location.href = 'main.html';
    });
  } else {
    message.textContent = "Usuario o contraseña incorrectos";
  }
});

// --- MODAL REGISTRO ---
registerBtn.addEventListener('click', () => registerModal.style.display = 'flex');
closeRegister.addEventListener('click', () => registerModal.style.display = 'none');
window.addEventListener('click', e => { if(e.target===registerModal) registerModal.style.display='none'; });

// --- VALIDACIÓN EN TIEMPO REAL ---
regConfirm.addEventListener('input', () => {
  if(regConfirm.value === regPass.value && regPass.value.length > 0){
    regConfirm.style.borderColor = "green";
  } else {
    regConfirm.style.borderColor = "red";
  }
});

// --- CONFIRMAR REGISTRO ---
confirmRegister.addEventListener('click', () => {
  const username = regUser.value.trim();
  const password = regPass.value;
  const confirm = regConfirm.value;

  if(!username || !password || !confirm){
    regMessage.textContent = "Completa todos los campos";
    regMessage.style.color = "red";
    return;
  }

  if(password !== confirm){
    regMessage.textContent = "Las contraseñas no coinciden";
    regMessage.style.color = "red";
    return;
  }

  // Crear usuario en Firebase
  const userRef = db.collection('users').doc(username);
  userRef.get().then(doc => {
    if(doc.exists){
      regMessage.textContent = "Usuario ya existe";
      regMessage.style.color = "red";
    } else {
      userRef.set({ password: password, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(() => {
        validUsers[username] = password; // añadir al objeto de login
        regMessage.textContent = "Usuario registrado con éxito";
        regMessage.style.color = "green";
        // Limpiar inputs
        regUser.value = regPass.value = regConfirm.value = '';
        regConfirm.style.borderColor = "";
        setTimeout(() => registerModal.style.display='none', 1000);
      });
    }
  });
});

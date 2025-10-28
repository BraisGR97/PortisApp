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

// DOM login
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const message = document.getElementById('message');

// Modal registro DOM (se mantienen si ya existen)
const registerModal = document.getElementById('registerModal');
const closeRegister = document.getElementById('closeRegister');
const regUser = document.getElementById('regUser');
const regPass = document.getElementById('regPass');
const regConfirm = document.getElementById('regConfirm');
const confirmRegister = document.getElementById('confirmRegister');
const regMessage = document.getElementById('regMessage');

// --- LOGIN usando Firestore ---
loginBtn.addEventListener('click', async () => {
  message.textContent = '';

  const username = (usernameInput.value || '').trim();
  const password = passwordInput.value || '';

  if (!username || !password) {
    message.textContent = 'Introduce usuario y contraseña';
    return;
  }

  try {
    const userDoc = await db.collection('users').doc(username).get();
    if (!userDoc.exists) {
      message.textContent = 'Usuario o contraseña incorrectos';
      return;
    }

    const data = userDoc.data() || {};
    // Se espera que en Firestore guardes el campo "password" (texto plano por simplicidad; para producción usa hashing)
    if (!data.password) {
      message.textContent = 'Usuario sin contraseña configurada';
      return;
    }

    if (data.password === password) {
      // Login OK
      localStorage.setItem('currentUser', username);
      window.location.href = 'main.html';
    } else {
      message.textContent = 'Usuario o contraseña incorrectos';
    }
  } catch (err) {
    console.error('Error comprobando usuario en Firebase:', err);
    message.textContent = 'Error al conectar con el servidor';
  }
});

// --- MODAL REGISTRO (mantener funcionalidad anterior) ---
if (registerBtn && registerModal) {
  registerBtn.addEventListener('click', () => registerModal.style.display = 'flex');
}
if (closeRegister) {
  closeRegister.addEventListener('click', () => registerModal.style.display = 'none');
}
window.addEventListener('click', e => { if(e.target === registerModal) registerModal.style.display = 'none'; });

// --- VALIDACIÓN EN TIEMPO REAL para confirmación ---
if (regConfirm && regPass) {
  regConfirm.addEventListener('input', () => {
    if (regConfirm.value === regPass.value && regPass.value.length > 0) {
      regConfirm.style.borderColor = "green";
    } else {
      regConfirm.style.borderColor = "red";
    }
  });
}

// --- CONFIRMAR REGISTRO en Firestore ---
if (confirmRegister) {
  confirmRegister.addEventListener('click', async () => {
    const username = (regUser.value || '').trim();
    const password = regPass.value || '';
    const confirm = regConfirm.value || '';

    regMessage.textContent = '';

    if (!username || !password || !confirm) {
      regMessage.textContent = "Completa todos los campos";
      regMessage.style.color = "red";
      return;
    }
    if (password !== confirm) {
      regMessage.textContent = "Las contraseñas no coinciden";
      regMessage.style.color = "red";
      return;
    }

    try {
      const userRef = db.collection('users').doc(username);
      const doc = await userRef.get();
      if (doc.exists) {
        regMessage.textContent = "Usuario ya existe";
        regMessage.style.color = "red";
        return;
      }

      // Crea el documento con el password (texto plano por simplicidad)
      await userRef.set({
        password: password,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      regMessage.textContent = "Usuario registrado con éxito";
      regMessage.style.color = "green";
      regUser.value = regPass.value = regConfirm.value = '';
      regConfirm.style.borderColor = "";
      setTimeout(() => registerModal.style.display = 'none', 900);
    } catch (err) {
      console.error('Error registrando usuario:', err);
      regMessage.textContent = "Error al registrar";
      regMessage.style.color = "red";
    }
  });
}

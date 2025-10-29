// js/auth.js
// Lógica de login: busca en collection 'users' por campo username y compara password.
// Requiere que js/firebase-config.js ya haya cargado y creado window.db

function waitForDb(maxAttempts = 40, delay = 100) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const timer = setInterval(() => {
      if (window.db) {
        clearInterval(timer);
        resolve(window.db);
      } else if (++tries >= maxAttempts) {
        clearInterval(timer);
        reject(new Error("Firestore no inicializado"));
      }
    }, delay);
  });
}

(async () => {
  try {
    await waitForDb();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('loginError');
    if (el) el.textContent = "Error de conexión a la base de datos. Recarga la página.";
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) { errorEl.textContent = ""; errorEl.style.color = ""; }

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      if (errorEl) errorEl.textContent = "Rellena usuario y contraseña.";
      return;
    }

    try {
      // Consulta por username (esto funciona aunque los documentos tengan ID automático)
      const q = await db.collection('users').where('username', '==', username).limit(1).get();

      if (q.empty) {
        if (errorEl) errorEl.textContent = "Usuario no encontrado.";
        return;
      }

      const doc = q.docs[0];
      const data = doc.data();

      // Comprobación de contraseña (texto plano; ver notas de seguridad más abajo)
      if (data.password === password) {
        // Guardamos sesión simple en localStorage
        const session = {
          uid: doc.id,
          username: data.username,
          name: data.name || null,
          loggedAt: new Date().toISOString()
        };

        localStorage.setItem('portis_session', JSON.stringify(session));

        if (errorEl) {
          errorEl.style.color = "green";
          errorEl.textContent = "Inicio de sesión correcto. Redirigiendo…";
        }

        // Redirigir al menú (puedes cambiar a menu.html)
        setTimeout(() => window.location.href = 'menu.html', 700);
      } else {
        if (errorEl) errorEl.textContent = "Contraseña incorrecta.";
      }

    } catch (err) {
      console.error("Error login:", err);
      if (errorEl) errorEl.textContent = "Error en el inicio de sesión. Revisa la consola.";
    }
  });
})();

import { db } from "./firebase-config.js";
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ==== REGISTRO ====
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  const usernameInput = document.getElementById("registerUsername");
  const passInput = document.getElementById("registerPassword");
  const passRepeatInput = document.getElementById("registerPasswordRepeat");
  const message = document.getElementById("registerMessage");
  const backToLoginBtn = document.getElementById("backToLoginBtn");

  // Validación visual de contraseñas
  passRepeatInput.addEventListener("input", () => {
    if (passInput.value === passRepeatInput.value && passInput.value.length > 0) {
      passInput.style.borderColor = "#4CAF50";
      passRepeatInput.style.borderColor = "#4CAF50";
    } else {
      passInput.style.borderColor = "#e53935";
      passRepeatInput.style.borderColor = "#e53935";
    }
  });

  // Enviar formulario
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passInput.value.trim();
    const repeatPassword = passRepeatInput.value.trim();

    if (password !== repeatPassword) {
      message.textContent = "Las contraseñas no coinciden.";
      message.style.color = "#e53935";
      return;
    }

    // Verificar si el usuario ya existe
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      message.textContent = "Ese usuario ya existe.";
      message.style.color = "#e53935";
      return;
    }

    try {
      await addDoc(usersRef, {
        username: username,
        password: password,
      });

      message.textContent = "Cuenta creada con éxito ✅";
      message.style.color = "#4CAF50";

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    } catch (error) {
      console.error("Error al registrar:", error);
      message.textContent = "Error al crear la cuenta.";
      message.style.color = "#e53935";
    }
  });

  // Volver al login
  backToLoginBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

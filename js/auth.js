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

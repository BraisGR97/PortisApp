// js/auth.js
// Este script espera que js/firebase-config.js ya haya cargado y creado `window.db`
// Si no hay db aún (scripts cargan asincrónicamente) intentamos esperar brevemente.

function waitForDb(maxAttempts = 30, delay = 100) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const i = setInterval(() => {
      if (window.db) {
        clearInterval(i);
        resolve(window.db);
      } else {
        tries++;
        if (tries >= maxAttempts) {
          clearInterval(i);
          reject(new Error("No se ha podido inicializar Firestore"));
        }
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
    errorEl.textContent = "";

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      errorEl.textContent = "Rellena usuario y contraseña.";
      return;
    }

    try {
      // Buscamos en la colección `users` por el campo `username`
      const q = await db.collection('users').where('username', '==', username).limit(1).get();

      if (q.empty) {
        errorEl.textContent = "Usuario no encontrado.";
        return;
      }

      const doc = q.docs[0];
      const data = doc.data();

      // Comprobamos contraseña (nota: aquí se asume contraseña en texto plano)
      if (data.password === password) {
        // Autenticación correcta -> guardamos sesión local y redirigimos
        const session = {
          uid: doc.id,
          username: data.username,
          name: data.name || null,
          loggedAt: new Date().toISOString()
        };

        localStorage.setItem('portis_session', JSON.stringify(session));
        // Redirigir al menú principal
        window.location.href = 'menu.html';
      } else {
        errorEl.textContent = "Contraseña incorrecta.";
      }

    } catch (err) {
      console.error("Error login:", err);
      errorEl.textContent = "Error en el inicio de sesión. Revisa la consola.";
    }
  });
})();

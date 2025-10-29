// js/init_users.js
// Ejecutar una vez para crear usuario Admin en Firestore

(async () => {
  // Esperar a que firebase-config.js inicialice la base de datos
  function waitForDb(maxAttempts = 30, delay = 100) {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const i = setInterval(() => {
        if (window.db) {
          clearInterval(i);
          resolve(window.db);
        } else if (++tries >= maxAttempts) {
          clearInterval(i);
          reject("Firestore no inicializado");
        }
      }, delay);
    });
  }

  await waitForDb();

  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('username', '==', 'Admin').get();

  if (snapshot.empty) {
    await usersRef.add({
      username: 'Admin',
      password: '0000',
      name: 'Administrador'
    });
    console.log('✅ Usuario Admin creado.');
  } else {
    console.log('ℹ️ Usuario Admin ya existe.');
  }
})();

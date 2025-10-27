// Lista de usuarios válidos (podrás ampliarla)
const validUsers = {
  "brais": "1234",
  "admin": "0000"
};

document.getElementById("loginForm").addEventListener("submit", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const message = document.getElementById("loginMessage");

  if (!validUsers[username]) {
    message.textContent = "Usuario no autorizado";
    return;
  }

  if (validUsers[username] !== password) {
    message.textContent = "Contraseña incorrecta";
    return;
  }

  // Guardar sesión local
  localStorage.setItem("currentUser", username);

  // Cargar datos del usuario (si existen)
  try {
    const response = await fetch(`data/${username}.json`);
    if (!response.ok) throw new Error("No hay datos del usuario");
    const userData = await response.json();
    localStorage.setItem("userData", JSON.stringify(userData));
  } catch (err) {
    console.warn("No se encontró archivo de datos para este usuario.");
  }

  // Redirigir a la página principal
  window.location.href = "main.html";
});

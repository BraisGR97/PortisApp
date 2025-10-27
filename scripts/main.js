// Lista de usuarios válidos
const validUsers = {
  "admin": "1234",
  "brais": "pass123",
  "usuario1": "clave1"
};

document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorMessage = document.getElementById("error-message");

  if (validUsers[username] && validUsers[username] === password) {
    // Guarda sesión
    localStorage.setItem("loggedUser", username);
    window.location.href = "main.html";
  } else {
    errorMessage.textContent = "Usuario o contraseña incorrectos";
  }
});

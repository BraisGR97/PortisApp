// Usuarios válidos
const validUsers = {
  "admin": "1234",
  "brais": "1234",
  "usuario1": "clave1"
};

const form = document.getElementById("loginForm");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();
    const errorMessage = document.getElementById("error-message");

    if (validUsers[username] && validUsers[username] === password) {
      localStorage.setItem("loggedUser", username);
      window.location.href = "main.html";
    } else {
      errorMessage.textContent = "Usuario o contraseña incorrectos";
    }
  });
}

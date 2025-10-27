const currentUser = localStorage.getItem("currentUser");
const userData = localStorage.getItem("userData");

if (!currentUser) {
  // Si no hay sesión, volver al login
  window.location.href = "index.html";
}

document.getElementById("userName").textContent = currentUser;

if (userData) {
  document.getElementById("userDataDisplay").textContent = userData;
} else {
  document.getElementById("userDataDisplay").textContent = "Sin datos guardados.";
}

// Botón de logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("userData");
  window.location.href = "index.html";
});

const currentUser = localStorage.getItem("currentUser");
if (!currentUser) {
  // Si no hay sesión, redirige al login
  window.location.href = "index.html";
}

// Mostrar el nombre del usuario
document.getElementById("userName").textContent = currentUser;

// Botones del menú
const logoutBtn = document.getElementById("logoutBtn");
const maintenanceBtn = document.getElementById("maintenanceBtn");
const recordsBtn = document.getElementById("recordsBtn");

// Por ahora solo funciona "Cerrar sesión"
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("userData");
  window.location.href = "index.html";
});

// Los demás se configurarán más adelante
maintenanceBtn.addEventListener("click", () => {
  alert("La sección de mantenimiento estará disponible próximamente.");
});

recordsBtn.addEventListener("click", () => {
  alert("La sección de registro estará disponible próximamente.");
});

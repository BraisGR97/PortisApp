// main.js
const user = localStorage.getItem('currentUser');
if (!user) {
  window.location.href = 'index.html';
} else {
  document.getElementById('displayUser').textContent = user;
}

// Botón Cerrar sesión
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('userData');
  window.location.href = 'index.html';
});

// Botón Mantenimiento → abre maintenance.html
document.getElementById('maintenanceBtn').addEventListener('click', () => {
  window.location.href = 'maintenance.html';
});

// Botón Registro → se mantiene por ahora, puedes añadir la página más adelante
document.getElementById('recordsBtn').addEventListener('click', () => {
  // aquí iría la lógica de Registro
});

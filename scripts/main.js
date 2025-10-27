// main.js

// Comprobar sesión
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

// Botón Mantenimiento → abrir maintenance.html
document.getElementById('maintenanceBtn').addEventListener('click', () => {
  window.location.href = 'maintenance.html';
});

// Botón Registro → por ahora no hace nada, listo para futuras funciones
document.getElementById('recordsBtn').addEventListener('click', () => {
  // futura funcionalidad de Registro
});

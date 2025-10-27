// main.js
const user = localStorage.getItem('currentUser');
if (!user) {
  window.location.href = 'index.html';
} else {
  document.getElementById('displayUser').textContent = user;
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('userData');
  window.location.href = 'index.html';
});

// botones temporales (aviso)
document.getElementById('maintenanceBtn').addEventListener('click', () => {
  alert('Mantenimiento: sección en desarrollo');
});
document.getElementById('recordsBtn').addEventListener('click', () => {
  alert('Registro: sección en desarrollo');
});

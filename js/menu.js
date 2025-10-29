// js/menu.js
// Control de sesión básica y logout

document.addEventListener('DOMContentLoaded', () => {
  const session = JSON.parse(localStorage.getItem('portis_session'));
  const userSpan = document.getElementById('usernameDisplay');
  const logoutBtn = document.getElementById('logoutBtn');

  // Si no hay sesión -> redirigir a login
  if (!session || !session.username) {
    window.location.href = 'index.html';
    return;
  }

  // Mostrar nombre de usuario
  userSpan.textContent = session.username;

  // Botón de logout
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('portis_session');
    window.location.href = 'index.html';
  });
});

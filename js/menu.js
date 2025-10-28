// Referencias del DOM para menu.html
const menuLogoutBtn = document.getElementById('menu-logout-btn');

// Botón de Logout
menuLogoutBtn.addEventListener('click', () => {
    auth.signOut()
        .then(() => {
            // El auth-guard.js detectará el cambio de estado
            // y redirigirá a login.html automáticamente.
            console.log("Cierre de sesión exitoso.");
        })
        .catch(error => {
            console.error("Error al cerrar sesión:", error);
        });
});
// Este script se carga en menu.html, reparaciones.html, y registros.html

auth.onAuthStateChanged(user => {
    if (!user) {
        // Si no hay usuario, redirigir al login
        console.log("Acceso denegado: No hay usuario. Redirigiendo a login.html");
        // Aseguramos que solo redirige si NO estamos ya en la página de login
        if (window.location.pathname.endsWith("login.html") === false) {
             window.location.href = 'login.html';
        }
    }
});
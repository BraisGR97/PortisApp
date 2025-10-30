// Main.js - CORREGIDO PARA LIMPIAR localStorage Y RUTAS

document.addEventListener('DOMContentLoaded', function() {
    const repairsBtn = document.getElementById('repairsBtn');
    const recordsBtn = document.getElementById('recordsBtn');
    const logoutBtn = document.getElementById('logoutBtn'); // <--- NUEVO

    // 1. Botón 'Reparaciones' (Ruta corregida a la raíz)
    if (repairsBtn) {
        repairsBtn.addEventListener('click', function() {
            // Desde /Main/Main.js sube un nivel (..) y va al archivo en la raíz
            window.location.href = '../Repairs/Repairs.html';
        });
    }

    // 2. Botón 'Registros' (Ruta corregida a la raíz)
    if (recordsBtn) {
        recordsBtn.addEventListener('click', function() {
            // Desde /Main/Main.js sube un nivel (..) y va al archivo en la raíz
            window.location.href = '../Records/Records.html';
        });
    }
    
    // 3. Botón 'Cerrar Sesión' (¡CON CAMBIOS!)
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            
            // --- ¡MODIFICACIÓN CLAVE! ---
            // Limpiamos el username guardado al cerrar sesión.
            localStorage.removeItem('portisAppUser');
            console.log("Usuario eliminado de localStorage (Sesión cerrada).");
            // ---------------------------

            // Desde /Main/ debe subir a la raíz (..) y luego entrar en LogIn/
            window.location.href = '../LogIn/LogIn.html';
        });
    }
});
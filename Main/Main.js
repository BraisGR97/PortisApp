// Main.js - CORREGIDO PARA LIMPIAR localStorage Y RUTAS

document.addEventListener('DOMContentLoaded', function() {
    const repairsBtn = document.getElementById('repairsBtn');
    const recordsBtn = document.getElementById('recordsBtn');
    const sharedBtn = document.getElementById('sharedBtn'); // <--- NUEVA VARIABLE
    const logoutBtn = document.getElementById('logOutBtn'); // Corregido: Usar 'logOutBtn' del HTML

    // 1. Botón 'Reparaciones'
    if (repairsBtn) {
        repairsBtn.addEventListener('click', function() {
            window.location.href = '../Repairs/Repairs.html';
        });
    }

    // 2. Botón 'Registros'
    if (recordsBtn) {
        recordsBtn.addEventListener('click', function() {
            window.location.href = '../Records/Records.html';
        });
    }
    
    // 3. Botón 'Compartidos' (¡NUEVO!)
    if (sharedBtn) {
        sharedBtn.addEventListener('click', function() {
            window.location.href = '../Shared/Shared.html'; // <--- NUEVA RUTA
        });
    }
    
    // 4. Botón 'Cerrar Sesión'
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            
            // Limpiamos el username guardado al cerrar sesión.
            localStorage.removeItem('portisAppUser');
            console.log("Usuario eliminado de localStorage (Sesión cerrada).");
            
            window.location.href = '../LogIn/LogIn.html';
        });
    }
});
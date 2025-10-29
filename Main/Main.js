document.addEventListener('DOMContentLoaded', function() {
    const repairsBtn = document.getElementById('repairsBtn');
    const recordsBtn = document.getElementById('recordsBtn');
    const logoutBtn = document.getElementById('logoutBtn'); // <--- NUEVO

    // 1. Botón 'Reparaciones' (se mantiene)
    if (repairsBtn) {
        repairsBtn.addEventListener('click', function() {
            window.location.href = '../Repairs/Repairs.html';
        });
    }

    // 2. Botón 'Registros' (se mantiene)
    if (recordsBtn) {
        recordsBtn.addEventListener('click', function() {
            window.location.href = '../Records/Records.html';
        });
    }
    
    // 3. Botón 'Cerrar Sesión' (NUEVO)
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // Desde /Main/ debe subir a la raíz (..) y luego entrar en LogIn/
            window.location.href = '../LogIn/LogIn.html';
        });
    }
});
// Espera a que el documento HTML esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Obtiene el botón por su ID
    const inicioBtn = document.getElementById('inicioBtn');

    // Verifica que el botón existe antes de añadir el evento
    if (inicioBtn) {
        // Añade un 'escuchador' para el evento 'click'
        inicioBtn.addEventListener('click', function() {
            // Redirige al usuario a la página LogIn.html
            window.location.href = 'LogIn.html';
        });
    } else {
        console.error('Error: No se encontró el botón con el ID "inicioBtn".');
    }
});
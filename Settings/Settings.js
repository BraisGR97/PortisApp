// c:\Users\brais\Documents\GitHub\PortisApp\Settings\Settings.js
// Gestión del modo claro/oscuro y carga de usuario.

(() => {
    const themeBtn = document.getElementById('dark-mode-toggle'); // Corregido ID según HTML

    // 1. Cargar y mostrar usuario
    const userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (displayElement) {
        if (userDisplayName) {
            displayElement.textContent = userDisplayName;
        } else if (userId) {
            displayElement.textContent = userId.substring(0, 10) + '...';
        } else {
            displayElement.textContent = 'Invitado';
        }
    }

    // 2. Gestión del Tema (Directo a localStorage para persistencia global)
    if (themeBtn) {
        // Sincronizar estado inicial del switch
        const currentTheme = localStorage.getItem('portis-theme') || 'light';
        themeBtn.checked = currentTheme === 'dark';

        themeBtn.addEventListener('change', () => {
            const isDark = themeBtn.checked;
            const newTheme = isDark ? 'dark' : 'light';

            // Guardar en localStorage estándar (usado por Config.js)
            localStorage.setItem('portis-theme', newTheme);

            // Aplicar cambios visuales
            if (window.applyColorMode) {
                window.applyColorMode();
            } else {
                // Fallback si Config.js no está cargado
                if (isDark) document.body.classList.add('dark-mode');
                else document.body.classList.remove('dark-mode');
            }
        });
    }

    // Asegurar que el tema se aplique al cargar
    if (window.applyColorMode) window.applyColorMode();

})();
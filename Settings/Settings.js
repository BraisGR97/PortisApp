// c:\Users\brais\Documents\GitHub\PortisApp\Settings\Settings.js
// Gestión del modo claro/oscuro. Se persiste en localStorage (mock) mediante los helpers de Config.js.

(() => {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (!themeBtn) return;

    // Cargar tema guardado (mock o real)
    const savedTheme = window.getMockData('theme', null);
    if (savedTheme) {
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');
        window.applyColorMode();
    }

    themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        window.applyColorMode();
        // Guardamos la preferencia en localStorage (mock)
        window.setMockData('theme', isDark ? 'dark' : 'light');
    });
})();
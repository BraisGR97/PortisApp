// Configuración de la aplicación
window.firebaseConfig = {
    // Reemplaza con tu configuración real de Firebase
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
    measurementId: "G-HQ29Y8Z2DY"
};

// Configuración de Modos
window.IS_MOCK_MODE = true; // Cambiar a false para usar Firebase real
window.MOCK_USER_ID = "mock-admin-id";
window.MOCK_USER_DISPLAY_NAME = "Admin";

// Funciones helper para Mock Mode - LocalStorage
window.getMockData = function (key, defaultValue = []) {
    if (!window.IS_MOCK_MODE) return defaultValue;
    try {
        const data = localStorage.getItem(`portis-mock-${key}`);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Error reading mock data:', e);
        return defaultValue;
    }
};

window.setMockData = function (key, value) {
    if (!window.IS_MOCK_MODE) return;
    try {
        localStorage.setItem(`portis-mock-${key}`, JSON.stringify(value));
    } catch (e) {
        console.error('Error saving mock data:', e);
    }
};

// Función para aplicar tema GLOBALMENTE a todas las páginas
window.applyColorMode = function () {
    const savedTheme = localStorage.getItem('portis-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    let theme;

    if (savedTheme) {
        // Si hay un tema guardado, usarlo (tiene prioridad)
        theme = savedTheme;
    } else {
        // Primera vez: detectar preferencia del sistema
        theme = prefersDark ? 'dark' : 'light';
        // Guardar la preferencia del sistema como inicial
        localStorage.setItem('portis-theme', theme);
    }

    // Aplicar el tema al body
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    } else {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
    }

    console.log(`✓ Tema aplicado: ${theme.toUpperCase()} (${savedTheme ? 'guardado en localStorage' : 'detectado del sistema'})`);

    return theme;
};

// Aplicar el tema inmediatamente al cargar el script
// Esto previene el "flash" de tema incorrecto
if (document.body) {
    window.applyColorMode();
} else {
    // Si el body no está disponible aún, esperar a que lo esté
    document.addEventListener('DOMContentLoaded', function () {
        window.applyColorMode();
    });
}
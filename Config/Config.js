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

// Configuración de Cloudinary
window.cloudinaryConfig = {
    cloudName: "djezkvvlr",
    apiKey: "771821818573568",
    apiSecret: "EXtZ26lRFKMe2jMeoE6qElzu2gs",
    uploadPreset: "portis_chat" // Requiere un 'Unsigned Upload Preset' llamado 'portis_chat' en Cloudinary
};

// Configuración de Modos
window.IS_MOCK_MODE = false; // Cambiar a false para usar Firebase real
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

/**
 * Función para cambiar entre modo claro y oscuro.
 * La inicialización del tema se hace con script inline en cada HTML para evitar FOUC.
 * Esta función solo maneja el TOGGLE del tema.
 */
window.toggleColorMode = function () {
    const currentTheme = localStorage.getItem('portis-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // Guardar el nuevo tema
    localStorage.setItem('portis-theme', newTheme);

    // Aplicar las clases al documento
    if (newTheme === 'light') {
        document.documentElement.classList.add('light-mode');
        document.documentElement.classList.remove('dark-mode');
    } else {
        document.documentElement.classList.add('dark-mode');
        document.documentElement.classList.remove('light-mode');
    }

    console.log(`✓ Tema cambiado a: ${newTheme.toUpperCase()}`);

    return newTheme;
};

/**
 * Función legacy para compatibilidad con código existente.
 * Solo sincroniza las clases si es necesario, no cambia el tema.
 * @deprecated Usar toggleColorMode() para cambiar el tema
 */
window.applyColorMode = function () {
    const savedTheme = localStorage.getItem('portis-theme') || 'dark';

    // Solo sincronizar las clases si no están aplicadas correctamente
    if (savedTheme === 'light') {
        if (!document.documentElement.classList.contains('light-mode')) {
            document.documentElement.classList.add('light-mode');
            document.documentElement.classList.remove('dark-mode');
        }
    } else {
        if (!document.documentElement.classList.contains('dark-mode')) {
            document.documentElement.classList.add('dark-mode');
            document.documentElement.classList.remove('light-mode');
        }
    }

    return savedTheme;
};
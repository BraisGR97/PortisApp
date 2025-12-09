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

/**
 * Obtiene la ruta de la imagen según la empresa seleccionada.
 * Default: Otis
 */
window.getPortisImage = function () {
    const company = localStorage.getItem('portis-company') || 'otis';
    switch (company) {
        case 'enor':
            return '../assets/Enor.png';
        case 'portis':
            return '../assets/Portis.png';
        case 'otis':
        default:
            return '../assets/Otis.png';
    }
};

/**
 * Actualiza todas las imágenes de logo/perfil en la página actual
 * basándose en la configuración de la empresa.
 */
window.updateAppLogo = function () {
    const imagePath = window.getPortisImage();

    // 1. Logo principal (Login / Main)
    const appLogo = document.getElementById('app-logo');
    if (appLogo) {
        // Ajuste de ruta relativa si estamos en index.html vs subcarpetas
        // Si estamos en index (root), quitamos el "../"
        const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
        const finalPath = isRoot ? imagePath.replace('../', './') : imagePath;
        appLogo.src = finalPath;
    }

    // 2. Logo en Navbar (Main.html)
    const navbarLogo = document.querySelector('#top-navbar img');
    if (navbarLogo) navbarLogo.src = imagePath;

    // 3. Foto de perfil default (Profile.html)
    // Solo si es la imagen por defecto (nuestra logica de Profile ya maneja esto, pero esto es un refuerzo visual inmediato)
    const profilePhoto = document.getElementById('profile-photo');
    if (profilePhoto && (profilePhoto.src.includes('Portis.png') || profilePhoto.src.includes('Otis.png') || profilePhoto.src.includes('Enor.png'))) {
        profilePhoto.src = imagePath;
    }
};

// Ejecutar actualización al cargar
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.updateAppLogo === 'function') {
        window.updateAppLogo();
    }
});
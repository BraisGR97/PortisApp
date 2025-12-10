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
 * Genera un SHA-1 Hex del string dado (para firmas de Cloudinary).
 */
async function sha1Hex(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Elimina una imagen de Cloudinary usando la API y firma generada en cliente.
 * REQUISITO: API Key y Secret deben estar en cloudinaryConfig.
 */
window.deleteCloudinaryImage = async function (imageUrl) {
    if (!window.cloudinaryConfig || !imageUrl) return;

    // Extraer public_id de la URL
    // Formato habitual: .../upload/v123456789/folder/image.jpg
    // Necesitamos lo que está después de la version (v...) y sin extension
    // O simplemente el nombre de archivo sin extension si está en root.
    // Regex robusto para extraer public_id:
    const regex = /\/v\d+\/(.+)\.[a-z]{3,4}$/;
    const match = imageUrl.match(regex);
    if (!match || !match[1]) {
        console.warn("No se pudo extraer public_id de:", imageUrl);
        return;
    }
    const public_id = match[1];

    const timestamp = Math.round((new Date()).getTime() / 1000);
    const { cloudName, apiKey, apiSecret } = window.cloudinaryConfig;

    if (!apiKey || !apiSecret) {
        console.warn("Faltan credenciales Cloudinary API Key/Secret para borrar.");
        return;
    }

    // Generar firma: public_id=...&timestamp=... + api_secret
    const paramsToSign = `public_id=${public_id}&timestamp=${timestamp}`;
    const stringToSign = paramsToSign + apiSecret;
    const signature = await sha1Hex(stringToSign);

    const formData = new FormData();
    formData.append('public_id', public_id);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        console.log("Cloudinary Delete Result:", data);
        return data.result === 'ok';
    } catch (e) {
        console.error("Error deleting from Cloudinary:", e);
        return false;
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
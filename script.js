/**
 * ====================================================================
 * script.js - Lógica de Inicio (index.html)
 * Incluye inicialización y navegación. La lógica de botones está en Buttons.js.
 * ====================================================================
 */

// NOTA: Se asume que config.js ya está cargado y expone:
// - window.firebaseConfig
// - window.IS_MOCK_MODE
// - window.applyColorMode
// - window.MOCK_USER_ID

// Variables globales para Firebase
window.app = null;
window.auth = null;
window.db = null;

// Credenciales MOCK (Exponemos para Buttons.js si es necesario)
window.MOCK_CREDENTIALS = { email: 'admin@portis.com', password: '0000', displayName: 'Admin' };

// --- Funciones Helper (Expuestas globalmente) ---

window.toggleBackgroundAnimation = function (active) {
    const wrapper = document.getElementById('geometric-wrapper');
    if (wrapper) wrapper.style.opacity = active ? '1' : '0.5';
};

window.showScreen = function (screenId) {
    window.toggleBackgroundAnimation(true);

    const screens = document.querySelectorAll('.screen');
    const messageBoxes = document.querySelectorAll('.message-box');
    const cardContainers = document.querySelectorAll('.card-container');
    const currentScreen = document.querySelector('.screen[style*="display: flex;"]');
    const targetScreen = document.getElementById(screenId);

    if (!targetScreen || screenId === 'app-screen') return;

    const isSwapping = currentScreen && currentScreen.id !== screenId;

    if (isSwapping) {
        cardContainers.forEach(card => card.classList.add('is-swapping'));
    }

    const isInverted = screenId === 'register-screen';

    setTimeout(() => {
        cardContainers.forEach(card => {
            card.classList.remove('default-split', 'inverted-split');
            card.classList.add(isInverted ? 'inverted-split' : 'default-split');
        });

        messageBoxes.forEach(box => {
            box.style.display = 'none';
            box.textContent = '';
        });

        screens.forEach(screen => {
            screen.style.display = 'none';
        });
        targetScreen.style.display = 'flex';

    }, 200);

    setTimeout(() => {
        cardContainers.forEach(card => card.classList.remove('is-swapping'));
    }, 600);
};

window.showMessage = function (messageId, text, type = 'error') {
    const messageBox = document.getElementById(messageId);
    if (!messageBox) return;

    messageBox.textContent = text;
    messageBox.classList.remove('message-error', 'message-success');

    if (type === 'error') {
        messageBox.classList.add('message-error');
    } else {
        messageBox.classList.add('message-success');
    }

    messageBox.style.display = 'block';
};

window.getFirebaseErrorMessage = function (code) {
    switch (code) {
        case 'auth/email-already-in-use': return 'Este correo electrónico ya está en uso.';
        case 'auth/invalid-email': return 'El formato del correo no es válido.';
        case 'auth/weak-password': return 'La contraseña es demasiado débil (mín. 6 caracteres).';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return 'Credenciales incorrectas.';
        case 'auth/too-many-requests': return 'Demasiados intentos fallidos. Inténtalo más tarde.';
        case 'auth/network-request-failed': return 'Error de red. Asegúrate de estar conectado.';
        default: return 'Ha ocurrido un error inesperado.';
    }
};


// --- Lógica de Autenticación ---

/**
 * Intenta iniciar sesión automáticamente si hay persistencia o token (solo modo REAL).
 */
async function authUser() {
    if (window.IS_MOCK_MODE) {
        window.showScreen('home-screen');
        return;
    }

    window.auth.onAuthStateChanged((user) => {
        if (user && !user.isAnonymous && user.emailVerified) {
            console.log("Usuario autenticado y verificado. Redirigiendo a Main/Main.html.");
            const userDisplayName = user.displayName || user.email || 'Usuario';

            sessionStorage.setItem('portis-user-identifier', user.uid);
            sessionStorage.setItem('portis-user-display-name', userDisplayName);

            window.location.href = 'Main/Main.html';
        } else {
            window.showScreen('home-screen');
        }
    });

    try {
        if (!window.auth.currentUser) {
            await window.auth.signInAnonymously();
        }
    } catch (error) {
        console.error("Error durante la autenticación inicial (anon.):", error);
    }
}

// --- Lógica de Inicialización de Firebase (Solo Modo Real) ---
async function initAuthApp() {
    try {
        window.app = firebase.initializeApp(window.firebaseConfig);
        window.auth = firebase.auth();
        window.db = firebase.firestore();

        await authUser();

    } catch (e) {
        console.error("Error al inicializar Firebase. Cayendo a HOME-SCREEN:", e);
        window.showMessage('login-message', 'Error de inicialización de la app. Por favor, inténtalo más tarde.', 'error');
        window.showScreen('home-screen');
    }
}


// --- Punto de Entrada Principal (DOM Content Loaded) ---

document.addEventListener('DOMContentLoaded', () => {

    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    // Inicializar botones desde Buttons.js
    if (typeof window.initializeButtons === 'function') {
        window.initializeButtons();
    } else {
        console.error("Buttons.js no se ha cargado correctamente.");
    }

    // Inicialización de la aplicación
    if (window.IS_MOCK_MODE) {
        console.warn("Modo MOCK/DEMO activado. Saltando inicialización de Firebase.");
        window.showScreen('home-screen');
    } else {
        initAuthApp();
    }
});
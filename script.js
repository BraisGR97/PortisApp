/**
 * ====================================================================
 * script.js - Lógica de Autenticación y Navegación (index.html)
 * ====================================================================
 * Este archivo maneja toda la lógica de autenticación de Firebase,
 * navegación entre pantallas y validación de formularios.
 * ====================================================================
 */

// ================================================================
// VARIABLES GLOBALES
// ================================================================

window.app = null;
window.auth = null;
window.db = null;

// ================================================================
// FUNCIONES HELPER (Utilidades)
// ================================================================

/**
 * Cambia entre las diferentes pantallas de autenticación
 * @param {string} screenId - ID de la pantalla a mostrar
 */
window.showScreen = function (screenId) {
    const screens = document.querySelectorAll('.screen');
    const messageBoxes = document.querySelectorAll('.message-box');
    const targetScreen = document.getElementById(screenId);

    if (!targetScreen) return;

    // Limpiar mensajes
    messageBoxes.forEach(box => {
        box.style.display = 'none';
        box.textContent = '';
    });

    // Cambiar pantallas
    screens.forEach(screen => {
        screen.style.display = 'none';
    });
    targetScreen.style.display = 'flex';
};

/**
 * Muestra un mensaje de estado (error o éxito)
 * @param {string} messageId - ID del elemento de mensaje
 * @param {string} text - Texto del mensaje
 * @param {string} type - Tipo de mensaje ('error' o 'success')
 */
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

/**
 * Convierte códigos de error de Firebase en mensajes legibles
 * @param {string} code - Código de error de Firebase
 * @returns {string} Mensaje de error en español
 */
window.getFirebaseErrorMessage = function (code) {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'Este correo electrónico ya está en uso.';
        case 'auth/invalid-email':
            return 'El formato del correo no es válido.';
        case 'auth/weak-password':
            return 'La contraseña es demasiado débil (mín. 6 caracteres).';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Credenciales incorrectas.';
        case 'auth/too-many-requests':
            return 'Demasiados intentos fallidos. Inténtalo más tarde.';
        case 'auth/network-request-failed':
            return 'Error de red. Asegúrate de estar conectado.';
        default:
            return 'Ha ocurrido un error inesperado.';
    }
};

// ================================================================
// FUNCIONES DE AUTENTICACIÓN
// ================================================================

/**
 * Maneja el inicio de sesión con Firebase
 */
async function handleLogin() {
    const loginMessageId = 'login-message';
    const loginBtn = document.getElementById('login-btn');

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Entrando...';
    }

    let inputIdentifier = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    // Validación de campos
    if (!inputIdentifier || !password) {
        window.showMessage(loginMessageId, 'Por favor, introduce tu correo/usuario y contraseña.', 'error');
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Entrar';
        }
        return;
    }

    try {
        if (!window.auth) {
            throw new Error("Firebase Auth no inicializado. Intenta recargar la página.");
        }

        // Si el input no parece un correo, buscar el email por username
        if (!inputIdentifier.includes('@')) {
            if (loginBtn) loginBtn.textContent = 'Verificando usuario...';

            try {
                // Buscar por campo 'username'
                let userQuery = await window.db.collection('users').where('username', '==', inputIdentifier).limit(1).get();

                // Si no encuentra, intentar por 'displayName' (retrocompatibilidad)
                if (userQuery.empty) {
                    userQuery = await window.db.collection('users').where('displayName', '==', inputIdentifier).limit(1).get();
                }

                if (!userQuery.empty) {
                    const userData = userQuery.docs[0].data();
                    if (userData.email) {
                        inputIdentifier = userData.email; // Usar el email encontrado
                    } else {
                        throw new Error("El usuario encontrado no tiene email asociado.");
                    }
                } else {
                    // Si no encontramos usuario, dejamos que Firebase intente (probablemente fallará como email inválido)
                    // o lanzamos error directo "Usuario no encontrado"
                    throw new Error("Nombre de usuario no encontrado.");
                }
            } catch (err) {
                // Si falla la búsqueda (permisos, etc) o no encuentra usuario, mostramos error
                window.showMessage(loginMessageId, err.message === "Nombre de usuario no encontrado." ? err.message : 'Error al buscar usuario.', 'error');
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Entrar';
                }
                return;
            }
        }

        // Configurar persistencia de sesión
        await window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        // Iniciar sesión (ahora inputIdentifier es siempre un email)
        const userCredential = await window.auth.signInWithEmailAndPassword(inputIdentifier, password);
        const user = userCredential.user;

        // Verificar que el correo esté verificado
        if (!user.emailVerified) {
            await window.auth.signOut();
            window.showMessage(loginMessageId, '¡Acceso denegado! Por favor, verifica tu correo electrónico para iniciar sesión.', 'error');
        } else {
            // Guardar información del usuario en sessionStorage
            const userDisplayName = user.displayName || user.email.split('@')[0] || 'Usuario';
            sessionStorage.setItem('portis-user-identifier', user.uid);
            sessionStorage.setItem('portis-user-display-name', userDisplayName);
            sessionStorage.setItem('portis-show-welcome', 'true');

            // 🔑 CLAVE: Cargar configuración del usuario desde Firestore
            try {
                const settingsDoc = await window.db.collection('users').doc(user.uid).collection('settings').doc('preferences').get();

                if (settingsDoc.exists) {
                    const data = settingsDoc.data();

                    // Actualizar localStorage con la configuración del usuario
                    if (data.theme) localStorage.setItem('portis-theme', data.theme);
                    if (data.language) localStorage.setItem('portis-language', data.language);
                    if (data.location) localStorage.setItem('portis-location', data.location);
                    if (data.company) localStorage.setItem('portis-company', data.company);

                    console.log('✅ User settings loaded on login:', data);
                }
            } catch (error) {
                console.error('❌ Error loading user settings on login:', error);
            }

            window.showMessage(loginMessageId, 'Inicio de sesión exitoso. Redirigiendo...', 'success');
            setTimeout(() => {
                window.location.href = 'Main/Main.html';
            }, 800);
        }
    } catch (error) {
        window.showMessage(loginMessageId, window.getFirebaseErrorMessage(error.code), 'error');
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Entrar';
        }
    }
}

/**
 * Maneja el registro de nuevos usuarios
 */
async function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const passwordConfirm = document.getElementById('register-password-confirm').value.trim();

    // Validación de contraseñas
    if (password !== passwordConfirm) {
        window.showMessage('register-message', 'Las contraseñas no coinciden.', 'error');
        return;
    }

    // Validación de campos
    if (!username || !email || !password) {
        window.showMessage('register-message', 'Por favor, rellena todos los campos.', 'error');
        return;
    }

    const registerBtn = document.getElementById('register-btn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Creando...';

    try {
        if (!window.auth || !window.db) {
            throw new Error("Firebase no inicializado para registro.");
        }

        // Crear usuario en Firebase Auth
        const userCredential = await window.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Actualizar perfil con nombre de usuario
        await user.updateProfile({ displayName: username });

        // Enviar correo de verificación
        await user.sendEmailVerification();

        // Crear documento de usuario en Firestore
        await window.db.collection('users').doc(user.uid).set({
            username: username,
            email: email,
            registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
            totalRepairs: 0,
            totalBills: 0,
            company: 'otis' // 🔑 CLAVE: Empresa por defecto para nuevos usuarios
        });

        window.showMessage('register-message', '¡Cuenta creada! Se ha enviado un correo de verificación. Por favor, revísalo para iniciar sesión.', 'success');

        // Cerrar sesión y redirigir al login
        await window.auth.signOut();

        setTimeout(() => {
            window.showScreen('login-screen');
        }, 3000);

    } catch (error) {
        window.showMessage('register-message', window.getFirebaseErrorMessage(error.code), 'error');
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Crear Cuenta';
    }
}

/**
 * Maneja la recuperación de contraseña
 */
async function handlePasswordReset() {
    const email = document.getElementById('forgot-email').value.trim();

    if (!email) {
        window.showMessage('forgot-message', 'Por favor, introduce tu correo.', 'error');
        return;
    }

    const resetPasswordBtn = document.getElementById('reset-password-btn');
    resetPasswordBtn.disabled = true;
    resetPasswordBtn.textContent = 'Enviando...';

    try {
        if (!window.auth) {
            throw new Error("Firebase Auth no inicializado.");
        }

        await window.auth.sendPasswordResetEmail(email);
        window.showMessage('forgot-message', '¡Enlace enviado! Revisa tu correo.', 'success');
    } catch (error) {
        window.showMessage('forgot-message', window.getFirebaseErrorMessage(error.code), 'error');
    } finally {
        resetPasswordBtn.disabled = false;
        resetPasswordBtn.textContent = 'Enviar Enlace';
    }
}

// ================================================================
// INICIALIZACIÓN DE BOTONES
// ================================================================

/**
 * Inicializa todos los event listeners de los botones
 */
function initializeButtons() {
    // Botones de navegación
    const startBtn = document.getElementById('start-btn');
    const goToRegisterBtn = document.getElementById('go-to-register-btn');
    const goToForgotBtn = document.getElementById('go-to-forgot-btn');
    const goToLoginFromRegisterBtn = document.getElementById('go-to-login-from-register-btn');
    const goToLoginFromForgotBtn = document.getElementById('go-to-login-from-forgot-btn');

    // Botones de acción
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const resetPasswordBtn = document.getElementById('reset-password-btn');

    // Event listeners de navegación
    if (startBtn) startBtn.addEventListener('click', () => window.showScreen('login-screen'));
    if (goToRegisterBtn) goToRegisterBtn.addEventListener('click', () => window.showScreen('register-screen'));
    if (goToForgotBtn) goToForgotBtn.addEventListener('click', () => window.showScreen('forgot-password-screen'));
    if (goToLoginFromRegisterBtn) goToLoginFromRegisterBtn.addEventListener('click', () => window.showScreen('login-screen'));
    if (goToLoginFromForgotBtn) goToLoginFromForgotBtn.addEventListener('click', () => window.showScreen('login-screen'));

    // Event listeners de acción
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);
    if (resetPasswordBtn) resetPasswordBtn.addEventListener('click', handlePasswordReset);

    // Permitir Enter en los inputs
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    if (loginEmail) loginEmail.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    if (loginPassword) loginPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
}

// ================================================================
// AUTENTICACIÓN AUTOMÁTICA
// ================================================================

/**
 * Intenta iniciar sesión automáticamente si hay persistencia
 */
async function authUser() {
    window.auth.onAuthStateChanged(async (user) => {
        if (user && !user.isAnonymous && user.emailVerified) {
            console.log("Usuario autenticado y verificado. Redirigiendo a Main/Main.html.");
            const userDisplayName = user.displayName || user.email || 'Usuario';

            sessionStorage.setItem('portis-user-identifier', user.uid);
            sessionStorage.setItem('portis-user-display-name', userDisplayName);

            // 🔑 CLAVE: Cargar configuración del usuario desde Firestore
            try {
                const settingsDoc = await window.db.collection('users').doc(user.uid).collection('settings').doc('preferences').get();

                if (settingsDoc.exists) {
                    const data = settingsDoc.data();

                    // Actualizar localStorage con la configuración del usuario
                    if (data.theme) localStorage.setItem('portis-theme', data.theme);
                    if (data.language) localStorage.setItem('portis-language', data.language);
                    if (data.location) localStorage.setItem('portis-location', data.location);
                    if (data.company) localStorage.setItem('portis-company', data.company);

                    console.log('✅ User settings loaded on auto-login:', data);
                }
            } catch (error) {
                console.error('❌ Error loading user settings on auto-login:', error);
            }

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

// ================================================================
// INICIALIZACIÓN DE FIREBASE
// ================================================================

/**
 * Inicializa Firebase y la autenticación
 */
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

// ================================================================
// PUNTO DE ENTRADA PRINCIPAL
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar botones
    initializeButtons();

    // Inicializar Firebase
    initAuthApp();
});
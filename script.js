// --- IMPORTACIONES ELIMINADAS TEMPORALMENTE ---
// Ya no necesitamos 'import {...} from "..."'.
// Las funciones de Firebase ahora se acceden a través del objeto global 'firebase'.

// --- Configuración de Firebase INYECTADA DIRECTAMENTE ---
// Esta configuración será usada por 'firebase.initializeApp()'.
const firebaseConfig = {
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
    measurementId: "G-HQ29Y8Z2DY"
};
const initialAuthToken = null; 

// Credenciales MOCK para modo de demostración
const MOCK_CREDENTIALS = { email: 'admin@portis.com', password: '0000', displayName: 'Admin' };

// --- CAMBIO CLAVE AQUÍ ---
// La lógica para determinar el modo mock permanece igual
const IS_MOCK_MODE = !firebaseConfig.apiKey; 

let app, auth, db, userId;

// --- Funciones Helper ---

function toggleBackgroundAnimation(active) {
    const wrapper = document.getElementById('geometric-wrapper');
    if (wrapper) wrapper.style.opacity = active ? '1' : '0.5';
}

function showScreen(screenId) {
    toggleBackgroundAnimation(true);
            
    // Obtener elementos dentro de la función para mayor robustez
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
}

function showMessage(messageId, text, type = 'error') {
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
}

function getFirebaseErrorMessage(code) {
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
}


// --- Manejadores de Eventos (Adaptados a la versión COMPAT) ---

async function authUser() {
    // onAuthStateChanged ahora es llamado en 'firebase.auth()'
    auth.onAuthStateChanged((user) => {
        // CAMBIO CLAVE 1: Comprobamos si el usuario está verificado antes de redirigir
        if (user && !user.isAnonymous && user.emailVerified) {
            console.log("Usuario autenticado y verificado. Redirigiendo a Main/Main.html.");
            const userDisplayName = user.displayName || user.email || 'Usuario';
            sessionStorage.setItem('portis-user-display-name', userDisplayName);
            window.location.href = 'Main/Main.html'; 
        } else {
            // Si el usuario existe pero no está verificado, Firebase Auth lo mantiene logueado
            // hasta que intentemos el login (handleLogin) o cerremos sesión.
            // Aquí solo mostramos la pantalla de inicio.
            showScreen('home-screen');
        }
    });

    try {
        if (initialAuthToken) {
            // signInWithCustomToken ahora es llamado en 'auth'
            await auth.signInWithCustomToken(initialAuthToken);
        } else if (!auth.currentUser) {
            // signInAnonymously ahora es llamado en 'auth'
            await auth.signInAnonymously();
        }
    } catch (error) {
        console.error("Error durante la autenticación inicial:", error);
    }
}

async function handleLogin() {
    toggleBackgroundAnimation(true); 
    const inputIdentifier = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const loginMessageId = 'login-message';

    if (!inputIdentifier || !password) {
        showMessage(loginMessageId, 'Por favor, rellena todos los campos.', 'error');
        toggleBackgroundAnimation(false); 
        return;
    }

    const loginBtn = document.getElementById('login-btn');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando...';
            
    if (IS_MOCK_MODE) {
        // Lógica de MOCK fallback
        const isUsernameMatch = inputIdentifier === MOCK_CREDENTIALS.displayName;
        const isEmailMatch = inputIdentifier === MOCK_CREDENTIALS.email;

        if ((isUsernameMatch || isEmailMatch) && password === MOCK_CREDENTIALS.password) {
            showMessage(loginMessageId, `Inicio de sesión (DEMO) exitoso. Redirigiendo...`, 'success');
            sessionStorage.setItem('portis-user-display-name', MOCK_CREDENTIALS.displayName);
            setTimeout(() => {
                window.location.href = 'Main/Main.html'; 
            }, 800);
        } else {
            showMessage(loginMessageId, `Credenciales de demostración incorrectas. Usa "${MOCK_CREDENTIALS.displayName}" o "${MOCK_CREDENTIALS.email}" / "${MOCK_CREDENTIALS.password}".`, 'error');
            toggleBackgroundAnimation(false);
        }
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
        return;
    }

    // FIREBASE LOGIN
    try {
        let targetEmail = inputIdentifier;
        if (inputIdentifier === 'Admin') targetEmail = 'admin@portis.com'; 
        
        // 1. Intentar iniciar sesión
        const userCredential = await auth.signInWithEmailAndPassword(targetEmail, password);
        const user = userCredential.user;
        
        // 2. CAMBIO CLAVE 2: Comprobar si el correo está verificado
        if (!user.emailVerified) {
            
            // Si no está verificado, forzamos el cierre de sesión y mostramos un error
            await auth.signOut(); 
            showMessage(loginMessageId, '¡Acceso denegado! Por favor, verifica tu correo electrónico para iniciar sesión.', 'error');
            
        } else {
            // Si está verificado, procedemos
            const userDisplayName = user.displayName || user.email || 'Usuario';
            sessionStorage.setItem('portis-user-display-name', userDisplayName);
            
            showMessage(loginMessageId, 'Inicio de sesión exitoso. Redirigiendo...', 'success');
            setTimeout(() => {
                window.location.href = 'Main/Main.html';
            }, 800);
        }
        
    } catch (error) {
        console.error("Error en login:", error.code);
        showMessage(loginMessageId, getFirebaseErrorMessage(error.code), 'error');
        toggleBackgroundAnimation(false);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
}

async function handleRegister() {
    toggleBackgroundAnimation(true); 
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (password !== passwordConfirm) {
        showMessage('register-message', 'Las contraseñas no coinciden.', 'error');
        toggleBackgroundAnimation(false); return;
    }

    const registerBtn = document.getElementById('register-btn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Creando...';

    try {
        // 1. Crear el usuario en Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // 2. Actualizar el perfil con el nombre de usuario
        await user.updateProfile({ displayName: username });
        
        // 3. CAMBIO CLAVE 3: MANDAR CORREO DE VERIFICACIÓN
        await user.sendEmailVerification(); 
        
        // 4. CAMBIO CLAVE 4: Crear el Documento Inicial del Usuario en Firestore
        // Usamos el UID de Auth como ID del documento en la colección 'users'
        await db.collection('users').doc(user.uid).set({
            username: username,
            email: email,
            registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
            totalRepairs: 0,
            totalBills: 0
        });

        showMessage('register-message', '¡Cuenta creada! Se ha enviado un correo de verificación. Por favor, revísalo para continuar.', 'success');
        
        // Opcional: Cerrar la sesión para forzar el login después de la verificación
        await auth.signOut();
        
        // Redirigir al login para que el usuario verifique el email
        setTimeout(() => {
            showScreen('login-screen');
        }, 3000);

    } catch (error) {
        console.error("Error en registro:", error.code);
        showMessage('register-message', getFirebaseErrorMessage(error.code), 'error');
        toggleBackgroundAnimation(false);
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Crear Cuenta';
    }
}

async function handleForgotPassword() {
    toggleBackgroundAnimation(true); 
    const email = document.getElementById('forgot-email').value;
    if (!email) {
        showMessage('forgot-message', 'Por favor, introduce tu correo.', 'error');
        toggleBackgroundAnimation(false); return;
    }

    const resetPasswordBtn = document.getElementById('reset-password-btn');
    resetPasswordBtn.disabled = true;
    resetPasswordBtn.textContent = 'Enviando...';

    try {
        // sendPasswordResetEmail ahora es llamado en 'auth'
        await auth.sendPasswordResetEmail(email);
        showMessage('forgot-message', '¡Enlace enviado! Revisa tu correo.', 'success');
    } catch (error) {
        console.error("Error en reseteo:", error.code);
        showMessage('forgot-message', getFirebaseErrorMessage(error.code), 'error');
    } finally {
        resetPasswordBtn.disabled = false;
        resetPasswordBtn.textContent = 'Enviar Enlace';
        toggleBackgroundAnimation(false);
    }
}


// --- Lógica de Inicialización de Firebase (Se ejecuta en DOMContentLoaded) ---
async function initAuthApp() {
    try {
        // Inicialización de la app
        app = firebase.initializeApp(firebaseConfig);
        
        // Obtención de servicios
        auth = firebase.auth();
        db = firebase.firestore();

        // Asignar listeners de Registro y Olvido que SÍ dependen de 'auth'
        document.getElementById('register-btn').addEventListener('click', handleRegister);
        document.getElementById('reset-password-btn').addEventListener('click', handleForgotPassword);

        // Iniciar la sesión de Firebase (anónima o con token)
        await authUser();
        
    } catch (e) {
        console.error("Error al inicializar Firebase. Cayendo a HOME-SCREEN:", e);
        showScreen('home-screen'); 
    }
}


// --- Punto de Entrada Principal (DOM Content Loaded) ---

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Asignar todos los listeners de navegación (prioridad)
    const startBtn = document.getElementById('start-btn');
    const loginBtn = document.getElementById('login-btn');
    const goToRegisterBtn = document.getElementById('go-to-register-btn');
    const goToForgotBtn = document.getElementById('go-to-forgot-btn');
    const goToLoginFromRegisterBtn = document.getElementById('go-to-login-from-register-btn');
    const goToLoginFromForgotBtn = document.getElementById('go-to-login-from-forgot-btn');

    if (startBtn) startBtn.addEventListener('click', () => showScreen('login-screen'));
    if (goToRegisterBtn) goToRegisterBtn.addEventListener('click', () => showScreen('register-screen'));
    if (goToForgotBtn) goToForgotBtn.addEventListener('click', () => showScreen('forgot-password-screen'));
    if (goToLoginFromRegisterBtn) goToLoginFromRegisterBtn.addEventListener('click', () => showScreen('login-screen'));
    if (goToLoginFromForgotBtn) goToLoginFromForgotBtn.addEventListener('click', () => showScreen('login-screen'));

    // 2. Asignar listener de LOGIN 
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);

    // 3. Inicialización de la aplicación (solo si tenemos configuración)
    if (IS_MOCK_MODE) {
        // Este caso solo ocurriría si la API key estuviera vacía.
        console.warn("Configuración de Firebase no válida. Usando modo MOCK/DEMO.");
        showScreen('home-screen');
    } else {
        // Modo Firebase: Inicializar.
        initAuthApp();
    }
});
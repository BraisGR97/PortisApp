// app.js

// 1. CONFIGURACIÓN DE FIREBASE (¡REEMPLAZA CON TUS PROPIOS VALORES!)
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
    measurementId: "G-HQ29Y8Z2DY"
    // Agrega el resto de tu configuración si Firebase te la proporcionó
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Inicializa los servicios que vamos a usar
const auth = firebase.auth();
const db = firebase.firestore(); 

// 2. ELEMENTOS DEL DOM Y LÓGICA DEL MODAL
// =======================================
const modal = document.getElementById('register-modal');
const registerPromptBtn = document.getElementById('register-prompt-btn');
const backBtn = document.getElementById('back-btn');
const registerSubmitBtn = document.getElementById('register-submit-btn');

const regEmailInput = document.getElementById('reg-email');
const regPasswordInput = document.getElementById('reg-password');
const regConfirmPasswordInput = document.getElementById('reg-confirm-password');
const messageDisplay = document.getElementById('reg-message');


// Abrir el modal
registerPromptBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    messageDisplay.textContent = '';
    // Limpiar campos al abrir
    regEmailInput.value = '';
    regPasswordInput.value = '';
    regConfirmPasswordInput.value = '';
    regConfirmPasswordInput.classList.remove('password-match', 'password-mismatch');
});

// Cerrar el modal (botón "Volver")
backBtn.addEventListener('click', () => {
    modal.style.display = 'none'; 
});


// 3. VALIDACIÓN VISUAL DE CONTRASEÑAS
// =======================================
regConfirmPasswordInput.addEventListener('input', () => {
    const password = regPasswordInput.value;
    const confirmPassword = regConfirmPasswordInput.value;
    
    // Si la casilla de confirmación está vacía, no mostrar nada
    if (confirmPassword.length === 0) {
        regConfirmPasswordInput.classList.remove('password-match', 'password-mismatch');
        return;
    }
    
    if (password === confirmPassword && password.length >= 6) {
        // Coinciden y cumplen la longitud mínima (verde)
        regConfirmPasswordInput.classList.add('password-match');
        regConfirmPasswordInput.classList.remove('password-mismatch');
    } else {
        // No coinciden o son muy cortas (rojo)
        regConfirmPasswordInput.classList.add('password-mismatch');
        regConfirmPasswordInput.classList.remove('password-match');
    }
});

// 4. LÓGICA DE REGISTRO (CREAR USUARIO EN AUTH Y DOC EN FIRESTORE)
// =======================================
registerSubmitBtn.addEventListener('click', async () => {
    const email = regEmailInput.value;
    const password = regPasswordInput.value;
    const confirmPassword = regConfirmPasswordInput.value;

    messageDisplay.textContent = ''; 

    if (password !== confirmPassword) {
        messageDisplay.textContent = 'Las contraseñas no coinciden.';
        return;
    }
    
    if (password.length < 6) {
        messageDisplay.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        return;
    }

    try {
        // 1. CREAR USUARIO EN FIREBASE AUTHENTICATION
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 2. GUARDAR DATOS EN FIRESTORE (Usando el UID como ID del documento)
        await db.collection("users").doc(user.uid).set({
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), 
        });
        
        // Registro exitoso
        messageDisplay.style.color = '#28a745';
        messageDisplay.textContent = '¡Registro exitoso! Ya puedes iniciar sesión.';
        
        setTimeout(() => {
            modal.style.display = 'none';
        }, 2000);

    } catch (error) {
        // Manejo de errores de Firebase
        let errorMessage = 'Error: ';
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'El email ya está registrado.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'El formato del email es inválido.';
                break;
            case 'auth/weak-password':
                errorMessage = 'La contraseña es demasiado débil.';
                break;
            default:
                errorMessage = error.message;
        }
        messageDisplay.style.color = '#dc3545';
        messageDisplay.textContent = errorMessage;
    }
});


// 5. LÓGICA DE INICIO DE SESIÓN (LOGIN)
// =======================================
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    // ⚠️ NOTA DE SEGURIDAD:
    // La verificación de usuario y contraseña se realiza de forma segura
    // con Firebase Authentication (Auth), no directamente contra Firestore.
    // Esto es el estándar de seguridad para cualquier aplicación.

    try {
        // Usa Firebase Authentication para verificar las credenciales
        await auth.signInWithEmailAndPassword(email, password);
        
        // Si tiene éxito, redirige a la página principal
        alert('¡Inicio de sesión exitoso!');
        window.location.href = 'menu-principal.html'; 

    } catch (error) {
        // Manejo de errores de login
        let errorMessage = 'Error al iniciar sesión: ';
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage = 'Usuario o contraseña incorrectos.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'El formato del email es inválido.';
                break;
            default:
                errorMessage = error.message;
        }
        alert(errorMessage);
        console.error("Error de Login:", error);
    }
});
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
const db = firebase.firestore(); // 👈 Inicialización de Firestore

// 2. LÓGICA DEL MODAL (VENTANA EMERGENTE)
// =======================================
const modal = document.getElementById('register-modal');
const registerPromptBtn = document.getElementById('register-prompt-btn');
const backBtn = document.getElementById('back-btn');
const registerSubmitBtn = document.getElementById('register-submit-btn');

// Abrir el modal
registerPromptBtn.addEventListener('click', () => {
    modal.style.display = 'flex'; // Muestra el modal
    document.getElementById('reg-message').textContent = ''; // Limpia mensajes
});

// Cerrar el modal (botón "Volver")
backBtn.addEventListener('click', () => {
    modal.style.display = 'none'; // Oculta el modal
});


// 3. LÓGICA DE REGISTRO CON AUTHENTICATION Y FIRESTORE
// =======================================
registerSubmitBtn.addEventListener('click', async () => {
    const email = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const messageDisplay = document.getElementById('reg-message');

    messageDisplay.textContent = ''; // Limpia mensajes

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

        // 2. GUARDAR DATOS ADICIONALES EN FIRESTORE
        // Usamos el UID de Authentication como ID del documento en la colección "users"
        await db.collection("users").doc(user.uid).set({
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Marca de tiempo
            // Puedes añadir más campos iniciales aquí
        });
        
        // Registro exitoso
        messageDisplay.style.color = 'green';
        messageDisplay.textContent = '¡Registro exitoso! Ya puedes iniciar sesión.';
        
        console.log('Usuario registrado y datos guardados en Firestore con UID:', user.uid);
        
        // Cierra el modal después de 2 segundos
        setTimeout(() => {
            modal.style.display = 'none';
        }, 2000);

    } catch (error) {
        // Manejo de errores de Firebase
        let errorMessage = 'Error al registrar: ';
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
        messageDisplay.style.color = 'red';
        messageDisplay.textContent = errorMessage;
    }
});


// 4. LÓGICA DE INICIO DE SESIÓN (LOGIN)
// =======================================
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        // Usa Firebase Authentication para iniciar sesión
        await auth.signInWithEmailAndPassword(email, password);
        
        // Notificación de éxito
        alert('¡Inicio de sesión exitoso! Bienvenido.');
        
        // Opcional: Redirigir o actualizar la UI después del login
        // window.location.href = 'pagina_principal.html'; 

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
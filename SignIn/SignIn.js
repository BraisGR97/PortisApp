// SignIn.js

// --- Funciones de Utilidad (Actualizadas) ---

// Función para mostrar mensajes de estado
function showMessage(message, isError = true) {
    const msgBox = document.getElementById('messageBox');
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (message !== "Comprobando...") {
        setTimeout(() => {
            msgBox.classList.add('hidden');
        }, 5000);
    }

    if (isError) {
        msgBox.classList.add('error');
    } else {
        msgBox.classList.add('success');
    }
}

// Función para validar las contraseñas en tiempo real y cambiar el borde
function validatePasswords() {
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Quitar clases por defecto
    passwordInput.classList.remove('input-match', 'input-mismatch');
    confirmPasswordInput.classList.remove('input-match', 'input-mismatch');

    // Aplicar estilos solo si hay texto en ambos
    if (password.length > 0 && confirmPassword.length > 0) {
        if (password === confirmPassword) {
            passwordInput.classList.add('input-match');
            confirmPasswordInput.classList.add('input-match');
        } else {
            passwordInput.classList.add('input-mismatch');
            confirmPasswordInput.classList.add('input-mismatch');
        }
    }
}

// --- Lógica de Registro (sin cambios, solo la ruta de redirección) ---

async function handleSignIn() {
    // ... (resto de la obtención de inputs y validaciones de JS) ...
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const signInBtn = document.getElementById('signInBtn');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    // 1. Validaciones básicas
    if (username === "" || password === "" || confirmPassword === "") {
        showMessage("Todos los campos son obligatorios.", true);
        return;
    }
    if (password !== confirmPassword) {
        showMessage("Las contraseñas no coinciden.", true);
        return;
    }
    if (password.length < 6) {
        showMessage("La contraseña debe tener al menos 6 caracteres.", true);
        return;
    }

    showMessage("Comprobando disponibilidad...", false);
    signInBtn.disabled = true;

    if (!window.db) {
        showMessage("Esperando conexión con Firebase...", true);
        signInBtn.disabled = false;
        return;
    }

    const db = window.db;
    const usersCollectionRef = window.collection(db, 'users');

    try {
        // 2. Comprobar si el usuario ya existe
        const q = window.query(usersCollectionRef, window.where('username', '==', username));
        const querySnapshot = await window.getDocs(q);

        if (!querySnapshot.empty) {
            showMessage("El nombre de usuario ya está en uso.", true);
            signInBtn.disabled = false;
            return;
        }

        // 3. Registrar al nuevo usuario
        showMessage("Registrando usuario...", false);
        await window.addDoc(usersCollectionRef, {
            username: username,
            password: password, 
            createdAt: new Date().toISOString()
        });

        // 4. Éxito y redirección
        showMessage("¡Registro exitoso! Redirigiendo a Login...", false);
        
        setTimeout(() => {
            // RUTA CORREGIDA: Apunta a la carpeta LogIn/ desde la raíz
            window.location.href = '../LogIn/LogIn.html';
        }, 1500); 

    } catch (error) {
        console.error("Error al registrar en Firestore:", error);
        showMessage(`Error al registrar: ${error.message}`, true);
    } finally {
        if (!document.querySelector('.message-box.success')) {
            signInBtn.disabled = false;
        }
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', function() {
    const signInBtn = document.getElementById('signInBtn');
    const loginLink = document.getElementById('loginLink');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    // Inicializar el usuario de prueba
    if (window.setupTestUser) window.setupTestUser(); 

    // 1. Botón 'Registrarse'
    if (signInBtn) {
        signInBtn.addEventListener('click', handleSignIn);
    }

    // 2. Enlace 'Iniciar Sesión'
    if (loginLink) {
        loginLink.addEventListener('click', function(event) {
            event.preventDefault(); 
            // RUTA CORREGIDA: Apunta a la carpeta LogIn/ desde la raíz
            window.location.href = '../LogIn/LogIn.html'; 
        });
    }

    // 3. Validación en tiempo real (al escribir en las contraseñas)
    if (passwordInput && confirmPasswordInput) {
        passwordInput.addEventListener('input', validatePasswords);
        confirmPasswordInput.addEventListener('input', validatePasswords);
    }
});
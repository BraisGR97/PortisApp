// Referencias del DOM para login.html
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// NUEVAS Referencias del DOM para Registro
const registerOpenBtn = document.getElementById('register-open-btn');
const registerModal = document.getElementById('modal-registro');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const registerConfirmPassword = document.getElementById('register-confirm-password');
const registerConfirmBtn = document.getElementById('register-confirm-btn');
const registerBackBtn = document.getElementById('register-back-btn');
const registerError = document.getElementById('register-error');

// Guardián inverso: Si el usuario YA está logueado, lo mandamos al menú
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("Usuario ya logueado. Redirigiendo a menu.html");
        window.location.href = 'menu.html';
    }
});

// =======================
// LÓGICA DE LOGIN 
// =======================

loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            loginError.textContent = '';
        })
        .catch((error) => {
            console.error("Error de login:", error.message);
            loginError.textContent = 'Error: Usuario o contraseña incorrectos.';
        });
});


// =======================
// LÓGICA DE REGISTRO
// =======================

// Abrir Modal
registerOpenBtn.addEventListener('click', () => {
    registerModal.classList.add('active');
    registerError.textContent = ''; // Limpiar errores
    // Limpiar campos
    registerEmail.value = '';
    registerPassword.value = '';
    registerConfirmPassword.value = '';
});

// Cerrar Modal (Botón Volver)
registerBackBtn.addEventListener('click', () => {
    registerModal.classList.remove('active');
});

// Confirmar Registro
registerConfirmBtn.addEventListener('click', () => {
    const email = registerEmail.value;
    const password = registerPassword.value;
    const confirmPassword = registerConfirmPassword.value;

    registerError.textContent = ''; // Limpiar errores

    if (password.length < 6) {
        registerError.textContent = 'La contraseña debe tener al menos 6 caracteres (mínimo de Firebase).';
        return;
    }
    if (password !== confirmPassword) {
        registerError.textContent = 'Las contraseñas no coinciden.';
        return;
    }

    // Crear usuario en Firebase Authentication
    auth.createUserWithEmailAndPassword(email, password)
        .then(() => {
            alert('¡Registro exitoso! Puedes iniciar sesión ahora.');
            registerModal.classList.remove('active');
        })
        .catch((error) => {
            console.error("Error de registro:", error.message);
            // Mostrar error específico de Firebase
            if (error.code === 'auth/email-already-in-use') {
                registerError.textContent = 'El usuario (email) ya está registrado.';
            } else if (error.code === 'auth/invalid-email') {
                registerError.textContent = 'El formato del email es inválido.';
            } else {
                registerError.textContent = 'Error al registrar: ' + error.message;
            }
        });
});
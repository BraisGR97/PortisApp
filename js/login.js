// Referencias del DOM para login.html
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// (Opcional) Guardián inverso: Si el usuario YA está logueado, lo mandamos al menú
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("Usuario ya logueado. Redirigiendo a menu.html");
        window.location.href = 'menu.html';
    }
});

// Botón de Login
loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Éxito. La redirección la maneja el listener onAuthStateChanged de arriba
            loginError.textContent = '';
        })
        .catch((error) => {
            console.error("Error de login:", error.message);
            loginError.textContent = 'Error: Usuario o contraseña incorrectos.';
        });
});
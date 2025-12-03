/**
 * Buttons.js - Centraliza la lógica de los botones
 */

window.AppButtons = {
    'start-btn': () => window.showScreen('login-screen'),

    'login-btn': async () => {
        window.toggleBackgroundAnimation(true);
        const loginMessageId = 'login-message';
        const loginBtn = document.getElementById('login-btn');

        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Entrando...';
        }

        const inputIdentifier = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const rememberMeCheckbox = document.getElementById('login-remember-me');
        const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

        if (!inputIdentifier || !password) {
            window.showMessage(loginMessageId, 'Por favor, introduce tu correo/usuario y contraseña.', 'error');
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Entrar';
            }
            window.toggleBackgroundAnimation(false);
            return;
        }

        try {
            if (!window.auth) throw new Error("Firebase Auth no inicializado. Intenta recargar la página.");

            const persistenceType = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
            await window.auth.setPersistence(persistenceType);

            const userCredential = await window.auth.signInWithEmailAndPassword(inputIdentifier, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                await window.auth.signOut();
                window.showMessage(loginMessageId, '¡Acceso denegado! Por favor, verifica tu correo electrónico para iniciar sesión.', 'error');
            } else {
                const userDisplayName = user.displayName || user.email.split('@')[0] || 'Usuario';
                sessionStorage.setItem('portis-user-identifier', user.uid);
                sessionStorage.setItem('portis-user-display-name', userDisplayName);
                sessionStorage.setItem('portis-show-welcome', 'true');

                window.showMessage(loginMessageId, 'Inicio de sesión exitoso. Redirigiendo...', 'success');
                setTimeout(() => {
                    window.location.href = 'Main/Main.html';
                }, 800);
            }
        } catch (error) {
            window.showMessage(loginMessageId, window.getFirebaseErrorMessage(error.code), 'error');
            window.toggleBackgroundAnimation(false);
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Entrar';
            }
        }
    },

    'register-btn': async () => {
        window.toggleBackgroundAnimation(true);
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value.trim();
        const passwordConfirm = document.getElementById('register-password-confirm').value.trim();

        if (password !== passwordConfirm) {
            window.showMessage('register-message', 'Las contraseñas no coinciden.', 'error');
            window.toggleBackgroundAnimation(false); return;
        }

        if (!username || !email || !password) {
            window.showMessage('register-message', 'Por favor, rellena todos los campos.', 'error');
            window.toggleBackgroundAnimation(false); return;
        }

        const registerBtn = document.getElementById('register-btn');
        registerBtn.disabled = true;
        registerBtn.textContent = 'Creando...';

        try {
            if (!window.auth || !window.db) throw new Error("Firebase no inicializado para registro.");

            const userCredential = await window.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            await user.updateProfile({ displayName: username });
            await user.sendEmailVerification();

            await window.db.collection('users').doc(user.uid).set({
                username: username,
                email: email,
                registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
                totalRepairs: 0,
                totalBills: 0
            });

            window.showMessage('register-message', '¡Cuenta creada! Se ha enviado un correo de verificación. Por favor, revísalo para iniciar sesión.', 'success');
            await window.auth.signOut();

            setTimeout(() => {
                window.showScreen('login-screen');
            }, 3000);

        } catch (error) {
            window.showMessage('register-message', window.getFirebaseErrorMessage(error.code), 'error');
            window.toggleBackgroundAnimation(false);
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = 'Crear Cuenta';
        }
    },

    'reset-password-btn': async () => {
        window.toggleBackgroundAnimation(true);
        const email = document.getElementById('forgot-email').value.trim();

        if (!email) {
            window.showMessage('forgot-message', 'Por favor, introduce tu correo.', 'error');
            window.toggleBackgroundAnimation(false); return;
        }

        const resetPasswordBtn = document.getElementById('reset-password-btn');
        resetPasswordBtn.disabled = true;
        resetPasswordBtn.textContent = 'Enviando...';

        try {
            if (!window.auth) throw new Error("Firebase Auth no inicializado.");

            await window.auth.sendPasswordResetEmail(email);
            window.showMessage('forgot-message', '¡Enlace enviado! Revisa tu correo.', 'success');
        } catch (error) {
            window.showMessage('forgot-message', window.getFirebaseErrorMessage(error.code), 'error');
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.textContent = 'Enviar Enlace';
            window.toggleBackgroundAnimation(false);
        }
    },

    'go-to-register-btn': () => window.showScreen('register-screen'),
    'go-to-forgot-btn': () => window.showScreen('forgot-password-screen'),
    'go-to-login-from-register-btn': () => window.showScreen('login-screen'),
    'go-to-login-from-forgot-btn': () => window.showScreen('login-screen'),

    // --- BOTONES DE MAIN.HTML ---

    // Navegación
    'nav-home-btn': () => window.switchView('dashboard-view'),
    'nav-maintenance-btn': () => window.switchView('maintenance-view'),
    'nav-messages-btn': () => window.switchView('chat-view'),
    'nav-calendar-btn': () => window.switchView('calendar-view'),

    // Logout
    'logout-btn': () => window.showModal('logout-confirmation-modal'),
    'cancel-logout-btn': () => window.closeModal('logout-confirmation-modal'),
    'confirm-logout-btn': () => {
        window.closeModal('logout-confirmation-modal');
        window.handleLogout();
    },

    // Calendario (Delegamos a CalendarActions)
    'prev-month-btn': () => window.CalendarActions && window.CalendarActions.prevMonth && window.CalendarActions.prevMonth(),
    'next-month-btn': () => window.CalendarActions && window.CalendarActions.nextMonth && window.CalendarActions.nextMonth(),

    // Chat (Delegamos a ChatActions)
    'send-message-btn': () => window.ChatActions && window.ChatActions.sendMessage && window.ChatActions.sendMessage(),
    'close-chat-modal-btn': () => window.ChatActions && window.ChatActions.closeChatModal && window.ChatActions.closeChatModal()
};

window.initializeButtons = function () {
    for (const [id, action] of Object.entries(window.AppButtons)) {
        const btn = document.getElementById(id);
        if (btn) {
            // Clonar el nodo para eliminar listeners anteriores si los hubiera
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (action) action();
            });
        }
    }
};

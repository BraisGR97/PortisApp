/**
 * Buttons.js - Centraliza la lógica de los botones
 * Define comportamientos para modo Normal y modo Mock.
 */

window.AppButtons = {
    'start-btn': {
        normal: () => window.showScreen('login-screen'),
        mock: () => window.showScreen('login-screen')
    },

    'login-btn': {
        normal: async () => {
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
                console.error("Error en Firebase Login:", error.code, error.message);
                window.showMessage(loginMessageId, window.getFirebaseErrorMessage(error.code), 'error');
                window.toggleBackgroundAnimation(false);
            } finally {
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Entrar';
                }
            }
        },
        mock: async () => {
            window.toggleBackgroundAnimation(true);
            const loginMessageId = 'login-message';
            const loginBtn = document.getElementById('login-btn');

            if (loginBtn) {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Entrando...';
            }

            const inputIdentifier = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();

            // Usamos MOCK_CREDENTIALS globales o definidos aquí si no existen
            const mockCreds = window.MOCK_CREDENTIALS || { email: 'admin@portis.com', password: '0000', displayName: 'Admin' };

            const isUsernameMatch = inputIdentifier === mockCreds.displayName;
            const isEmailMatch = inputIdentifier === mockCreds.email;

            if ((isUsernameMatch || isEmailMatch) && password === mockCreds.password) {
                window.showMessage(loginMessageId, `Inicio de sesión (DEMO) exitoso. Redirigiendo...`, 'success');

                sessionStorage.setItem('portis-user-identifier', window.MOCK_USER_ID || mockCreds.displayName);
                sessionStorage.setItem('portis-user-display-name', mockCreds.displayName);
                sessionStorage.setItem('portis-show-welcome', 'true');

                setTimeout(() => {
                    window.location.href = 'Main/Main.html';
                }, 800);
            } else {
                window.showMessage(loginMessageId, `Credenciales de demostración incorrectas. Usa "${mockCreds.email}" / "${mockCreds.password}".`, 'error');
                window.toggleBackgroundAnimation(false);
            }
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Entrar';
            }
        }
    },

    'register-btn': {
        normal: async () => {
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
                console.error("Error en registro:", error.code);
                window.showMessage('register-message', window.getFirebaseErrorMessage(error.code), 'error');
                window.toggleBackgroundAnimation(false);
            } finally {
                registerBtn.disabled = false;
                registerBtn.textContent = 'Crear Cuenta';
            }
        },
        mock: () => {
            window.toggleBackgroundAnimation(true);
            window.showMessage('register-message', 'El registro está deshabilitado en modo DEMO/MOCK.', 'error');
            window.toggleBackgroundAnimation(false);
        }
    },

    'reset-password-btn': {
        normal: async () => {
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
                console.error("Error en reseteo:", error.code);
                window.showMessage('forgot-message', window.getFirebaseErrorMessage(error.code), 'error');
            } finally {
                resetPasswordBtn.disabled = false;
                resetPasswordBtn.textContent = 'Enviar Enlace';
                window.toggleBackgroundAnimation(false);
            }
        },
        mock: () => {
            window.toggleBackgroundAnimation(true);
            window.showMessage('forgot-message', 'La recuperación de contraseña está deshabilitada en modo DEMO/MOCK.', 'error');
            window.toggleBackgroundAnimation(false);
        }
    },

    'go-to-register-btn': {
        normal: () => window.showScreen('register-screen'),
        mock: () => window.showScreen('register-screen')
    },
    'go-to-forgot-btn': {
        normal: () => window.showScreen('forgot-password-screen'),
        mock: () => window.showScreen('forgot-password-screen')
    },
    'go-to-login-from-register-btn': {
        normal: () => window.showScreen('login-screen'),
        mock: () => window.showScreen('login-screen')
    },
    'go-to-login-from-forgot-btn': {
        normal: () => window.showScreen('login-screen'),
        mock: () => window.showScreen('login-screen')
    },

    // --- BOTONES DE MAIN.HTML ---

    // Navegación
    'nav-home-btn': {
        normal: () => window.switchView('dashboard-view'),
        mock: () => window.switchView('dashboard-view')
    },
    'nav-maintenance-btn': {
        normal: () => window.switchView('maintenance-view'),
        mock: () => window.switchView('maintenance-view')
    },
    'nav-messages-btn': {
        normal: () => window.switchView('chat-view'),
        mock: () => window.switchView('chat-view')
    },
    'nav-calendar-btn': {
        normal: () => window.switchView('calendar-view'),
        mock: () => window.switchView('calendar-view')
    },

    // Logout
    'logout-btn': {
        normal: () => window.showModal('logout-confirmation-modal'),
        mock: () => window.showModal('logout-confirmation-modal')
    },
    'cancel-logout-btn': {
        normal: () => window.closeModal('logout-confirmation-modal'),
        mock: () => window.closeModal('logout-confirmation-modal')
    },
    'confirm-logout-btn': {
        normal: () => {
            window.closeModal('logout-confirmation-modal');
            window.handleLogout();
        },
        mock: () => {
            window.closeModal('logout-confirmation-modal');
            window.handleLogout();
        }
    },

    // Calendario (Delegamos a CalendarActions)
    'prev-month-btn': {
        normal: () => window.CalendarActions && window.CalendarActions.prevMonth(),
        mock: () => window.CalendarActions && window.CalendarActions.prevMonth()
    },
    'next-month-btn': {
        normal: () => window.CalendarActions && window.CalendarActions.nextMonth(),
        mock: () => window.CalendarActions && window.CalendarActions.nextMonth()
    },

    // Chat (Delegamos a ChatActions)
    'send-message-btn': {
        normal: () => window.ChatActions && window.ChatActions.sendMessage(),
        mock: () => window.ChatActions && window.ChatActions.sendMessage()
    },
    'close-chat-modal-btn': {
        normal: () => window.closeChatModal('message-modal'),
        mock: () => window.closeChatModal('message-modal')
    }
};

window.initializeButtons = function () {
    console.log("Inicializando botones...");
    for (const [id, actions] of Object.entries(window.AppButtons)) {
        const btn = document.getElementById(id);
        if (btn) {
            // Clonar el nodo para eliminar listeners anteriores si los hubiera
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.IS_MOCK_MODE) {
                    console.log(`Click en ${id} (Modo MOCK)`);
                    if (actions.mock) actions.mock();
                } else {
                    console.log(`Click en ${id} (Modo NORMAL)`);
                    if (actions.normal) actions.normal();
                }
            });
        } else {
            console.warn(`Botón con ID ${id} no encontrado.`);
        }
    }
};

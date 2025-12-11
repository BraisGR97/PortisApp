// Settings.js - Gestión completa de configuración de usuario
(() => {
    const IS_MOCK_MODE = window.IS_MOCK_MODE || false;
    let userId = null;
    let db = null;

    // Referencias a elementos del DOM
    const themeToggle = document.getElementById('dark-mode-toggle');
    const languageSelect = document.getElementById('language-select');
    const locationSelect = document.getElementById('location-select');
    const companySelect = document.getElementById('company-select');
    const userDisplay = document.getElementById('current-user-display');

    // Elementos del modal de eliminación
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const confirmInput = document.getElementById('confirm-input');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

    // =======================================================
    // 1. INICIALIZACIÓN Y CARGA DE USUARIO
    // =======================================================

    async function initializeSettings() {
        console.log('🔧 Initializing Settings...');

        // Inicializar Firebase si no está en modo mock
        if (!IS_MOCK_MODE && window.firebaseConfig) {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(window.firebaseConfig);
                }
                db = firebase.firestore();

                // Esperar a que Firebase Auth esté listo
                const user = await new Promise((resolve) => {
                    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                        unsubscribe();
                        resolve(user);
                    });
                });

                if (user) {
                    userId = user.uid;
                    sessionStorage.setItem('portis-user-identifier', userId);
                    if (user.displayName) {
                        sessionStorage.setItem('portis-user-display-name', user.displayName);
                    }
                    console.log('✅ Firebase Auth ready. UserId:', userId);
                }
            } catch (error) {
                console.error('Error initializing Firebase:', error);
            }
        }

        // Cargar usuario desde sessionStorage si no se obtuvo de Firebase
        if (!userId) {
            userId = sessionStorage.getItem('portis-user-identifier');
        }
        const userDisplayName = sessionStorage.getItem('portis-user-display-name');

        // Actualizar display del usuario
        if (userDisplay) {
            if (userDisplayName) {
                userDisplay.textContent = userDisplayName;
            } else if (userId) {
                userDisplay.textContent = userId.substring(0, 10) + '...';
            } else {
                userDisplay.textContent = 'Invitado';
            }
        }

        console.log('📊 Settings State:', { userId, IS_MOCK_MODE, hasDB: !!db });

        // Cargar configuración guardada
        await loadSettings();

        // Configurar listeners
        setupEventListeners();
        setupDeleteAccountListeners();

        // Aplicar tema inicial
        if (window.applyColorMode) window.applyColorMode();

        console.log('✅ Settings initialized successfully');
    }

    // =======================================================
    // 2. CARGA DE CONFIGURACIÓN
    // =======================================================

    async function loadSettings() {
        if (IS_MOCK_MODE || !userId) {
            loadSettingsFromLocalStorage();
        } else {
            await loadSettingsFromFirestore();
        }
    }

    function loadSettingsFromLocalStorage() {
        const theme = localStorage.getItem('portis-theme') || 'dark';
        const language = localStorage.getItem('portis-language') || 'es';
        const location = localStorage.getItem('portis-location') || 'nacional';
        const company = localStorage.getItem('portis-company') || 'otis';

        if (themeToggle) themeToggle.checked = theme === 'dark';
        if (languageSelect) languageSelect.value = language;
        if (locationSelect) locationSelect.value = location;
        if (companySelect) companySelect.value = company;

        console.log('📥 Loaded from localStorage:', { theme, language, location, company });
    }

    async function loadSettingsFromFirestore() {
        if (!db || !userId) {
            console.warn('⚠️ Cannot load from Firestore: db or userId missing');
            loadSettingsFromLocalStorage();
            return;
        }

        // 🚀 OPTIMIZACIÓN: Cargar primero desde localStorage (instantáneo)
        loadSettingsFromLocalStorage();

        try {
            console.log('📥 Loading settings from Firestore for user:', userId);
            const settingsDoc = await db.collection('users').doc(userId).collection('settings').doc('preferences').get();

            if (settingsDoc.exists) {
                const data = settingsDoc.data();
                console.log('✅ Settings loaded from Firestore:', data);

                // Actualizar UI solo si los valores son diferentes
                const currentTheme = localStorage.getItem('portis-theme') || 'dark';
                const currentLanguage = localStorage.getItem('portis-language') || 'es';
                const currentLocation = localStorage.getItem('portis-location') || 'nacional';
                const currentCompany = localStorage.getItem('portis-company') || 'otis';

                const firestoreTheme = data.theme || 'dark';
                const firestoreLanguage = data.language || 'es';
                const firestoreLocation = data.location || 'nacional';
                const firestoreCompany = data.company || 'otis';

                // Actualizar solo si hay diferencias
                if (currentTheme !== firestoreTheme || currentLanguage !== firestoreLanguage ||
                    currentLocation !== firestoreLocation || currentCompany !== firestoreCompany) {

                    if (themeToggle) themeToggle.checked = firestoreTheme === 'dark';
                    if (languageSelect) languageSelect.value = firestoreLanguage;
                    if (locationSelect) locationSelect.value = firestoreLocation;
                    if (companySelect) companySelect.value = firestoreCompany;

                    localStorage.setItem('portis-theme', firestoreTheme);
                    localStorage.setItem('portis-language', firestoreLanguage);
                    localStorage.setItem('portis-location', firestoreLocation);
                    localStorage.setItem('portis-company', firestoreCompany);

                    // Actualizar logo si la empresa cambió
                    if (currentCompany !== firestoreCompany && typeof window.updateAppLogo === 'function') {
                        window.updateAppLogo();
                    }

                    console.log('🔄 Settings updated from Firestore');
                }
            } else {
                console.log('ℹ️ No settings found in Firestore, saving current settings');
                await saveSettings();
            }
        } catch (error) {
            console.error('❌ Error loading settings from Firestore:', error);
            // localStorage ya está cargado, no hacer nada más
        }
    }

    // =======================================================
    // 3. GUARDADO DE CONFIGURACIÓN
    // =======================================================

    async function saveSettings() {
        const theme = themeToggle?.checked ? 'dark' : 'light';
        const language = languageSelect?.value || 'es';
        const location = locationSelect?.value || 'nacional';
        const company = companySelect?.value || 'otis';

        const settings = { theme, language, location, company };

        localStorage.setItem('portis-theme', theme);
        localStorage.setItem('portis-language', language);
        localStorage.setItem('portis-location', location);
        localStorage.setItem('portis-company', company);

        console.log('💾 Saving settings:', settings, { IS_MOCK_MODE, hasDB: !!db, userId });

        if (!IS_MOCK_MODE && db && userId) {
            try {
                // Guardar en settings/preferences
                await db.collection('users').doc(userId).collection('settings').doc('preferences').set(settings, { merge: true });

                // 🔑 CLAVE: Guardar la empresa también en el documento principal del usuario
                // para que otros usuarios puedan ver el logo correcto en el chat
                await db.collection('users').doc(userId).set({ company: company }, { merge: true });

                console.log('✅ Settings saved to Firestore successfully');
            } catch (error) {
                console.error('❌ Error saving settings to Firestore:', error);
            }
        } else {
            console.log('ℹ️ Settings saved to localStorage only (Mock mode or no Firebase)');
        }

        window.dispatchEvent(new CustomEvent('settingsChanged', { detail: settings }));
    }

    // =======================================================
    // 4. EVENT LISTENERS
    // =======================================================

    function setupEventListeners() {
        if (themeToggle) {
            themeToggle.addEventListener('change', async () => {
                await saveSettings();

                // Aplicar el tema inmediatamente al documentElement
                const theme = themeToggle.checked ? 'dark' : 'light';
                if (theme === 'light') {
                    document.documentElement.classList.add('light-mode');
                    document.documentElement.classList.remove('dark-mode');
                } else {
                    document.documentElement.classList.add('dark-mode');
                    document.documentElement.classList.remove('light-mode');
                }

                console.log(`✓ Tema aplicado: ${theme.toUpperCase()}`);
            });
        }

        if (languageSelect) {
            languageSelect.addEventListener('change', async () => {
                await saveSettings();
            });
        }

        if (locationSelect) {
            locationSelect.addEventListener('change', async () => {
                console.log('📍 Location changed to:', locationSelect.value);
                await saveSettings();
            });
        }

        if (companySelect) {
            companySelect.addEventListener('change', async () => {
                console.log('🏢 Company changed to:', companySelect.value);
                await saveSettings();
                // Opcional: Recargar para aplicar cambio de logo inmediato si fuera necesario, 
                // pero por ahora solo guardamos. La app recargará la imagen al navegar.
                if (typeof window.updateAppLogo === 'function') {
                    window.updateAppLogo();
                }
            });
        }
    }

    // =======================================================
    // 5. ELIMINAR CUENTA
    // =======================================================

    function setupDeleteAccountListeners() {
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => {
                if (deleteModal) {
                    deleteModal.classList.remove('hidden');
                }
            });
        }

        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => {
                if (deleteModal) {
                    deleteModal.classList.add('hidden');
                    if (confirmInput) confirmInput.value = '';
                    if (confirmDeleteBtn) {
                        confirmDeleteBtn.disabled = true;
                        confirmDeleteBtn.classList.add('opacity-50');
                    }
                }
            });
        }

        if (confirmInput) {
            confirmInput.addEventListener('input', () => {
                const isValid = confirmInput.value.trim() === 'ELIMINAR MI CUENTA';
                if (confirmDeleteBtn) {
                    confirmDeleteBtn.disabled = !isValid;
                    if (isValid) {
                        confirmDeleteBtn.classList.remove('opacity-50');
                    } else {
                        confirmDeleteBtn.classList.add('opacity-50');
                    }
                }
            });
        }

        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                if (confirmInput && confirmInput.value.trim() === 'ELIMINAR MI CUENTA') {
                    await deleteUserAccount();
                }
            });
        }
    }

    async function deleteUserAccount() {
        if (!userId) {
            alert('No hay usuario autenticado');
            return;
        }

        try {
            if (deleteModal) deleteModal.classList.add('hidden');
            alert('Eliminando cuenta y todos los datos...');

            if (!IS_MOCK_MODE && db) {
                const collections = ['repairs', 'bills', 'calendar', 'calendarEvents', 'settings'];

                for (const collectionName of collections) {
                    const snapshot = await db.collection('users').doc(userId).collection(collectionName).get();
                    const batch = db.batch();
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }

                await db.collection('users').doc(userId).delete();

                const user = firebase.auth().currentUser;
                if (user) {
                    await user.delete();
                }
            }

            localStorage.clear();
            sessionStorage.clear();

            alert('Cuenta eliminada exitosamente');
            window.location.href = '../Login/Login.html';
        } catch (error) {
            console.error('Error al eliminar cuenta:', error);
            alert('Error al eliminar la cuenta: ' + error.message);
        }
    }

    // =======================================================
    // 6. INICIAR AL CARGAR LA PÁGINA
    // =======================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSettings);
    } else {
        initializeSettings();
    }

})();
// ================================================================
// BORDE ANIMADO EN SCROLL
// ================================================================
// ================================================================
// BORDE ANIMADO EN SCROLL (Removed per request)
// ================================================================
// document.addEventListener('DOMContentLoaded', ...);

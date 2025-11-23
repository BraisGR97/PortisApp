/**
 * ====================================================================
 * Main.js - Lógica Central de la Aplicación Portis (VERSION CORREGIDA)
 * ====================================================================
 */

(function () { // ⬅️ Inicia la IIFE para aislar el ámbito

    // ====================================
    // 1. CONFIGURACIÓN LOCAL
    // ====================================

    // 🔑 Se usan las variables globales de window.config.js
    const IS_MOCK_MODE = window.IS_MOCK_MODE;
    const MOCK_USER_ID = window.MOCK_USER_ID;
    const MOCK_USER_DISPLAY_NAME = window.MOCK_USER_DISPLAY_NAME || 'Administrador (MOCK)'; // Usamos la variable global
    const firebaseConfig = window.firebaseConfig;

    const DOM = {};

    // 🔑 CLAVE: Variable de control para asegurar que la vista inicial solo cargue una vez
    let isFirstLoadComplete = false;

    // 🚨 CLAVE CRÍTICA: Promesa para indicar que Firebase/Firestore está listo y asignado
    let resolveFirebaseReady;
    window.firebaseReadyPromise = new Promise(resolve => {
        resolveFirebaseReady = resolve;
    });

    // ====================================
    // 2. LÓGICA DE INICIALIZACIÓN CRÍTICA
    // ====================================

    /**
     * 🔑 FUNCIÓN CRÍTICA: Inicializa la vista principal después de que window.db esté listo.
     * Esto solo se llama una vez por carga de página, dentro del onAuthStateChanged o en MOCK.
     */
    function initializeModuleDependencies() {
        if (isFirstLoadComplete) return; // Evita doble ejecución

        console.log("Main.js: Inicializando módulos dependientes de la base de datos.");

        // 1. Determinar la vista a cargar (última vista o dashboard)
        const initialView = sessionStorage.getItem('last-view') || 'dashboard-view';

        // 2. Cargar la vista. El tercer parámetro indica que es la carga inicial.
        // Esto activará la inicialización de los datos (e.g., startRepairsModule)
        // y ocultará la pantalla de carga.
        window.switchView(initialView, true);

        isFirstLoadComplete = true; // Bloquea futuras ejecuciones accidentales
    }


    /**
     * 🔑 FUNCIÓN CRÍTICA: Configura el listener principal de Firebase Auth.
     */
    async function setupAuthListener() {
        if (IS_MOCK_MODE) {
            console.warn("Main.js: Modo MOCK activado. Forzando usuario Admin.");
            
            // Asignamos el ID y el nombre del admin mock (CRÍTICO: Simula el estado de sesión)
            sessionStorage.setItem('portis-user-identifier', MOCK_USER_ID);
            sessionStorage.setItem('portis-user-display-name', MOCK_USER_DISPLAY_NAME);
            window.IS_MOCK_MODE = true;
            
            // 🚨 CORRECCIÓN CLAVE 1: Resolvemos la promesa en Mock Mode.
            // Esto permite que Repairs.js y otros módulos se inicialicen.
            resolveFirebaseReady();
            
            // 🚨 CORRECCIÓN CLAVE 2: Llamamos a la inicialización de módulos.
            // Esto cargará la vista y la UI.
            displayUserName(); // Llamada para actualizar el DOM inmediatamente
            initializeModuleDependencies();

            return;
        }

        // --- Lógica de Firebase (Modo Normal) ---

        if (typeof firebase === 'undefined' || !firebaseConfig) {
            console.error("Firebase no está disponible. Verifique la configuración.");
            window.location.href = '../index.html';
            return;
        }

        // 1. Inicialización y persistencia (v8/compat)
        let authInstance = null;
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        authInstance = firebase.auth();
        // Aseguramos la persistencia de la sesión
        await authInstance.setPersistence(firebase.auth.Auth.Persistence.SESSION);

        // 2. Listener de Estado de Autenticación (CRÍTICO)
        authInstance.onAuthStateChanged((user) => {
            if (user) {
                // 🚨 ÉXITO: Sesión confirmada. Asignamos las instancias a WINDOW.
                window.db = firebase.firestore();
                window.auth = authInstance;
                window.IS_MOCK_MODE = false;

                // 🚨 CRÍTICO: Resolvemos la promesa para desbloquear scripts dependientes
                resolveFirebaseReady();

                const currentUserId = sessionStorage.getItem('portis-user-identifier');

                if (!currentUserId || currentUserId !== user.uid) {
                    sessionStorage.setItem('portis-user-identifier', user.uid);
                    // No sobreescribimos el display name aquí si ya existe, solo si es la primera vez o cambia el user.
                }

                console.log(`Main.js: Sesión de usuario confirmada: ${user.uid}. DB y Auth asignados globalmente.`);
                displayUserName(user.email); // Usar el email si no hay display name

                // 🔑 Inicializar Módulos SOLO DESPUÉS de que window.db esté listo y solo una vez.
                initializeModuleDependencies();

            } else {
                // Sesión perdida o no activa.
                sessionStorage.removeItem('portis-user-identifier');
                sessionStorage.removeItem('portis-user-display-name');
                console.warn("Main.js: Sesión no activa. Redirigiendo a login.");

                // Forzamos la redirección 
                window.location.href = '../index.html';
            }
        });
    }

    // ====================================
    // 3. GESTIÓN DE VISTAS (NAVEGACIÓN)
    // ====================================

    /**
     * Cambia la vista activa de la aplicación.
     * @param {string} targetId - El ID de la vista a mostrar.
     * @param {boolean} [isInitialLoad=false] - Indica si es la primera carga.
     */
    window.switchView = function (targetId, isInitialLoad = false) {
        // 1. Ocultar todas las vistas
        DOM.appViews.forEach(view => {
            view.style.display = 'none';
            view.classList.remove('active-view');
        });

        // 2. Mostrar la vista objetivo
        const targetView = document.getElementById(targetId);
        if (targetView) {
            targetView.style.display = (targetId === 'dashboard-view') ? 'grid' : 'flex';
            targetView.classList.add('active-view');

            // Guardar la última vista
            sessionStorage.setItem('last-view', targetId);

            if (DOM.scrollableContent) {
                DOM.scrollableContent.scrollTop = 0;
            }

            // 3. Actualizar el estado 'active' en la barra de navegación inferior
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => link.classList.remove('active'));

            const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }

            // 4. Ejecutar lógica específica para la vista
            if (targetId === 'calendar-view' && typeof window.initCalendar === 'function') {
                window.initCalendar();
            }

            if (targetId === 'chat-view' && typeof window.initChat === 'function') {
                window.initChat();
            }

            // 🚨 CORRECCIÓN CLAVE 3: Cambiamos window.initMaintenance a window.startRepairsModule
            // para ser consistente con el Repairs.js corregido.
            if (targetId === 'maintenance-view' && typeof window.initMaintenanceView === 'function') {
                window.initMaintenanceView(); // <-- Asegúrate de usar este nombre
            }

            // Ocultar pantalla de carga si estamos cargando la primera vista después de la autenticación
            if (isInitialLoad) {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) loadingScreen.style.display = 'none';
            }
        }
    }

    // ====================================
    // 4. GESTIÓN DE SESIÓN Y USUARIO
    // ====================================

    function displayUserName(defaultEmail) {
        let username;
        // La lógica de forzar "Admin" en MOCK ya está en Repairs.js,
        // pero aquí establecemos el valor base global.
        if (window.IS_MOCK_MODE) {
            username = MOCK_USER_DISPLAY_NAME; 
        } else {
            // Usar el nombre guardado, si no, el email de la sesión de Firebase
            username = sessionStorage.getItem('portis-user-display-name') || defaultEmail || 'Usuario';
        }

        if (DOM.currentUserDisplay) {
            DOM.currentUserDisplay.textContent = username;
        }
    }

    /**
     * Cierra la sesión de Firebase y limpia la persistencia.
     */
    async function handleLogout() {
        console.log(`${window.IS_MOCK_MODE ? 'MOCK MODE' : 'NORMAL MODE'}: Cerrando sesión...`);

        // 1. Limpieza de SessionStorage
        sessionStorage.removeItem('portis-user-identifier');
        sessionStorage.removeItem('portis-user-display-name');
        sessionStorage.removeItem('last-view'); // También limpiamos la última vista

        // 2. Limpieza de configuración opcional
        localStorage.removeItem('portis-theme');

        // 3. Cierre de sesión de Firebase
        if (!window.IS_MOCK_MODE && window.auth) {
            try {
                // Usamos la instancia global window.auth
                await window.auth.signOut();
                console.log("Sesión de Firebase cerrada y persistencia eliminada.");
            } catch (error) {
                console.error("Error al cerrar sesión de Firebase:", error);
            }
        }

        // 4. Redirección forzada al login
        window.location.href = '../index.html';
    }
    // Hacemos el logout accesible globalmente por si lo necesita otro script
    window.handleLogout = handleLogout;

    // ====================================
    // 5. GESTIÓN DE MODALES
    // ====================================

    // Hacemos las funciones de modal globales (se asume que Main.js es el gestor)
    window.showModal = function (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            // Opcional: añadir clase para animación/transición
            // modal.classList.add('is-active'); 
        }
    }

    /**
     * OCULTA un modal. Se renombra a closeModal para compatibilidad HTML/Calendar.js.
     */
    window.closeModal = function (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            // Opcional: quitar clase para animación/transición
            // modal.classList.remove('is-active');
            modal.style.display = 'none';
        }
    }


    // ====================================
    // 6. INICIALIZACIÓN DE LA APP
    // ====================================

    /**
     * Se ejecuta cuando el DOM está completamente cargado
     */
    document.addEventListener('DOMContentLoaded', async () => {
        // 1. Inicializa las referencias DOM globales
        DOM.appViews = document.querySelectorAll('.app-view');
        DOM.navLinks = document.querySelectorAll('.nav-link');
        DOM.scrollableContent = document.getElementById('scrollable-content');
        DOM.currentUserDisplay = document.getElementById('current-user-display');

        console.log(`Portis App Iniciada. Modo: ${window.IS_MOCK_MODE ? 'MOCK' : 'NORMAL (Firebase)'}`);

        // 🔑 CORRECCIÓN DEL TEMA: Llama a la función de modo oscuro/claro inmediatamente
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
            console.log("Tema aplicado al cargar DOM.");
        }

        // 2. Inicializar botones centralizados
        if (typeof window.initializeButtons === 'function') {
            window.initializeButtons();
        } else {
            console.error("Buttons.js no se ha cargado correctamente.");
        }

        // 3. 🚨 Configura el listener de autenticación. Este es el punto de inicio real.
        await setupAuthListener();
    });

})(); // ⬅️ Fin de la IIFE
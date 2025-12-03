/**
 * ====================================================================
 * Main.js - Logica Central de la Aplicacion Portis
 * ====================================================================
 */

(function () {
    // ====================================================================
    // CONFIGURACION Y VARIABLES GLOBALES
    // ====================================================================

    const firebaseConfig = window.firebaseConfig;
    let app;
    let auth;
    let db;
    let userId = null;

    // Estado de la navegacion - Chat en el centro (posicion 1 del array)
    let currentView = 'chat-view'; // Vista por defecto
    const views = ['calendar-view', 'chat-view', 'dashboard-view', 'maintenance-view'];

    // Variables para gestos tactiles (Swipe)
    let touchStartX = 0;
    let touchEndX = 0;

    // Promesa para indicar que Firebase esta listo
    let resolveFirebaseReady;
    window.firebaseReadyPromise = new Promise(resolve => {
        resolveFirebaseReady = resolve;
    });

    // ====================================================================
    // AUTENTICACION Y SETUP
    // ====================================================================

    /**
     * Inicializa Firebase y configura el listener de autenticacion.
     */
    async function setupAuthListener() {
        if (!firebaseConfig) {
            // Configuracion de Firebase no encontrada
            window.location.href = '../index.html';
            return;
        }

        try {
            if (!firebase.apps.length) {
                app = firebase.initializeApp(firebaseConfig);
            } else {
                app = firebase.app();
            }

            auth = firebase.auth();
            db = firebase.firestore();

            // Exponer instancias globalmente para otros modulos
            window.db = db;
            window.auth = auth;

            // Persistencia de sesion
            await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

            auth.onAuthStateChanged((user) => {
                if (user) {
                    userId = user.uid;
                    sessionStorage.setItem('portis-user-identifier', userId);

                    // Actualizar UI con nombre de usuario
                    const displayName = sessionStorage.getItem('portis-user-display-name') || user.email;
                    const displayElement = document.getElementById('current-user-display');
                    if (displayElement) displayElement.textContent = displayName;

                    // Resolver promesa para modulos dependientes
                    resolveFirebaseReady();

                    // Inicializar vista
                    initializeView();

                } else {
                    // No autenticado
                    sessionStorage.removeItem('portis-user-identifier');
                    window.location.href = '../index.html';
                }
            });

        } catch (error) {
            // Error al inicializar Firebase
        }
    }

    /**
     * Inicializa la vista correcta al cargar la aplicacion.
     */
    function initializeView() {
        // Recuperar ultima vista o usar chat por defecto
        const lastView = sessionStorage.getItem('last-view') || 'chat-view';
        switchView(lastView);
    }

    // ====================================================================
    // NAVEGACION Y SLIDER
    // ====================================================================

    /**
     * Cambia la vista activa usando el slider.
     * @param {string} targetViewId - ID de la vista a mostrar
     */
    window.switchView = function (targetViewId) {
        const slider = document.getElementById('views-slider');
        const viewIndex = views.indexOf(targetViewId);

        if (viewIndex === -1 || !slider) return;

        // Actualizar estado
        currentView = targetViewId;
        sessionStorage.setItem('last-view', targetViewId);

        // Mover el slider
        const translateX = -(viewIndex * 25); // 25% por cada vista (ya que son 4 vistas en 400% de ancho)
        slider.style.transform = `translateX(${translateX}%)`;

        // Actualizar botones de navegacion
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.target === targetViewId) {
                btn.classList.add('active');
            }
        });

        // Inicializar modulos especificos segun la vista
        initializeModuleForView(targetViewId);

        // Actualizar efecto de borde en tarjetas
        setTimeout(updateCardBorderOpacity, 100);
    }

    /**
     * Inicializa el modulo correspondiente a la vista activa.
     * @param {string} viewId - ID de la vista
     */
    function initializeModuleForView(viewId) {
        switch (viewId) {
            case 'calendar-view':
                if (typeof window.initCalendar === 'function') window.initCalendar();
                break;
            case 'chat-view':
                if (typeof window.initChat === 'function') window.initChat();
                break;
            case 'maintenance-view':
                if (typeof window.initMaintenanceView === 'function') window.initMaintenanceView();
                break;
        }
    }

    // ====================================================================
    // GESTOS TACTILES (SWIPE)
    // ====================================================================

    /**
     * Maneja el gesto de swipe para cambiar de vista.
     */
    function handleSwipeGesture() {
        const swipeThreshold = 50; // Distancia minima para considerar swipe
        const diffX = touchStartX - touchEndX;

        if (Math.abs(diffX) > swipeThreshold) {
            const currentIndex = views.indexOf(currentView);

            if (diffX > 0) {
                // Swipe izquierda -> Siguiente vista
                if (currentIndex < views.length - 1) {
                    switchView(views[currentIndex + 1]);
                }
            } else {
                // Swipe derecha -> Vista anterior
                if (currentIndex > 0) {
                    switchView(views[currentIndex - 1]);
                }
            }
        }
    }

    /**
     * Inicializa los listeners para gestos tactiles.
     */
    function initializeSwipe() {
        const content = document.getElementById('app-content');
        if (!content) return;

        content.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        content.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipeGesture();
        }, { passive: true });
    }

    // ====================================================================
    // EFECTOS VISUALES
    // ====================================================================

    /**
     * Actualiza la opacidad del borde superior de las tarjetas segun el scroll.
     */
    /**
     * Actualiza la opacidad del borde de las tarjetas segun el scroll.
     */
    function updateCardBorderOpacity() {
        const viewportHeight = window.innerHeight;

        // 1. Manejar Card Containers (Border TOP)
        const containers = document.querySelectorAll('.card-container');
        containers.forEach(element => {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top;
            const elementHeight = rect.height;

            let opacity = 0;
            if (elementTop < viewportHeight && elementTop > -elementHeight) {
                const normalizedPosition = Math.max(0, Math.min(1, elementTop / (viewportHeight * 0.7)));
                opacity = 1 - normalizedPosition;
                opacity = 0.2 + (opacity * 0.8);
            }
            element.style.borderTopColor = `rgba(255, 255, 255, ${opacity})`;
        });

        // 2. Manejar Items Internos (Border BOTTOM)
        const items = document.querySelectorAll('.dashboard-card, .user-chat-card, .maintenance-item');
        items.forEach(element => {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top;
            const elementHeight = rect.height;

            let opacity = 0;
            if (elementTop < viewportHeight && elementTop > -elementHeight) {
                const normalizedPosition = Math.max(0, Math.min(1, elementTop / (viewportHeight * 0.7)));
                opacity = 1 - normalizedPosition;
                opacity = 0.2 + (opacity * 0.8);
            }
            element.style.borderBottomColor = `rgba(255, 255, 255, ${opacity})`;
        });
    }

    // ====================================================================
    // GESTION DE SESION
    // ====================================================================

    /**
     * Cierra la sesion del usuario.
     */
    window.handleLogout = async function () {
        try {
            await auth.signOut();
            sessionStorage.clear();
            window.location.href = '../index.html';
        } catch (error) {
            // Error al cerrar sesion
        }
    }

    // ====================================================================
    // GESTION DE MODALES (Global)
    // ====================================================================

    window.showModal = function (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    window.closeModal = function (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    // ====================================================================
    // INICIALIZACION
    // ====================================================================

    document.addEventListener('DOMContentLoaded', () => {
        // Aplicar tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        // Inicializar botones (Buttons.js)
        if (typeof window.initializeButtons === 'function') {
            window.initializeButtons();
        }

        // Configurar navegacion por botones
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (target) switchView(target);
            });
        });

        // Configurar swipe
        initializeSwipe();

        // Listeners para efectos de scroll
        window.addEventListener('scroll', updateCardBorderOpacity);
        window.addEventListener('resize', updateCardBorderOpacity);

        // Listener de scroll en cada contenedor interno (donde ocurre el scroll real)
        document.querySelectorAll('.card-inner-content').forEach(section => {
            section.addEventListener('scroll', updateCardBorderOpacity);
        });

        // Iniciar autenticacion
        setupAuthListener();
    });

})();

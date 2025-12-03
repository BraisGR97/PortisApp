/**
 * ====================================================================
 * Main.js - Lógica Central de la Aplicación Portis
 * ====================================================================
 */

(function () {
    // ====================================================================
    // CONFIGURACIÓN Y VARIABLES GLOBALES
    // ====================================================================

    const firebaseConfig = window.firebaseConfig;
    let app;
    let auth;
    let db;
    let userId = null;

    // Estado de la navegación - Dashboard en el centro (posición 1 del array)
    let currentView = 'dashboard-view'; // Vista por defecto
    const views = ['calendar-view', 'dashboard-view', 'chat-view', 'maintenance-view'];

    // Variables para gestos táctiles (Swipe)
    let touchStartX = 0;
    let touchEndX = 0;

    // Promesa para indicar que Firebase está listo
    let resolveFirebaseReady;
    window.firebaseReadyPromise = new Promise(resolve => {
        resolveFirebaseReady = resolve;
    });

    // ====================================================================
    // AUTENTICACIÓN Y SETUP
    // ====================================================================

    /**
     * Inicializa Firebase y configura el listener de autenticación.
     */
    async function setupAuthListener() {
        if (!firebaseConfig) {
            console.error("Configuración de Firebase no encontrada.");
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

            // Exponer instancias globalmente para otros módulos
            window.db = db;
            window.auth = auth;

            // Persistencia de sesión
            await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

            auth.onAuthStateChanged((user) => {
                if (user) {
                    userId = user.uid;
                    sessionStorage.setItem('portis-user-identifier', userId);

                    // Actualizar UI con nombre de usuario
                    const displayName = sessionStorage.getItem('portis-user-display-name') || user.email;
                    const displayElement = document.getElementById('current-user-display');
                    if (displayElement) displayElement.textContent = displayName;

                    // Resolver promesa para módulos dependientes
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
            console.error("Error al inicializar Firebase:", error);
        }
    }

    /**
     * Inicializa la vista correcta al cargar la aplicación.
     */
    function initializeView() {
        // Recuperar última vista o usar dashboard por defecto
        const lastView = sessionStorage.getItem('last-view') || 'dashboard-view';
        switchView(lastView);
    }

    // ====================================================================
    // NAVEGACIÓN Y SLIDER
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

        // Actualizar botones de navegación
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.target === targetViewId) {
                btn.classList.add('active');
            }
        });

        // Inicializar módulos específicos según la vista
        initializeModuleForView(targetViewId);

        // Actualizar efecto de borde en tarjetas
        setTimeout(updateCardBorderOpacity, 100);
    }

    /**
     * Inicializa el módulo correspondiente a la vista activa.
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
    // GESTOS TÁCTILES (SWIPE)
    // ====================================================================

    /**
     * Maneja el gesto de swipe para cambiar de vista.
     */
    function handleSwipeGesture() {
        const swipeThreshold = 50; // Distancia mínima para considerar swipe
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
     * Inicializa los listeners para gestos táctiles.
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
     * Actualiza la opacidad del borde superior de las tarjetas según el scroll.
     */
    function updateCardBorderOpacity() {
        const elements = document.querySelectorAll('.card-container');
        const viewportHeight = window.innerHeight;

        elements.forEach(element => {
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
    }

    // ====================================================================
    // GESTIÓN DE SESIÓN
    // ====================================================================

    /**
     * Cierra la sesión del usuario.
     */
    window.handleLogout = async function () {
        try {
            await auth.signOut();
            sessionStorage.clear();
            window.location.href = '../index.html';
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    }

    // ====================================================================
    // GESTIÓN DE MODALES (Global)
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
    // INICIALIZACIÓN
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

        // Configurar navegación por botones
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

        // Listener de scroll en cada vista
        document.querySelectorAll('.view-section').forEach(section => {
            section.addEventListener('scroll', updateCardBorderOpacity);
        });

        // Iniciar autenticación
        setupAuthListener();
    });

})();
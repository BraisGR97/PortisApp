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

    // Estado de la navegacion - Dashboard por defecto (posicion 0 del array)
    let currentView = 'dashboard-view';
    const views = ['dashboard-view', 'calendar-view', 'chat-view', 'maintenance-view'];

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
            console.error("Configuracion de Firebase no encontrada.");
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
            console.error("Error al inicializar Firebase:", error);
        }
    }

    /**
     * Inicializa la vista correcta al cargar la aplicacion.
     */
    function initializeView() {
        // Recuperar ultima vista o usar dashboard por defecto
        // Si el usuario prefiere siempre dashboard al recargar, podemos forzarlo aqui
        // Pero mantener la ultima vista suele ser mejor UX. 
        // Dado que el usuario pidió "cargar directamente en menu principal", forzaremos dashboard si no hay historial reciente o como preferencia.
        // Para cumplir estrictamente "comienza en calendar y luego pasa...", el problema era el orden.
        // Ahora con el orden corregido, last-view funcionará bien.
        const lastView = sessionStorage.getItem('last-view') || 'dashboard-view';
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
    function updateCardBorderOpacity() {
        // Seleccionamos elementos que queremos animar
        // .card-container (borde superior del contenedor principal)
        // .dashboard-card, .user-chat-card, .maintenance-item (elementos internos)
        const elements = document.querySelectorAll('.card-container, .dashboard-card, .user-chat-card, .maintenance-item');
        const viewportHeight = window.innerHeight;

        elements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top;

            // Calculamos opacidad basada en la posición vertical
            // Cuanto más arriba (cerca de 0 o negativo), más visible el borde
            // Rango de efecto: desde 70% de la pantalla hacia arriba

            let opacity = 0;

            if (elementTop < viewportHeight * 0.8) {
                // Normalizamos la posición: 1 cuando está arriba, 0 cuando está abajo
                const normalizedPosition = 1 - (elementTop / (viewportHeight * 0.8));

                // Ajustamos la curva de opacidad
                opacity = Math.max(0, Math.min(1, normalizedPosition));

                // Aplicamos un mínimo de opacidad para que se vea sutilmente siempre si se desea, 
                // o dejamos que desaparezca completamente abajo.
                // El usuario quiere "opacity increases as the card scrolls higher".
                // Borde blanco.
            }

            // Aplicar color blanco con opacidad calculada
            // Usamos border-top-color directamente
            element.style.borderTopColor = `rgba(255, 255, 255, ${opacity})`;
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
            console.error("Error al cerrar sesion:", error);
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
        // Escuchar en window y en los contenedores con scroll interno
        window.addEventListener('scroll', updateCardBorderOpacity);
        window.addEventListener('resize', updateCardBorderOpacity);

        // Escuchar scroll en los contenedores de contenido de tarjeta
        document.querySelectorAll('.card-inner-content').forEach(container => {
            container.addEventListener('scroll', updateCardBorderOpacity);
        });

        // Iniciar autenticacion
        setupAuthListener();
    });

})();
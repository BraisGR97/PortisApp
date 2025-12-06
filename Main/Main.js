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
    // Estado de la navegacion
    let currentView = 'chat-view';
    const views = ['calendar-view', 'chat-view', 'dashboard-view', 'maintenance-view'];

    // Variables para gestos tactiles y slider animado
    let currentIndex = 1; // Sincronizado con chat-view por defecto
    let isDragging = false;
    let startPos = 0;
    let startPosY = 0;
    let isScrolling = undefined; // undefined: detecting, true: vertical, false: horizontal
    let currentTranslate = -25; // Chat view inicial
    let prevTranslate = -25;
    let animationID;
    const slider = document.getElementById('views-slider');

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

    function getPositionX(event) {
        return event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
    }

    function setSliderPosition() {
        if (slider) slider.style.transform = `translateX(${currentTranslate}%)`;
    }

    function updateNavButtons(targetViewId) {
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.target === targetViewId) {
                btn.classList.add('active');
            }
        });
    }

    function setPositionByIndex() {
        currentTranslate = currentIndex * -25;
        prevTranslate = currentTranslate;

        // Actualizar vista logica
        const viewId = views[currentIndex];
        if (viewId) {
            updateNavButtons(viewId);
            currentView = viewId;
            sessionStorage.setItem('last-view', viewId);
            initializeModuleForView(viewId);
            setTimeout(updateCardBorderOpacity, 100);
        }

        setSliderPosition();
    }

    /**
     * Cambia la vista activa de forma programática.
     */
    window.switchView = function (targetViewId) {
        const index = views.indexOf(targetViewId);
        if (index !== -1) {
            currentIndex = index;
            if (slider) slider.style.transition = 'transform 0.3s ease-out';
            setPositionByIndex();
        }
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

    function animation() {
        setSliderPosition();
        if (isDragging) requestAnimationFrame(animation);
    }

    function touchStart(event) {
        isDragging = true;
        isScrolling = undefined; // Resetear detección
        startPos = getPositionX(event);
        startPosY = event.touches[0].clientY;
        animationID = requestAnimationFrame(animation);

        if (slider) {
            slider.style.transition = 'none';
        }
    }

    function touchMove(event) {
        if (isDragging) {
            const currentPosition = getPositionX(event);
            const currentPositionY = event.touches[0].clientY;

            const diffX = Math.abs(currentPosition - startPos);
            const diffY = Math.abs(currentPositionY - startPosY);

            // Determinar dirección si aún no se sabe
            if (typeof isScrolling === 'undefined') {
                if (diffX > 5 || diffY > 5) {
                    isScrolling = diffY > diffX; // True si es vertical
                }
            }

            // Si es scroll vertical, no mover el slider
            if (isScrolling) {
                return;
            }

            const currentMove = currentPosition - startPos;

            // Convertir movimiento en px a porcentaje aproximado para el slider 400%
            const movePercent = (currentMove / window.innerWidth) * 25;
            currentTranslate = prevTranslate + movePercent;

            // Limites elasticos
            if (currentTranslate > 5) currentTranslate = 5;
            if (currentTranslate < -80) currentTranslate = -80;
        }
    }

    function touchEnd() {
        isDragging = false;
        cancelAnimationFrame(animationID);

        const movedBy = currentTranslate - prevTranslate;

        // Umbral para cambiar de vista (ej. 5% de arrastre)
        if (movedBy < -5 && currentIndex < views.length - 1) currentIndex += 1;
        else if (movedBy > 5 && currentIndex > 0) currentIndex -= 1;

        setPositionByIndex();

        if (slider) {
            slider.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
        }
    }

    /**
     * Inicializa los listeners para gestos tactiles avanzados.
     */
    function initializeSwipe() {
        const content = document.getElementById('app-content');
        if (!content) return;

        content.addEventListener('touchstart', touchStart, { passive: true });
        content.addEventListener('touchmove', touchMove, { passive: true });
        content.addEventListener('touchend', touchEnd);
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
        // 1. Sincronización Inicial
        const lastView = sessionStorage.getItem('last-view');
        if (lastView) {
            const idx = views.indexOf(lastView);
            if (idx !== -1) {
                currentIndex = idx;
                currentTranslate = idx * -25;
                prevTranslate = currentTranslate;

                if (slider) {
                    slider.style.transition = 'none';
                    slider.style.transform = `translateX(${currentTranslate}%)`;
                    // Reactivar animación
                    setTimeout(() => {
                        if (slider) slider.style.transition = 'transform 0.3s ease-out';
                    }, 50);
                }
                updateNavButtons(lastView);
            }
        }

        // Aplicar tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        // Configurar botones de acción
        setupActionButtons();

        /**
         * Configura los listeners para los botones de acción globales (Logout).
         */
        function setupActionButtons() {
            const logoutBtn = document.getElementById('logout-btn');
            const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
            const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

            if (logoutBtn) {
                // Clonar para limpiar eventos anteriores
                const newBtn = logoutBtn.cloneNode(true);
                logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);

                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.showModal('logout-confirmation-modal');
                });
            }

            if (cancelLogoutBtn) {
                cancelLogoutBtn.onclick = (e) => {
                    e.preventDefault();
                    window.closeModal('logout-confirmation-modal');
                };
            }

            if (confirmLogoutBtn) {
                confirmLogoutBtn.onclick = (e) => {
                    e.preventDefault();
                    window.closeModal('logout-confirmation-modal');
                    window.handleLogout();
                };
            }
        }

        // Configurar navegacion por botones (excluyendo logout)
        document.querySelectorAll('.nav-button').forEach(btn => {
            if (btn.id === 'logout-btn') return;
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (target) window.switchView(target);
            });
        });

        // Configurar swipe
        initializeSwipe();

        // Listeners para efectos de scroll
        window.addEventListener('scroll', updateCardBorderOpacity);
        window.addEventListener('resize', updateCardBorderOpacity);

        // FunciÃ³n para agregar listeners a los contenedores de scroll
        function attachScrollListeners() {
            document.querySelectorAll('.card-inner-content').forEach(section => {
                // Remover listener anterior si existe para evitar duplicados
                section.removeEventListener('scroll', updateCardBorderOpacity);
                section.addEventListener('scroll', updateCardBorderOpacity);
            });
        }

        // Agregar listeners inicialmente
        attachScrollListeners();

        // Re-agregar listeners cuando cambie de vista
        const observer = new MutationObserver(() => {
            attachScrollListeners();
            updateCardBorderOpacity(); // Actualizar inmediatamente
        });

        // Observar cambios en el slider de vistas
        const viewsSlider = document.getElementById('views-slider');
        if (viewsSlider) {
            observer.observe(viewsSlider, { childList: true, subtree: true });
        }

        // Iniciar autenticacion
        setupAuthListener();
    });

})();

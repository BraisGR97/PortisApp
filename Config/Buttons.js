/**
 * ====================================================================
 * Buttons.js - Centraliza la lógica de botones de Main.html
 * ====================================================================
 * Este archivo solo maneja los botones de la aplicación principal (Main.html).
 * Las funciones de autenticación están en script.js (index.html).
 * ====================================================================
 */

// ================================================================
// BOTONES DE MAIN.HTML
// ================================================================

window.AppButtons = {
    // --- NAVEGACIÓN ENTRE VISTAS ---
    'nav-home-btn': () => window.switchView('dashboard-view'),
    'nav-maintenance-btn': () => window.switchView('maintenance-view'),
    'nav-messages-btn': () => window.switchView('chat-view'),
    'nav-calendar-btn': () => window.switchView('calendar-view'),

    // --- LOGOUT ---
    'logout-btn': () => window.showModal('logout-confirmation-modal'),
    'cancel-logout-btn': () => window.closeModal('logout-confirmation-modal'),
    'confirm-logout-btn': () => {
        window.closeModal('logout-confirmation-modal');
        window.handleLogout();
    },

    // --- CALENDARIO (Delegado a CalendarActions) ---
    'prev-month-btn': () => window.CalendarActions && window.CalendarActions.prevMonth && window.CalendarActions.prevMonth(),
    'next-month-btn': () => window.CalendarActions && window.CalendarActions.nextMonth && window.CalendarActions.nextMonth(),

    // --- CHAT (Delegado a ChatActions) ---
    'send-message-btn': () => window.ChatActions && window.ChatActions.sendMessage && window.ChatActions.sendMessage(),
    'close-chat-modal-btn': () => window.ChatActions && window.ChatActions.closeChatModal && window.ChatActions.closeChatModal()
};

// ================================================================
// INICIALIZACIÓN DE BOTONES
// ================================================================

/**
 * Inicializa todos los event listeners de los botones de Main.html
 */
window.initializeButtons = function () {
    for (const [id, action] of Object.entries(window.AppButtons)) {
        const btn = document.getElementById(id);
        if (btn) {
            // Clonar el nodo para eliminar listeners anteriores
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (action) action();
            });
        }
    }
};

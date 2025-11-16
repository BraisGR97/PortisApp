// --- Configuración de Firebase (Se necesita para el logout) ---
const firebaseConfig = { 
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38",
    measurementId: "G-HQ29Y8Z2DY"
};

let IS_MOCK_MODE = !firebaseConfig.apiKey; 
let auth;

// --- CONSTANTES DEL CALENDARIO ---
const EVENT_COLORS = {
    'Horas Extra': '#FF5722',     // Rojo/Naranja
    'Guardias': '#2196F3',        // Azul
    'Festivos': '#4CAF50',        // Verde
    'Vacaciones': '#E91E63',      // Rosa
    'Nada': 'transparent'
};
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const VACATION_MAX_DAYS = 28;

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
// Guardar eventos en localStorage. El valor ahora es un objeto si hay horas extra.
/* Estructura de events:
{
    'YYYY-MM-DD': { type: '...', hours: X },
    'YYYY-MM-DD': { type: 'Vacaciones', hours: 0 }
}
*/
let events = JSON.parse(localStorage.getItem('calendarEvents')) || {}; 
let selectedDateElement = null;
let selectedDateKey = null;

// --- Funciones de Utilidad ---

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
    // 0=Dom, 1=Lun. Queremos 0=Lun
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; 
}

function saveEvents() {
    localStorage.setItem('calendarEvents', JSON.stringify(events));
    updateSummaryPanel(); // Llamar a la actualización cada vez que se guardan los eventos
}

// --- MODAL HANDLERS (GENERAL) ---

function openModal(modalId, dateKey = null) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('modal-visible'), 10);
        
        if (dateKey && modalId === 'event-modal') {
            const parts = dateKey.split('-');
            document.getElementById('modal-date-display').textContent = `Fecha: ${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('modal-visible');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

// --- MODAL: HORAS EXTRA (NUEVO) ---

function openOvertimeModal() {
    closeModal('event-modal');
    openModal('overtime-modal');
    
    // Rellenar con horas existentes si las hay
    const existingEvent = events[selectedDateKey] || {};
    const hours = existingEvent.type === 'Horas Extra' ? existingEvent.hours : 1;
    document.getElementById('overtime-input').value = hours;
}

window.saveOvertimeHours = function() {
    const input = document.getElementById('overtime-input');
    const hours = parseFloat(input.value);
    
    if (isNaN(hours) || hours <= 0) {
        alert('Por favor, introduce un número de horas válido.');
        return;
    }

    // 1. Guardar evento
    events[selectedDateKey] = {
        type: 'Horas Extra',
        hours: hours
    };
    saveEvents();

    // 2. Actualizar la celda y cerrar
    updateDayCell(selectedDateElement, selectedDateKey);
    closeModal('overtime-modal');
}

window.goBackToEventModal = function() {
    closeModal('overtime-modal');
    openModal('event-modal', selectedDateKey);
    renderModalOptions(document.getElementById('event-options-container'));
}

// --- MODAL: SELECCIÓN DE EVENTO (MODIFICADO) ---

function updateEvent(eventType, hours = 0) {
    if (!selectedDateElement || !selectedDateKey) return;

    if (eventType === 'Nada') {
        delete events[selectedDateKey];
    } else {
        events[selectedDateKey] = { 
            type: eventType,
            hours: eventType === 'Horas Extra' ? hours : 0
        };
    }
    
    saveEvents();
    updateDayCell(selectedDateElement, selectedDateKey);
    closeModal('event-modal');
}

function handleEventSelection(eventType) {
    if (eventType === 'Horas Extra') {
        openOvertimeModal();
    } else {
        updateEvent(eventType);
    }
}

function renderModalOptions(container) {
    container.innerHTML = '';
    
    const eventData = events[selectedDateKey] || { type: 'Nada', hours: 0 };
    const currentEventType = eventData.type;
    
    const allOptions = ['Nada', 'Horas Extra', 'Guardias', 'Festivos', 'Vacaciones'];

    allOptions.forEach(type => {
        const color = EVENT_COLORS[type];
        const isSelected = type === currentEventType;
        
        const button = document.createElement('button');
        button.textContent = type;
        button.className = `py-2 px-4 rounded-lg font-semibold w-full flex justify-center items-center transition-all duration-150 text-white`;
        
        if (type === 'Nada') {
            // El botón de 'Nada' elimina el evento, lo ponemos como botón de eliminar
            button.textContent = 'Eliminar Evento';
            button.style.backgroundColor = 'var(--color-bg-primary)';
            button.style.color = 'red';
            button.style.border = '1px solid red';
            button.addEventListener('click', () => updateEvent('Nada'));
        } else {
            button.style.backgroundColor = isSelected ? color : 'var(--color-bg-secondary)';
            button.style.color = isSelected ? 'var(--color-text-light)' : color;
            button.style.border = isSelected ? `2px solid ${color}` : `1px solid ${color}40`;
            button.addEventListener('click', () => handleEventSelection(type));
        }

        container.appendChild(button);
    });
}

function openEventModal(dayElement, dateKey) {
    selectedDateElement = dayElement;
    selectedDateKey = dateKey;
    
    renderModalOptions(document.getElementById('event-options-container'));
    openModal('event-modal', dateKey);
}

// --- CALENDAR RENDERING Y VISTAS ---

function updateDayCell(dayCell, dateKey) {
    const eventData = events[dateKey] || { type: 'Nada', hours: 0 };
    const type = eventData.type;
    const color = EVENT_COLORS[type] || EVENT_COLORS['Nada'];
    
    dayCell.style.backgroundColor = type !== 'Nada' ? `${color}40` : EVENT_COLORS['Nada'];
    dayCell.dataset.eventType = type;

    // Actualizar indicador
    let existingIndicator = dayCell.querySelector('.event-indicator');
    if (existingIndicator) existingIndicator.remove();

    if (type !== 'Nada') {
        const indicator = document.createElement('span');
        // El CSS ahora manejará el estilo del punto/círculo (clase 'event-indicator absolute')
        indicator.className = 'event-indicator absolute'; 
        indicator.style.backgroundColor = color;
        
        dayCell.appendChild(indicator);
    }
}

function renderCalendar() {
    const monthDisplay = document.getElementById('current-month-display');
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid || !monthDisplay) return;

    monthDisplay.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    calendarGrid.innerHTML = '';
    
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 1. Días vacíos de relleno
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty-day text-sm opacity-50 cursor-default';
        calendarGrid.appendChild(emptyCell);
    }

    // 2. Días del mes actual
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell relative flex items-center justify-center aspect-square rounded-lg p-1 transition-colors duration-200 cursor-pointer text-base font-semibold';
        dayCell.textContent = day;
        dayCell.dataset.dateKey = dateKey;
        
        if (dateKey === todayKey) {
            dayCell.classList.add('is-today');
        }

        updateDayCell(dayCell, dateKey);

        dayCell.addEventListener('click', () => openEventModal(dayCell, dateKey));
        calendarGrid.appendChild(dayCell);
    }
    updateSummaryPanel();
}

function setupCalendarNavigation() {
    const prevBtn = document.getElementById('prev-month-btn');
    const nextBtn = document.getElementById('next-month-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });
    }
}

function showView(viewId) {
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'none';

    const view = document.getElementById(viewId);
    if (view) {
        view.style.display = viewId === 'dashboard-view' ? 'grid' : 'flex';
    }
}

// --- CÁLCULOS DEL RESUMEN (LEYENDA) ---

function calculateMonthlyOvertime(year, month) {
    let totalHours = 0;
    const targetMonth = String(month + 1).padStart(2, '0');
    
    for (const dateKey in events) {
        if (dateKey.startsWith(`${year}-${targetMonth}`)) {
            const event = events[dateKey];
            if (event.type === 'Horas Extra' && typeof event.hours === 'number') {
                totalHours += event.hours;
            }
        }
    }
    return totalHours.toFixed(1);
}

function calculateYearlyShifts(year) {
    let shiftCount = 0;
    let inShiftBlock = false;
    
    // Obtener todas las claves de evento del año
    const yearKeys = Object.keys(events).filter(key => key.startsWith(`${year}-`)).sort();

    for (const dateKey of yearKeys) {
        const event = events[dateKey];
        const isShift = event.type === 'Guardias';
        
        if (isShift) {
            if (!inShiftBlock) {
                shiftCount++;
                inShiftBlock = true;
            }
        } else {
            // Reiniciar el bloque si el evento es diferente o 'Nada'
            inShiftBlock = false;
        }
    }
    return shiftCount;
}

function calculateYearlyHolidays(year) {
    let totalDays = 0;
    for (const dateKey in events) {
        if (dateKey.startsWith(`${year}-`)) {
            if (events[dateKey].type === 'Festivos') {
                totalDays++;
            }
        }
    }
    return totalDays;
}

function calculateYearlyVacations(year) {
    let usedDays = 0;
    for (const dateKey in events) {
        if (dateKey.startsWith(`${year}-`)) {
            if (events[dateKey].type === 'Vacaciones') {
                usedDays++;
            }
        }
    }
    return Math.max(0, VACATION_MAX_DAYS - usedDays);
}

function updateSummaryPanel() {
    // Si no tienes el elemento, sal de la función
    const summaryYearElement = document.getElementById('summary-year');
    if (summaryYearElement) {
        summaryYearElement.textContent = currentYear;
    }

    // 1. Horas Extra (Mensual)
    const monthlyHours = calculateMonthlyOvertime(currentYear, currentMonth);
    const summaryOvertime = document.getElementById('summary-overtime');
    if (summaryOvertime) summaryOvertime.textContent = `${monthlyHours} h`;

    // 2. Guardias (Anual - Bloques)
    const yearlyShifts = calculateYearlyShifts(currentYear);
    const summaryShifts = document.getElementById('summary-shifts');
    if (summaryShifts) summaryShifts.textContent = `${yearlyShifts}`;

    // 3. Festivos (Anual)
    const yearlyHolidays = calculateYearlyHolidays(currentYear);
    const summaryHolidays = document.getElementById('summary-holidays');
    if (summaryHolidays) summaryHolidays.textContent = `${yearlyHolidays}`;

    // 4. Vacaciones (Anual - Restantes)
    const remainingVacations = calculateYearlyVacations(currentYear);
    const summaryVacations = document.getElementById('summary-vacations');
    if (summaryVacations) summaryVacations.textContent = `${remainingVacations} días`;
}


// --- FUNCIONES DE SISTEMA ---

function initializeFirebase() {
    if (!IS_MOCK_MODE && typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
    }
}

function showAppMessage(displayName) {
    const appMessage = document.getElementById('app-message');
    if (!appMessage) return;
    const finalDisplayName = displayName || 'Invitado';
    const message = `Bienvenido, ${finalDisplayName}.`;
    appMessage.textContent = message;
    appMessage.style.display = 'block';
    setTimeout(() => appMessage.style.display = 'none', 3000); 
}

function handleAuthAndDisplay() {
    const currentUserDisplay = document.getElementById('current-user-display');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    if (userDisplayName === 'Admin') IS_MOCK_MODE = true;
    
    const display = userDisplayName || 'Invitado';
    currentUserDisplay.textContent = display;
    showAppMessage(display);
}

function setupScrollListener() {
    const scrollableContent = document.getElementById('scrollable-content');
    const topNavbar = document.getElementById('top-navbar');
    if (scrollableContent && topNavbar) {
        let lastScrollY = scrollableContent.scrollTop;
        scrollableContent.addEventListener('scroll', () => {
            const currentScrollY = scrollableContent.scrollTop;
            if (currentScrollY > lastScrollY && currentScrollY > 50) {
                topNavbar.style.transform = 'translateY(-100%)';
            } else if (currentScrollY < lastScrollY || currentScrollY === 0) {
                topNavbar.style.transform = 'translateY(0)';
            }
            lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
        });
    }
    if (topNavbar) topNavbar.style.transform = 'translateY(0)';
}

function setupLogoutModal() {
    const showLogoutModalBtn = document.getElementById('show-logout-modal-btn');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

    if (showLogoutModalBtn) showLogoutModalBtn.addEventListener('click', () => openModal('logout-confirmation-modal'));
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener('click', () => closeModal('logout-confirmation-modal'));
    
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', async () => {
            closeModal('logout-confirmation-modal');
            sessionStorage.removeItem('portis-user-display-name');
            if (!IS_MOCK_MODE && auth) {
                try {
                    await auth.signOut();
                } catch (error) {
                    console.error("Error al cerrar sesión en Firebase:", error);
                }
            }
            // Redirigir al login o recargar, si aplica
        });
    }
}

// ----------------------------------------------------------------------
// 🚨 CAMBIO APLICADO AQUÍ: Nueva función para manejar la navegación a Repairs
// ----------------------------------------------------------------------
function setupNavigation() {
    const navMantenimientosBtn = document.getElementById('nav-mantenimientos-btn');
    const navHomeBtn = document.getElementById('nav-home-btn');
    const navCalendarBtn = document.getElementById('nav-calendar-btn');

    // Navegación a Mantenimientos (Repairs.html)
    if (navMantenimientosBtn) {
        navMantenimientosBtn.addEventListener('click', () => {
            // Redirige al nuevo módulo de reparaciones
            window.location.href = '../Repairs/Repairs.html';
        });
    }

    // Navegación a Home (Dashboard)
    if (navHomeBtn) {
        navHomeBtn.addEventListener('click', () => {
            // Mantiene el mismo archivo, solo cambia la vista
            showView('dashboard-view');
            // Actualizar estado activo en el footer
            document.querySelectorAll('.nav-icon-btn').forEach(btn => btn.classList.remove('active'));
            navHomeBtn.classList.add('active');
        });
    }

    // Navegación a Calendario
    if (navCalendarBtn) {
        navCalendarBtn.addEventListener('click', () => {
            showView('calendar-view');
            // Actualizar estado activo en el footer
            document.querySelectorAll('.nav-icon-btn').forEach(btn => btn.classList.remove('active'));
            navCalendarBtn.classList.add('active');
        });
    }

    // Asegurarse de que el botón de inicio sea el activo al cargar.
    navHomeBtn.classList.add('active');
}
// ----------------------------------------------------------------------

// --- INICIALIZACIÓN ---

window.onload = function() {
    // 1. Inicializa Firebase (si no está inicializado)
    initializeFirebase();

    // 2. Configura los listeners del sistema
    setupLogoutModal();
    setupScrollListener();
    setupCalendarNavigation();
    
    // 3. Configura los listeners de navegación del footer
    setupNavigation(); 
    
    // 4. Muestra el nombre de usuario
    handleAuthAndDisplay();

    // 5. Renderiza la vista inicial
    showView('dashboard-view');
    renderCalendar();
};
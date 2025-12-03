// ===================================================================================
// Calendar.js - Lógica del Calendario
// ===================================================================================

// Se asume que Firebase (compatibilidad) está disponible globalmente desde los scripts CDN de Main.html
// Se asume que window.firebaseReadyPromise, window.db, y window.auth serán establecidos por Main.js.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito y evitar conflictos de declaración.

    // =======================================================
    // 1. VARIABLES LOCALES Y CONFIGURACIÓN (Lectura de window)
    // =======================================================

    // 🔑 CLAVE: Leer el UID del usuario desde sessionStorage (gestionado por Main.js)
    const userId = sessionStorage.getItem('portis-user-identifier') || null;

    var calendarEvents = {}; // Clave: fechaString (YYYY-MM-DD), Valor: EventoData
    var isFirebaseReady = false;

    let currentCalendarDate = new Date();
    let selectedDateForEvent = null;

    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const ANNUAL_VACATION_QUOTA = 28; // El cupo anual de días de vacaciones

    // --- [Funciones Auxiliares] ---

    // Usaremos la función global showAppMessage de config.js
    function showMessage(type, message) {
        if (typeof window.showAppMessage === 'function') {
            window.showAppMessage(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] Notificación: ${message}`);
        }
    }

    // =======================================================
    // 2. CONFIGURACIÓN FIREBASE Y LISTENERS
    // =======================================================

    /**
     * Inicializa el listener de Firestore, ESPERANDO a que Main.js inicialice Firebase.
     */
    async function setupFirebaseAndListeners() {
        // 1. Esperar la señal de Firebase Ready (CRÍTICO)
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            console.log("Calendar.js: Esperando señal de Firebase Ready...");
            await window.firebaseReadyPromise;
        } else {
            console.error("Calendar.js: Error. window.firebaseReadyPromise no encontrado.");
            return;
        }

        // 2. Verificar estado después de la espera
        if (!userId || typeof window.db === 'undefined' || window.db === null) {
            console.error("Calendar.js: Error. No hay ID de usuario o DB no está disponible después de la promesa.");
            showMessage('error', 'Error de sesión. Intente iniciar sesión nuevamente.');
            return;
        }

        // 3. Iniciar Listener
        isFirebaseReady = true;
        console.log(`Calendar.js: Conexión con Firestore (window.db) establecida. User ID: ${userId}`);
        setupEventsListener();
    }


    /**
     * Obtiene la referencia a la colección de eventos
     * con la ruta simplificada: users/{userId}/calendar
     */
    function getEventsCollectionRef() {
        // Aseguramos que DB esté inicializada y que haya un ID de usuario válido
        if (typeof window.db === 'undefined' || !userId || !isFirebaseReady) return null;

        // Nueva ruta simplificada
        const path = `users/${userId}/calendar`;

        return window.db.collection(path);
    }

    function setupEventsListener() {
        if (!isFirebaseReady) return;

        const eventsQuery = getEventsCollectionRef();
        if (!eventsQuery) return;

        // Escuchar solo los eventos del usuario actual
        eventsQuery.onSnapshot((snapshot) => {
            const newEvents = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                // La fecha del documento es el ID (YYYY-MM-DD)
                newEvents[doc.id] = data;
            });

            calendarEvents = newEvents;
            renderCalendar();
            updateSummary();
        }, (error) => {
            console.error("Error al escuchar eventos de calendario:", error);
            showMessage('error', 'Error de conexión con el calendario.');
        });
    }

    // =======================================================
    // 3. LÓGICA DE CALENDARIO (Renderizado y Navegación)
    // =======================================================

    function initCalendar() {
        renderCalendar();
        updateSummary();
        setupFirebaseAndListeners(); // Iniciar conexión
    }

    // Exponer initCalendar globalmente
    window.initCalendar = initCalendar;

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthDisplay = document.getElementById('current-month-display');

        if (!grid || !monthDisplay) return;

        grid.innerHTML = '';
        monthDisplay.textContent = `${months[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;

        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Ajustar día de la semana (0 = Domingo, 1 = Lunes, ..., 6 = Sábado)
        // Queremos que la semana empiece en Lunes (0 = Lunes, ..., 6 = Domingo)
        let startDay = firstDayOfMonth.getDay() - 1;
        if (startDay === -1) startDay = 6;

        const today = new Date();

        // Días vacíos previos
        for (let i = 0; i < startDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            grid.appendChild(emptyDay);
        }

        // Días del mes
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateString = formatDate(date);
            const dayEl = document.createElement('div');

            // Clase base
            dayEl.className = 'calendar-day';

            // Verificar si es hoy
            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayEl.classList.add('today');
            }

            // Verificar fin de semana
            const dayOfWeek = date.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            if (isWeekend) {
                dayEl.classList.add('weekend');
            }

            // Verificar eventos
            const eventData = calendarEvents[dateString];
            let eventIndicator = '';
            let weekendTextColor = isWeekend ? 'text-accent-magenta' : '';

            if (eventData) {
                // Si la fecha esta en el calendario pero NO es fin de semana, el texto es blanco
                // Si ES fin de semana, mantenemos el color magenta (ya aplicado por la clase .weekend)
                if (!isWeekend) {
                    weekendTextColor = 'text-white';
                }

                if (eventData.type === 'overtime') {
                    dayEl.classList.add('bg-orange-100', 'dark:bg-orange-900/30', 'border-orange-500');
                    eventIndicator = `<div class="event-dot overtime"></div>`;
                } else if (eventData.type === 'shift') {
                    dayEl.classList.add('bg-blue-100', 'dark:bg-blue-900/30', 'border-blue-500');
                    eventIndicator = `<div class="event-dot shift"></div>`;
                } else if (eventData.type === 'holiday') {
                    dayEl.classList.add('bg-green-100', 'dark:bg-green-900/30', 'border-green-500');
                    eventIndicator = `<div class="event-dot holiday"></div>`;
                } else if (eventData.type === 'vacation') {
                    dayEl.classList.add('bg-purple-100', 'dark:bg-purple-900/30', 'border-purple-500');
                    eventIndicator = `<div class="event-dot vacation"></div>`;
                }
            }

            dayEl.innerHTML = `
                <span class="${weekendTextColor}">${day}</span>
                ${eventIndicator}
            `;

            dayEl.onclick = () => openEventModal(dateString);
            grid.appendChild(dayEl);
        }
    }

    function formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Navegación de meses
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
        updateSummary();
    });

    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
        updateSummary();
    });

    // =======================================================
    // 4. GESTIÓN DE EVENTOS (Modales y Guardado)
    // =======================================================

    function openEventModal(dateString) {
        selectedDateForEvent = dateString;
        const eventData = calendarEvents[dateString];

        // Crear modal dinámicamente si no existe
        let modal = document.getElementById('calendar-event-modal');
        if (!modal) {
            const modalHtml = `
                <div id="calendar-event-modal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-70 flex justify-center items-center p-4 transition-opacity duration-300 modal-backdrop">
                    <div class="modal-content w-full max-w-sm rounded-xl p-6 relative">
                        <button id="close-event-modal" class="absolute top-4 right-4 text-gray-400 hover:text-white">
                            <i class="ph ph-x text-xl"></i>
                        </button>
                        <h3 id="event-modal-date" class="text-xl font-bold mb-4 text-center"></h3>
                        
                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <button class="event-type-btn p-3 rounded-lg border border-gray-600 flex flex-col items-center gap-2 hover:bg-gray-700 transition-colors" data-type="overtime">
                                <div class="w-3 h-3 rounded-full bg-orange-500"></div>
                                <span class="text-xs font-bold">Hora Extra</span>
                            </button>
                            <button class="event-type-btn p-3 rounded-lg border border-gray-600 flex flex-col items-center gap-2 hover:bg-gray-700 transition-colors" data-type="shift">
                                <div class="w-3 h-3 rounded-full bg-blue-500"></div>
                                <span class="text-xs font-bold">Guardia</span>
                            </button>
                            <button class="event-type-btn p-3 rounded-lg border border-gray-600 flex flex-col items-center gap-2 hover:bg-gray-700 transition-colors" data-type="holiday">
                                <div class="w-3 h-3 rounded-full bg-green-500"></div>
                                <span class="text-xs font-bold">Festivo</span>
                            </button>
                            <button class="event-type-btn p-3 rounded-lg border border-gray-600 flex flex-col items-center gap-2 hover:bg-gray-700 transition-colors" data-type="vacation">
                                <div class="w-3 h-3 rounded-full bg-purple-500"></div>
                                <span class="text-xs font-bold">Vacaciones</span>
                            </button>
                        </div>

                        <div id="event-details-input" class="hidden space-y-3">
                            <label class="block text-sm font-medium text-gray-400">Cantidad / Detalle</label>
                            <input type="number" id="event-value" class="minimal-input w-full" placeholder="Ej: 2 (horas)">
                            <button id="save-event-btn" class="primary-btn w-full py-2 rounded-lg mt-2">Guardar</button>
                        </div>

                        <button id="delete-event-btn" class="hidden w-full py-2 rounded-lg mt-2 text-red-500 border border-red-500 hover:bg-red-900/20 transition-colors">
                            Eliminar Evento
                        </button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('calendar-event-modal');

            // Listeners del modal
            document.getElementById('close-event-modal').onclick = closeEventModal;
            document.getElementById('save-event-btn').onclick = saveEvent;
            document.getElementById('delete-event-btn').onclick = deleteEvent;

            document.querySelectorAll('.event-type-btn').forEach(btn => {
                btn.onclick = (e) => {
                    // Resetear selección
                    document.querySelectorAll('.event-type-btn').forEach(b => b.classList.remove('bg-gray-700', 'border-accent-magenta'));

                    // Seleccionar actual
                    const target = e.currentTarget;
                    target.classList.add('bg-gray-700', 'border-accent-magenta');

                    const type = target.dataset.type;
                    const inputContainer = document.getElementById('event-details-input');
                    const input = document.getElementById('event-value');

                    inputContainer.classList.remove('hidden');
                    input.value = ''; // Reset valor

                    if (type === 'overtime') {
                        input.placeholder = 'Horas (Ej: 2)';
                        input.type = 'number';
                    } else {
                        input.placeholder = 'Opcional: Nota';
                        input.type = 'text';
                    }

                    // Guardar tipo seleccionado temporalmente en el botón de guardar
                    document.getElementById('save-event-btn').dataset.selectedType = type;
                };
            });
        }

        // Configurar contenido del modal
        const dateObj = new Date(dateString);
        document.getElementById('event-modal-date').textContent = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

        // Resetear estado visual
        document.querySelectorAll('.event-type-btn').forEach(b => b.classList.remove('bg-gray-700', 'border-accent-magenta'));
        document.getElementById('event-details-input').classList.add('hidden');
        const deleteBtn = document.getElementById('delete-event-btn');

        if (eventData) {
            // Si ya hay evento, preseleccionar
            const typeBtn = document.querySelector(`.event-type-btn[data-type="${eventData.type}"]`);
            if (typeBtn) {
                typeBtn.click(); // Simular click para activar lógica visual
                document.getElementById('event-value').value = eventData.value || '';
            }
            deleteBtn.classList.remove('hidden');
        } else {
            deleteBtn.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeEventModal() {
        const modal = document.getElementById('calendar-event-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async function saveEvent() {
        const type = document.getElementById('save-event-btn').dataset.selectedType;
        const value = document.getElementById('event-value').value;

        if (!type || !selectedDateForEvent) return;

        const eventData = {
            type: type,
            value: value,
            date: selectedDateForEvent
        };

        try {
            if (!isFirebaseReady) throw new Error("Firebase no está listo");

            const eventsRef = getEventsCollectionRef();
            // Usar la fecha como ID del documento para evitar duplicados y facilitar lectura
            await eventsRef.doc(selectedDateForEvent).set(eventData);

            showMessage('success', 'Evento guardado.');
            closeEventModal();

        } catch (error) {
            console.error("Error al guardar evento:", error);
            showMessage('error', 'Error al guardar.');
        }
    }

    async function deleteEvent() {
        if (!selectedDateForEvent) return;

        try {
            if (!isFirebaseReady) throw new Error("Firebase no está listo");

            const eventsRef = getEventsCollectionRef();
            await eventsRef.doc(selectedDateForEvent).delete();

            showMessage('success', 'Evento eliminado.');
            closeEventModal();

        } catch (error) {
            console.error("Error al eliminar evento:", error);
            showMessage('error', 'Error al eliminar.');
        }
    }

    // =======================================================
    // 5. RESUMEN Y ESTADÍSTICAS
    // =======================================================

    function updateSummary() {
        let overtime = 0;
        let shifts = 0;
        let holidays = 0;
        let vacationUsed = 0;

        const currentMonth = currentCalendarDate.getMonth();
        const currentYear = currentCalendarDate.getFullYear();

        // Iterar sobre todos los eventos cargados
        Object.values(calendarEvents).forEach(event => {
            const eventDate = new Date(event.date);

            // Filtrar por mes y año actual para el resumen mensual
            if (eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear) {
                if (event.type === 'overtime') {
                    overtime += parseFloat(event.value || 0);
                } else if (event.type === 'shift') {
                    shifts++;
                } else if (event.type === 'holiday') {
                    holidays++;
                }
            }

            // Vacaciones se cuentan anualmente
            if (event.type === 'vacation' && eventDate.getFullYear() === currentYear) {
                vacationUsed++;
            }
        });

        // Actualizar UI
        document.getElementById('summary-overtime').textContent = `${overtime} h`;
        document.getElementById('summary-shifts-number').textContent = shifts;
        document.getElementById('summary-holidays-number').textContent = holidays;

        // Actualizar cupo de vacaciones
        const remainingVacation = ANNUAL_VACATION_QUOTA - vacationUsed;
        const vacationEl = document.getElementById('summary-vacation-quota');
        vacationEl.textContent = `${remainingVacation} días`;

        if (remainingVacation < 0) {
            vacationEl.classList.add('text-red-500');
        } else {
            vacationEl.classList.remove('text-red-500');
        }
    }

})();

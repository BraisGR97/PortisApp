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
            // console.log(`[${type.toUpperCase()}] Notificación: ${message}`);
        }
    }

    // =======================================================
    // 2. CONFIGURACIÓN FIREBASE Y LISTENERS
    // =======================================================

    /**
     * Inicializa el listener de Firestore, ESPERANDO a que Main.js inicialice Firebase.
     */
    async function setupFirebaseAndListeners() {
        // 2. Esperar la señal de Firebase Ready (CRÍTICO)
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            await window.firebaseReadyPromise;
        } else {
            return;
        }

        // 3. Verificar estado después de la espera
        if (!userId || typeof window.db === 'undefined' || window.db === null) {
            showMessage('error', 'Error de sesión. Intente iniciar sesión nuevamente.');
            return;
        }

        // 4. Iniciar Listener
        isFirebaseReady = true;
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
                newEvents[data.date] = { ...data, id: doc.id };
            });

            calendarEvents = newEvents;

            renderCalendar();
            updateSummary();
            updateHolidayQuota();

        }, (error) => {
            showMessage('error', 'Error al cargar eventos.');
        });
    }

    /**
     * Guarda o actualiza un evento en Firestore.
     */
    async function saveEventToFirestore(dateStr, eventType, hours = null) {

        if (!isFirebaseReady || !window.db || !userId) {
            showMessage('error', 'El sistema de base de datos no está listo. Inténtelo de nuevo.');
            return;
        }

        const eventData = {
            date: dateStr,
            type: eventType,
            // Aseguramos que firebase.firestore.FieldValue esté disponible
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            hours: hours ? parseFloat(hours) : null,
        };

        try {
            await getEventsCollectionRef().add(eventData);
            showMessage('success', `Evento de ${eventType} guardado exitosamente.`);
        } catch (error) {
            showMessage('error', 'Error al guardar el evento en la base de datos.');
        }
    }

    // --- FUNCIÓN: Eliminar Evento ---
    async function deleteEventFromFirestore(dateStr) {
        const event = calendarEvents[dateStr];

        if (!event) {
            showMessage('error', 'No hay evento registrado para esta fecha.');
            return;
        }

        // 🔑 Uso de closeModal global
        if (typeof window.closeModal === 'function') window.closeModal('event-modal');

        if (!isFirebaseReady || !window.db || !userId) {
            showMessage('error', 'El sistema de base de datos no está listo. Inténtelo de nuevo.');
            return;
        }

        if (event.id) {
            try {
                // Eliminamos el documento por su ID dentro de la subcolección
                await getEventsCollectionRef().doc(event.id).delete();
                showMessage('success', `Evento del ${dateStr} eliminado exitosamente.`);
            } catch (error) {
                showMessage('error', 'Error al eliminar el evento en la base de datos.');
            }
        }
    }
    // Hacemos la función global para que sea llamada desde el HTML
    window.deleteEvent = deleteEventFromFirestore;

    // =======================================================
    // 3. FESTIVOS NACIONALES DE ESPAÑA
    // =======================================================

    /**
     * Calcula la fecha de Pascua usando el algoritmo de Meeus/Jones/Butcher
     */
    function calculateEaster(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;

        return new Date(year, month - 1, day);
    }

    /**
     * Calcula todos los festivos de Semana Santa basándose en la Pascua
     */
    function getEasterHolidays(year) {
        const easter = calculateEaster(year);
        const holidays = [];

        // Jueves Santo (3 días antes de Pascua)
        const jueveSanto = new Date(easter);
        jueveSanto.setDate(easter.getDate() - 3);
        holidays.push({ date: jueveSanto, name: 'Jueves Santo' });

        // Viernes Santo (2 días antes de Pascua)
        const viernesSanto = new Date(easter);
        viernesSanto.setDate(easter.getDate() - 2);
        holidays.push({ date: viernesSanto, name: 'Viernes Santo' });

        // Lunes de Pascua (1 día después de Pascua) - Solo algunas comunidades
        const lunesPascua = new Date(easter);
        lunesPascua.setDate(easter.getDate() + 1);
        holidays.push({ date: lunesPascua, name: 'Lunes de Pascua', regional: ['cataluna', 'valencia', 'baleares', 'navarra', 'pais-vasco', 'rioja'] });

        return holidays;
    }

    /**
     * Festivos autonómicos por comunidad autónoma
     */
    const REGIONAL_HOLIDAYS = {
        'andalucia': [
            { month: 2, day: 28 }, // Día de Andalucía
        ],
        'aragon': [
            { month: 4, day: 23 }, // San Jorge (Día de Aragón)
        ],
        'asturias': [
            { month: 9, day: 8 }, // Día de Asturias
        ],
        'baleares': [
            { month: 3, day: 1 }, // Día de las Islas Baleares
        ],
        'canarias': [
            { month: 5, day: 30 }, // Día de Canarias
        ],
        'cantabria': [
            { month: 7, day: 28 }, // Día de las Instituciones de Cantabria
        ],
        'castilla-leon': [
            { month: 4, day: 23 }, // Día de Castilla y León
        ],
        'castilla-mancha': [
            { month: 5, day: 31 }, // Día de Castilla-La Mancha
        ],
        'cataluna': [
            { month: 6, day: 24 }, // San Juan
            { month: 9, day: 11 }, // Diada de Catalunya
            { month: 12, day: 26 }, // San Esteban
        ],
        'valencia': [
            { month: 10, day: 9 }, // Día de la Comunidad Valenciana
        ],
        'extremadura': [
            { month: 9, day: 8 }, // Día de Extremadura
        ],
        'galicia': [
            { month: 5, day: 17 }, // Día de las letras Gallegas
            { month: 7, day: 25 }, // Día de Galicia
        ],
        'madrid': [
            { month: 5, day: 2 }, // Fiesta de la Comunidad de Madrid
        ],
        'murcia': [
            { month: 6, day: 9 }, // Día de la Región de Murcia
        ],
        'navarra': [
        ],
        'pais-vasco': [
        ],
        'rioja': [
            { month: 6, day: 9 }, // Día de La Rioja
        ],
        'ceuta': [
            { month: 9, day: 2 }, // Día de Ceuta
        ],
        'melilla': [
            { month: 9, day: 17 }, // Día de Melilla
        ]
    };

    /**
     * Determina si una fecha es un festivo autonómico según la ubicación del usuario
     */
    function isRegionalHoliday(date, location) {
        if (!location || location === 'nacional') return false;

        const month = date.getMonth() + 1;
        const day = date.getDate();
        const year = date.getFullYear();

        // Verificar festivos fijos de la comunidad
        const regionalHolidays = REGIONAL_HOLIDAYS[location] || [];
        for (const holiday of regionalHolidays) {
            if (month === holiday.month && day === holiday.day) {
                return true;
            }
        }

        // Verificar festivos de Semana Santa regionales
        const easterHolidays = getEasterHolidays(year);
        for (const holiday of easterHolidays) {
            if (holiday.regional && holiday.regional.includes(location)) {
                if (date.toDateString() === holiday.date.toDateString()) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Función principal que determina si una fecha es festivo (nacional o autonómico)
     */
    function isHoliday(date) {
        const location = localStorage.getItem('portis-location') || 'nacional';

        // Primero verificar festivos nacionales
        if (isSpanishNationalHoliday(date)) {
            return true;
        }

        // Luego verificar Semana Santa (Jueves y Viernes Santo son nacionales)
        const year = date.getFullYear();
        const easterHolidays = getEasterHolidays(year);
        for (const holiday of easterHolidays) {
            if (!holiday.regional) { // Solo festivos nacionales de Semana Santa
                if (date.toDateString() === holiday.date.toDateString()) {
                    return true;
                }
            }
        }

        // Finalmente verificar festivos autonómicos
        if (isRegionalHoliday(date, location)) {
            return true;
        }

        return false;
    }
    function isSpanishNationalHoliday(date) {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const year = date.getFullYear();

        const fixedHolidays = [
            { month: 1, day: 1 },   // Año Nuevo
            { month: 1, day: 6 },   // Reyes Magos
            { month: 5, day: 1 },   // Día del Trabajador
            { month: 8, day: 15 },  // Asunción de la Virgen
            { month: 10, day: 12 }, // Fiesta Nacional de España
            { month: 11, day: 1 },  // Todos los Santos
            { month: 12, day: 6 },  // Día de la Constitución
            { month: 12, day: 8 },  // Inmaculada Concepción
            { month: 12, day: 25 }, // Navidad
        ];

        for (const holiday of fixedHolidays) {
            if (month === holiday.month && day === holiday.day) {
                return true;
            }
        }

        const easterDate = calculateEaster(year);
        const goodFriday = new Date(easterDate);
        goodFriday.setDate(easterDate.getDate() - 2);

        if (date.toDateString() === goodFriday.toDateString()) {
            return true;
        }

        return false;
    }
    // =======================================================
    // 3. LÓGICA DEL CALENDARIO (RENDERIZADO)
    // =======================================================

    function renderCalendar() {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        const monthDisplay = document.getElementById('current-month-display');
        const yearSummary = document.getElementById('summary-year');

        if (monthDisplay) monthDisplay.textContent = `${months[month]} ${year}`;
        if (yearSummary) yearSummary.textContent = year;

        const calendarGrid = document.getElementById('calendar-grid');
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';

        const weekDaysContainer = document.getElementById('calendar-week-days');
        if (weekDaysContainer) {
            const days = weekDaysContainer.children;
            for (let i = 0; i < days.length; i++) {
                days[i].classList.remove('text-accent-magenta');
                if (i === 5 || i === 6) {
                    days[i].classList.add('text-accent-magenta');
                }
            }
        }

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const startDay = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;

        for (let i = 0; i < startDay; i++) {
            calendarGrid.innerHTML += `<div class="p-2 text-xs opacity-30"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const monthString = (month + 1).toString().padStart(2, '0');
            const dayString = day.toString().padStart(2, '0');
            const fullDate = `${year}-${monthString}-${dayString}`;

            const todayDate = new Date();
            const currentDate = new Date(year, month, day);
            const isToday = todayDate.toDateString() === currentDate.toDateString();
            const todayClass = isToday ? 'border-2 border-dashed border-red-500' : '';

            const dayOfWeek = currentDate.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            let weekendTextColor = isWeekend ? 'text-accent-magenta' : '';

            // === LÓGICA DE EVENTOS ===
            let eventData = calendarEvents[fullDate];
            // 🆕 Verificar si es festivo nacional (si no hay evento ya registrado)
            if (!eventData && isHoliday(currentDate)) {
                eventData = { type: 'Festivo', date: fullDate, isNational: true };
            }
            let eventDisplayClass = '';
            let eventTypeTag = ''; // Será el contenido de la etiqueta del día

            if (eventData) {
                // Si la fecha está en el calendario, el texto es blanco
                weekendTextColor = 'text-white';

                if (eventData.type === 'Extra') {
                    eventDisplayClass = 'bg-orange-600/50 hover:bg-orange-700/70 border-l-4 border-orange-600';
                    // 🔑 MODIFICACIÓN 1: Mostrar SOLO las horas
                    eventTypeTag = `<span class="text-xs font-medium text-orange-200 block leading-tight">${eventData.hours}h</span>`;
                } else if (eventData.type === 'Guardia') {
                    eventDisplayClass = 'bg-blue-600/50 hover:bg-blue-700/70 border-l-4 border-blue-600';
                    // 🔑 MODIFICACIÓN 2: Etiqueta vacía
                    eventTypeTag = `<span class="text-xs font-medium text-blue-200 block leading-tight"></span>`;
                } else if (eventData.type === 'Vacaciones') {
                    eventDisplayClass = 'bg-purple-600/50 hover:bg-purple-700/70 border-l-4 border-purple-600';
                    // 🔑 MODIFICACIÓN 3: Etiqueta vacía
                    eventTypeTag = `<span class="text-xs font-medium text-purple-200 block leading-tight"></span>`;
                } else if (eventData.type === 'Festivo') {
                    eventDisplayClass = 'bg-green-600/50 hover:bg-green-700/70 border-l-4 border-green-600';
                    // 🔑 MODIFICACIÓN 4: Etiqueta vacía
                    eventTypeTag = `<span class="text-xs font-medium text-green-200 block leading-tight"></span>`;
                }
            }
            // =========================

            calendarGrid.innerHTML += `
                <div class="calendar-day p-2 rounded-lg text-center cursor-pointer transition h-14 flex flex-col items-center justify-start 
                    ${todayClass} ${eventDisplayClass || 'hover:bg-white/10 dark:hover:bg-black/10'}" 
                    data-date="${fullDate}" 
                    onclick="window.openEventModal('${fullDate}')">
                    <span class="text-sm font-semibold block ${weekendTextColor}">${day}</span> 
                    ${eventTypeTag}
                </div>
            `;
        }
    }


    // =======================================================
    // 4. LÓGICA DE MODALES Y EVENTOS Y RESUMEN (CRÍTICO)
    // =======================================================

    /**
     * 🔑 FUNCIÓN CRÍTICA: Cuenta los bloques de guardias,
     * donde los días consecutivos solo cuentan como 1.
     * @param {object} allEvents - Objeto calendarEvents completo.
     * @param {number} year - Año para el que se realiza el conteo.
     * @returns {number} Número de bloques de guardias.
     */
    function countConsecutiveShifts(allEvents, year) {
        // 1. Obtener y filtrar solo las fechas de 'Guardia' del año objetivo
        const shiftDates = Object.keys(allEvents)
            .filter(dateStr => {
                const data = allEvents[dateStr];
                // Filtra por tipo 'Guardia' y por el año actual
                return data.type === 'Guardia' && dateStr.startsWith(year.toString());
            })
            .sort(); // 2. Ordenar las fechas cronológicamente (YYYY-MM-DD lo permite)

        if (shiftDates.length === 0) {
            return 0;
        }

        let shiftBlockCount = 0;
        let previousDate = null;

        // 3. Iterar y contar bloques
        for (const currentDateStr of shiftDates) {

            if (!previousDate) {
                // Primera guardia del año o del conjunto siempre cuenta
                shiftBlockCount++;
            } else {
                const currentDate = new Date(currentDateStr + 'T00:00:00');
                const prevDateObj = new Date(previousDate + 'T00:00:00');

                // Calcular la diferencia en días
                const diffTime = Math.abs(currentDate - prevDateObj);
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                // Si la diferencia es mayor a 1 día, es un nuevo bloque (no consecutivo)
                if (diffDays > 1) {
                    shiftBlockCount++;
                }
            }
            // Actualizar la fecha previa para la siguiente iteración
            previousDate = currentDateStr;
        };

        return shiftBlockCount;
    }


    function updateSummary() {
        const overtimeDisplay = document.getElementById('summary-overtime');
        const shiftsDisplay = document.getElementById('summary-shifts-number');
        const holidaysDisplay = document.getElementById('summary-holidays-number');

        if (!overtimeDisplay || !shiftsDisplay || !holidaysDisplay) return;

        let totalOvertimeMonthly = 0;
        let totalFestivosAnnual = 0;

        const currentYear = currentCalendarDate.getFullYear();
        const currentMonthKey = `${currentYear}-${currentCalendarDate.getMonth()}`;

        // 🔑 CALCULAR BLOQUES DE GUARDIAS: Usamos la nueva función para el conteo de bloques anuales
        const totalShiftsAnnual = countConsecutiveShifts(calendarEvents, currentYear);

        for (const dateStr in calendarEvents) {
            const data = calendarEvents[dateStr];
            const eventDate = new Date(dateStr + 'T00:00:00');
            if (isNaN(eventDate.getTime())) continue;

            const eventYear = eventDate.getFullYear();
            const eventMonthKey = `${eventYear}-${eventDate.getMonth()}`;

            // Acumular horas extra del mes actual
            if (eventMonthKey === currentMonthKey) {
                if (data.type === 'Extra' && data.hours) {
                    totalOvertimeMonthly += parseFloat(data.hours);
                }
            }

            // Acumular festivos del año actual
            if (eventYear === currentYear) {
                if (data.type === 'Festivo') {
                    totalFestivosAnnual++;
                }
            }
        }

        overtimeDisplay.textContent = `${totalOvertimeMonthly.toFixed(1)} h`;
        shiftsDisplay.textContent = `${totalShiftsAnnual}`;
        holidaysDisplay.textContent = `${totalFestivosAnnual}`;
        // Contar festivos nacionales
        for (let dayNum = 0; dayNum < 365; dayNum++) {
            const checkDate = new Date(currentYear, 0, 1 + dayNum);
            if (isHoliday(checkDate)) {
                const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
                if (!calendarEvents[dateStr] || calendarEvents[dateStr].type !== 'Festivo') {
                    totalFestivosAnnual++;
                }
            }
        }
        holidaysDisplay.textContent = `${totalFestivosAnnual}`;
    }

    function updateHolidayQuota() {
        const quotaDisplay = document.getElementById('summary-vacation-quota');
        if (!quotaDisplay) return;

        const currentYear = currentCalendarDate.getFullYear();
        let vacationDaysUsed = 0;

        for (const dateStr in calendarEvents) {
            const data = calendarEvents[dateStr];
            const eventDate = new Date(dateStr);
            if (isNaN(eventDate.getTime())) continue;

            const eventYear = eventDate.getFullYear();

            if (data.type === 'Vacaciones' && eventYear === currentYear) {
                vacationDaysUsed++;
            }
        }

        const quotaRemaining = ANNUAL_VACATION_QUOTA - vacationDaysUsed;

        quotaDisplay.textContent = `${quotaRemaining} días`;
    }

    window.openEventModal = function (dateStr) {
        selectedDateForEvent = dateStr;
        const dateObj = new Date(dateStr + 'T00:00:00');

        document.getElementById('modal-date-display').textContent = dateObj.toLocaleDateString('es-ES', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const btnStyle = "py-3 px-4 rounded-lg font-bold w-full transition border-2";
        const optionsContainer = document.getElementById('event-options-container');

        // Determinar si hay un evento existente para cambiar el botón "Borrar" a "Eliminar" y otros textos
        const existingEvent = calendarEvents[dateStr];
        const deleteButtonText = existingEvent ? 'Eliminar Evento' : 'Borrar (Vacío)';
        // Se permite borrar (haciendo clic) solo si hay un evento existente
        const deleteButtonClass = existingEvent
            ? 'text-red-500 border-red-500 hover:bg-red-500 hover:text-white'
            : 'text-gray-400 border-gray-400 hover:bg-gray-100 hover:text-gray-500 opacity-50';
        const deleteButtonDisabled = existingEvent ? '' : 'disabled';


        if (optionsContainer) {
            optionsContainer.innerHTML = `
                <button onclick="window.deleteEvent('${selectedDateForEvent}')" class="${btnStyle} ${deleteButtonClass}" ${deleteButtonDisabled}>
                    ${deleteButtonText}
                </button>
                <button onclick="window.registerEvent('Extra')" class="${btnStyle} text-orange-600 border-orange-600 hover:bg-orange-600 hover:text-white">
                    Horas Extra
                </button>
                <button onclick="window.registerEvent('Guardia')" class="${btnStyle} text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white">
                    Guardia
                </button>
                <button onclick="window.registerEvent('Festivo')" class="${btnStyle} text-green-600 border-green-600 hover:bg-green-600 hover:text-white">
                    Festivos
                </button>
                <button onclick="window.registerEvent('Vacaciones')" class="${btnStyle} text-purple-600 border-purple-600 hover:bg-purple-600 hover:text-white">
                    Vacaciones
                </button>
            `;
        }

        // 🔑 Uso de showModal global
        if (typeof window.showModal === 'function') {
            window.showModal('event-modal');
        }
    }

    window.registerEvent = function (eventType) {
        // 🔑 Uso de closeModal global
        if (typeof window.closeModal === 'function') {
            window.closeModal('event-modal');
        }
        if (eventType === 'Extra') {
            // 🔑 Uso de showModal global
            if (typeof window.showModal === 'function') {
                // Prellenar con horas existentes o un valor predeterminado
                const existingHours = calendarEvents[selectedDateForEvent] && calendarEvents[selectedDateForEvent].type === 'Extra'
                    ? calendarEvents[selectedDateForEvent].hours : '1';
                document.getElementById('overtime-input').value = existingHours;
                window.showModal('overtime-modal');
            }
        } else {
            saveEventToFirestore(selectedDateForEvent, eventType);
        }
    }

    window.saveOvertimeHours = function () {
        const hoursInput = document.getElementById('overtime-input');
        const hours = hoursInput.value.trim();

        // 🔑 Uso de closeModal global
        if (typeof window.closeModal === 'function') {
            window.closeModal('overtime-modal');
        }

        const parsedHours = parseFloat(hours);

        if (hours === '' || isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
            showMessage('error', 'Horas inválidas. Debe ser un número positivo.');
            return;
        }

        saveEventToFirestore(selectedDateForEvent, 'Extra', parsedHours);
    }

    window.goBackToEventModal = function () {
        // 🔑 Uso de closeModal global
        if (typeof window.closeModal === 'function') {
            window.closeModal('overtime-modal');
        }
        if (selectedDateForEvent) {
            window.openEventModal(selectedDateForEvent);
        }
    }

    // =======================================================
    // 5. INICIALIZACIÓN Y NAVIGACIÓN
    // =======================================================

    /**
     * Inicializa la lógica de la vista Calendario.
     */
    function initCalendar() {
        // 🔑 Aplicar el tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        // 🚨 Llamamos a la función asíncrona que ESPERARÁ la señal de Main.js
        setupFirebaseAndListeners();

        const prevBtn = document.getElementById('prev-month-btn');
        const nextBtn = document.getElementById('next-month-btn');

        if (prevBtn) {
            prevBtn.onclick = () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                renderCalendar();
                updateSummary();
            };
        }

        if (nextBtn) {
            nextBtn.onclick = () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                renderCalendar();
                updateSummary();
            };
        }

        renderCalendar();
        updateSummary();
        updateHolidayQuota();
    }

    // Exponer la función de inicialización globalmente
    window.initCalendarView = initCalendar;

})();

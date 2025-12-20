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
    let unsubscribe = null; // 🔑 Variable para almacenar la función de desuscripción

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
            console.error('firebaseReadyPromise no está definido');
            return;
        }

        // 3. Leer userId DESPUÉS de que Firebase esté listo
        const currentUserId = sessionStorage.getItem('portis-user-identifier');

        // 4. Verificar estado después de la espera
        if (!currentUserId || typeof window.db === 'undefined' || window.db === null) {
            showMessage('error', 'Error de sesión. Intente iniciar sesión nuevamente.');
            console.error('userId:', currentUserId, 'db:', window.db);
            return;
        }

        // 5. Iniciar Listener
        isFirebaseReady = true;
        console.log('Firebase listo, iniciando listener de eventos');
        setupEventsListener();
    }


    /**
     * Obtiene la referencia a la colección de eventos
     * con la ruta simplificada: users/{userId}/calendar
     */
    function getEventsCollectionRef() {
        // Leer userId dinámicamente
        const currentUserId = sessionStorage.getItem('portis-user-identifier');

        // Aseguramos que DB esté inicializada y que haya un ID de usuario válido
        if (typeof window.db === 'undefined' || !currentUserId || !isFirebaseReady) {
            console.error('getEventsCollectionRef: db, userId o isFirebaseReady no están listos', {
                db: typeof window.db,
                userId: currentUserId,
                isFirebaseReady
            });
            return null;
        }

        // Nueva ruta simplificada
        const path = `users/${currentUserId}/calendar`;

        return window.db.collection(path);
    }

    function setupEventsListener() {
        if (!isFirebaseReady) return;

        const eventsQuery = getEventsCollectionRef();
        if (!eventsQuery) return;

        // 🔑 Limpiar listener previo si existe para forzar una "recarga" al cambiar de vista
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        // Escuchar solo los eventos del usuario actual
        unsubscribe = eventsQuery.onSnapshot((snapshot) => {
            const newEvents = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                const d = data.date;
                if (!newEvents[d]) {
                    newEvents[d] = {
                        dayEvent: null,
                        maintenance: []
                    };
                }

                if (data.type === 'mantenimiento_programado') {
                    newEvents[d].maintenance.push({ ...data, id: doc.id });
                } else {
                    // Solo puede haber un evento principal por día (Extra, Guardia, etc.)
                    newEvents[d].dayEvent = { ...data, id: doc.id };
                }
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
        // Leer userId dinámicamente
        const currentUserId = sessionStorage.getItem('portis-user-identifier');

        console.log('saveEventToFirestore llamado:', { dateStr, eventType, hours, isFirebaseReady, userId: currentUserId });

        if (!isFirebaseReady || !window.db || !currentUserId) {
            const errorMsg = 'El sistema de base de datos no está listo. Inténtelo de nuevo.';
            showMessage('error', errorMsg);
            console.error(errorMsg, { isFirebaseReady, db: !!window.db, userId: currentUserId });
            return;
        }

        // Si ya existe un evento principal en esta fecha, eliminarlo primero
        const dayData = calendarEvents[dateStr];
        const existingEvent = dayData ? dayData.dayEvent : null;
        if (existingEvent && existingEvent.id) {
            console.log('Eliminando evento existente:', existingEvent);
            try {
                await getEventsCollectionRef().doc(existingEvent.id).delete();
            } catch (error) {
                console.error('Error al eliminar evento existente:', error);
            }
        }

        const eventData = {
            date: dateStr,
            type: eventType,
            // Aseguramos que firebase.firestore.FieldValue esté disponible
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            hours: hours ? parseFloat(hours) : null,
        };

        console.log('Guardando nuevo evento:', eventData);

        try {
            const docRef = await getEventsCollectionRef().add(eventData);
            console.log('Evento guardado con ID:', docRef.id);
            showMessage('success', `Evento de ${eventType} guardado exitosamente.`);
        } catch (error) {
            showMessage('error', 'Error al guardar el evento en la base de datos.');
            console.error('Error al guardar evento:', error);
        }
    }

    // --- FUNCIÓN: Eliminar Evento ---
    async function deleteEventFromFirestore(dateStr) {
        const dayData = calendarEvents[dateStr];
        const event = dayData ? dayData.dayEvent : null;

        if (!event) {
            showMessage('error', 'No hay evento registrado para esta fecha.');
            return;
        }

        // 🔑 Uso de closeModal global
        if (typeof window.closeModal === 'function') window.closeModal('event-modal');

        const currentUserId = sessionStorage.getItem('portis-user-identifier');
        if (!isFirebaseReady || !window.db || !currentUserId) {
            showMessage('error', 'El sistema de base de datos no está listo. Inténtelo de nuevo.');
            return;
        }

        if (event.id) {
            try {
                await getEventsCollectionRef().doc(event.id).delete();
                showMessage('success', `Evento del ${dateStr} eliminado exitosamente.`);
            } catch (error) {
                console.error("Error deleting event:", error);
                showMessage('error', 'Error al eliminar el evento en la base de datos.');
            }
        }
    }
    // Hacemos la función global para que sea llamada desde el HTML
    window.deleteEvent = deleteEventFromFirestore;

    /**
     * Desprograma un mantenimiento específico desde el modal del calendario
     */
    window.unscheduleFromCalendar = async function (maintenanceId, calendarDocId) {
        const currentUserId = sessionStorage.getItem('portis-user-identifier');
        if (!window.db || !currentUserId) {
            showMessage('error', 'Sesión no válida.');
            return;
        }

        try {
            const batch = window.db.batch();

            // 1. Eliminar de calendar
            const calendarRef = window.db.collection(`users/${currentUserId}/calendar`).doc(calendarDocId);
            batch.delete(calendarRef);

            // 2. Actualizar repair
            const repairRef = window.db.collection(`users/${currentUserId}/repairs`).doc(maintenanceId);
            batch.update(repairRef, {
                scheduledDate: firebase.firestore.FieldValue.delete(),
                scheduledTime: firebase.firestore.FieldValue.delete(),
                scheduledDateTime: firebase.firestore.FieldValue.delete(),
                isScheduled: false
            });

            await batch.commit();
            showMessage('success', 'Mantenimiento desprogramado correctamente.');

            // Recargar datos de mantenimiento para actualizar el Dashboard
            if (typeof window.fetchMaintenanceData === 'function') {
                window.fetchMaintenanceData();
            }

            // El snapshot de Calendar.js actualizará calendarEvents automáticamente
            // Refrescamos el modal tras un breve delay para que los datos nuevos estén listos
            if (selectedDateForEvent) {
                setTimeout(() => window.openEventModal(selectedDateForEvent), 300);
            }

        } catch (error) {
            console.error("Error desprogramando:", error);
            showMessage('error', 'Error al desprogramar el mantenimiento.');
        }
    };

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
            calendarGrid.innerHTML += `<div class="calendar-day-empty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const monthString = (month + 1).toString().padStart(2, '0');
            const dayString = day.toString().padStart(2, '0');
            const fullDate = `${year}-${monthString}-${dayString}`;

            const todayDate = new Date();
            const currentDate = new Date(year, month, day);
            const isToday = todayDate.toDateString() === currentDate.toDateString();

            const dayOfWeek = currentDate.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            let weekendClass = isWeekend ? 'calendar-weekend-text' : '';

            // === LÓGICA DE EVENTOS ===
            const dayData = calendarEvents[fullDate] || { dayEvent: null, maintenance: [] };
            let mainEvent = dayData.dayEvent;

            // 🆕 Verificar si es festivo nacional (si no hay evento ya registrado)
            if (!mainEvent && isHoliday(currentDate)) {
                mainEvent = { type: 'Festivo', date: fullDate, isNational: true };
            }

            let eventDisplayClass = '';
            let eventTypeTag = ''; // Será el contenido de la etiqueta del día
            let todayClass = ''; // Clase para el borde del día actual

            if (mainEvent) {
                // Si la fecha está en el calendario, el texto debe usar la clase de evento
                weekendClass = 'calendar-event-text';

                if (mainEvent.type === 'Extra') {
                    eventDisplayClass = 'day-overtime';
                    eventTypeTag = `<span class="text-xs font-medium block leading-tight event-overtime-hours">${mainEvent.hours}h</span>`;
                    if (isToday) todayClass = 'today-overtime';
                } else if (mainEvent.type === 'Guardia') {
                    eventDisplayClass = 'day-shift';
                    eventTypeTag = `<span class="text-xs font-medium calendar-event-text block leading-tight"></span>`;
                    if (isToday) todayClass = 'today-shift';
                } else if (mainEvent.type === 'Vacaciones') {
                    eventDisplayClass = 'day-vacation';
                    eventTypeTag = `<span class="text-xs font-medium calendar-event-text block leading-tight"></span>`;
                    if (isToday) todayClass = 'today-vacation';
                } else if (mainEvent.type === 'Festivo') {
                    eventDisplayClass = 'day-holiday';
                    eventTypeTag = `<span class="text-xs font-medium calendar-event-text block leading-tight"></span>`;
                    if (isToday) todayClass = 'today-holiday';
                }
            } else if (isToday) {
                todayClass = 'today-default';
            }

            // Mantenimiento programado - añade clase de borde blanco sin machacar lo anterior
            if (dayData.maintenance.length > 0) {
                eventDisplayClass += ' day-scheduled';

                // Si es hoy, usamos el indicador de hoy-programado (borde blanco)
                if (isToday) {
                    todayClass = 'today-scheduled';
                }

                // Si no hay tag de evento principal, podemos poner un micro-indicador
                if (!eventTypeTag) {
                    eventTypeTag = `<span class="text-[10px] text-white block leading-tight opacity-80">📍</span>`;
                }
            }
            // =========================

            calendarGrid.innerHTML += `
                <div class="calendar-day ${eventDisplayClass} ${todayClass}" 
                    data-date="${fullDate}" 
                    onclick="window.openEventModal('${fullDate}')">
                    <span class="text-xs md:text-base font-bold block ${weekendClass}">${day}</span> 
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
                const dayData = allEvents[dateStr];
                const main = dayData ? dayData.dayEvent : null;
                return main && main.type === 'Guardia' && dateStr.startsWith(year.toString());
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

                // Si la diferencia es mayor a 3 días, es un nuevo bloque (no consecutivo)
                // (Ej: 15 y 18 [diff 3] es mismo bloque. 15 y 19 [diff 4] son distintos) 
                if (diffDays > 3) {
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

        let totalOvertimeAnnual = 0;
        let totalFestivosAnnual = 0;

        const currentYear = currentCalendarDate.getFullYear();
        const currentMonthKey = `${currentYear}-${currentCalendarDate.getMonth()}`;

        // 🔑 CALCULAR BLOQUES DE GUARDIAS: Usamos la nueva función para el conteo de bloques anuales
        const totalShiftsAnnual = countConsecutiveShifts(calendarEvents, currentYear);

        for (const dateStr in calendarEvents) {
            const dayData = calendarEvents[dateStr];
            const main = dayData ? dayData.dayEvent : null;
            if (!main) continue;

            const eventDate = new Date(dateStr + 'T00:00:00');
            if (isNaN(eventDate.getTime())) continue;

            const eventYear = eventDate.getFullYear();

            // Acumular horas extra del AÑO actual
            if (eventYear === currentYear) {
                if (main.type === 'Extra' && main.hours) {
                    totalOvertimeAnnual += parseFloat(main.hours);
                }
            }

            // Acumular festivos del año actual
            if (eventYear === currentYear) {
                if (main.type === 'Festivo') {
                    totalFestivosAnnual++;
                }
            }
        }

        overtimeDisplay.textContent = `${totalOvertimeAnnual.toFixed(1)} h`;
        shiftsDisplay.textContent = `${totalShiftsAnnual} guardias`;
        holidaysDisplay.textContent = `${totalFestivosAnnual} días`;
        // Contar festivos nacionales
        for (let dayNum = 0; dayNum < 365; dayNum++) {
            const checkDate = new Date(currentYear, 0, 1 + dayNum);
            if (isHoliday(checkDate)) {
                const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
                const dayData = calendarEvents[dateStr];
                const main = dayData ? dayData.dayEvent : null;
                if (!main || main.type !== 'Festivo') {
                    totalFestivosAnnual++;
                }
            }
        }
        holidaysDisplay.textContent = `${totalFestivosAnnual} días`;
    }

    function updateHolidayQuota() {
        const quotaDisplay = document.getElementById('summary-vacation-quota');
        if (!quotaDisplay) return;

        const currentYear = currentCalendarDate.getFullYear();
        let vacationDaysUsed = 0;

        for (const dateStr in calendarEvents) {
            const dayData = calendarEvents[dateStr];
            const main = dayData ? dayData.dayEvent : null;
            if (!main) continue;

            const eventDate = new Date(dateStr);
            if (isNaN(eventDate.getTime())) continue;

            const eventYear = eventDate.getFullYear();

            if (main.type === 'Vacaciones' && eventYear === currentYear) {
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

        const optionsContainer = document.getElementById('event-options-container');

        // Determinar si hay un evento principal (Extra, Vacaciones, etc.)
        const dayData = calendarEvents[dateStr] || { dayEvent: null, maintenance: [] };
        const mainEvent = dayData.dayEvent;
        const deleteButtonText = mainEvent ? 'Eliminar Evento' : 'Borrar (Vacío)';
        const deleteButtonClass = mainEvent ? 'btn-delete' : 'btn-delete-disabled';
        const deleteButtonDisabled = mainEvent ? '' : 'disabled';

        // Generar lista de mantenimientos programados con scroll si hay varios
        let maintenanceListHtml = '';
        if (dayData.maintenance.length > 0) {
            maintenanceListHtml = `
                <div class="mb-4 space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Intervenciones Programadas</div>
                    ${dayData.maintenance.map(m => `
                        <div class="p-3 rounded-lg border border-white/20 bg-white/5 relative group">
                            <div class="flex items-center gap-2 mb-2">
                                <i class="ph ph-wrench text-blue-400 text-lg"></i>
                                <span class="font-bold text-white text-sm">${m.maintenanceLocation || 'Ubicación'}</span>
                            </div>
                            <div class="text-xs space-y-1 text-gray-300">
                                <div class="flex items-center gap-2">
                                    <i class="ph ph-clock text-blue-300"></i>
                                    <span>${m.scheduledTime || '--:--'}</span>
                                </div>
                                ${m.notes ? `
                                <div class="flex items-start gap-2 mt-1 italic opacity-80">
                                    <i class="ph ph-note"></i>
                                    <span>${m.notes}</span>
                                </div>` : ''}
                            </div>
                            <div class="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                <button onclick="window.openMaintenanceMap('${(m.maintenanceLocation || '').replace(/'/g, "\\'")}')" 
                                        class="p-1.5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all"
                                        title="Ver Mapa">
                                    <i class="ph ph-map-pin"></i>
                                </button>
                                <button onclick="window.unscheduleFromCalendar('${m.maintenanceId}', '${m.id}')" 
                                        class="p-1.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                                        title="Desprogramar">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (optionsContainer) {
            optionsContainer.innerHTML = `
                ${maintenanceListHtml}
                
                <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4">Gestión del Día</div>
                <div class="grid grid-cols-1 gap-2">
                    <button onclick="window.deleteEvent('${selectedDateForEvent}')" class="action-btn ${deleteButtonClass}" ${deleteButtonDisabled}>
                        ${deleteButtonText}
                    </button>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="window.registerEvent('Extra')" class="action-btn btn-extra">Horas Extra</button>
                        <button onclick="window.registerEvent('Guardia')" class="action-btn btn-guardia">Guardia</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="window.registerEvent('Festivo')" class="action-btn btn-festivo">Festivos</button>
                        <button onclick="window.registerEvent('Vacaciones')" class="action-btn btn-vacaciones">Vacaciones</button>
                    </div>
                </div>
            `;
        }

        // 🔑 Uso de showModal global
        if (typeof window.showModal === 'function') {
            window.showModal('event-modal');
        }
    }

    window.registerEvent = function (eventType) {
        console.log('registerEvent llamado con:', eventType, 'para fecha:', selectedDateForEvent);

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
            console.log('Llamando a saveEventToFirestore...');
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

    window.adjustOvertime = function (amount) {
        const input = document.getElementById('overtime-input');
        if (input) {
            let val = parseFloat(input.value) || 0;
            val = Math.max(0, val + amount);
            input.value = val;
        }
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

        renderCalendar(); // Renderizar grid vacío inmediatamente
        updateSummary();

        // 🚨 Llamamos a la función asíncrona que ESPERARÁ la señal de Main.js
        setupFirebaseAndListeners();

        const prevBtn = document.getElementById('prev-month-btn');
        const nextBtn = document.getElementById('next-month-btn');

        if (prevBtn) {
            prevBtn.onclick = () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                renderCalendar();
                updateSummary();
                updateHolidayQuota();
            };
        }

        if (nextBtn) {
            nextBtn.onclick = () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                renderCalendar();
                updateSummary();
                updateHolidayQuota();
            };
        }

        renderCalendar();
        updateSummary();
        updateHolidayQuota();
    }

    // Exponer la función de inicialización globalmente
    window.initCalendar = initCalendar;

})();

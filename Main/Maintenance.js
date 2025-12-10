// ===================================================================================
// Maintenance.js - Lógica de la Vista de Mantenimientos (Pendientes)
// ===================================================================================

// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito

    // ====================================
    // 1. CONFIGURACIÓN Y VARIABLES
    // ====================================

    let db = null; // Instancia de Firestore
    let userId = null; // ID del usuario autenticado
    let isFirebaseReady = false;

    let currentViewDate = new Date();
    let currentMaintenanceData = []; // Almacenar datos actuales para filtrado
    let currentSortMethod = localStorage.getItem('portis-maintenance-sort') || 'priority'; // 'priority' | 'location'
    let distanceCache = {}; // Cache de distancias: { id: distance }

    function showMessage(type, message) {
        if (typeof window.showAppMessage === 'function') {
            window.showAppMessage(type, message);
        } else {
            // alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN MEJORADA: Inicialización más robusta
    // ----------------------------------------------------------------------------------
    async function setupFirebase() {
        // 2. Esperar la señal de Firebase Ready (CRÍTICO)
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            await window.firebaseReadyPromise;
        } else {
            return;
        }

        // 3. Verificar estado después de la espera
        if (typeof window.db !== 'undefined' && window.db !== null && sessionStorage.getItem('portis-user-identifier')) {
            db = window.db;
            userId = sessionStorage.getItem('portis-user-identifier');
            isFirebaseReady = true;
        } else {
            showMessage('error', 'Error de sesión. Intente iniciar sesión nuevamente.');
        }
    }

    // Obtiene la referencia a la colección 'repairs' con la ruta users/{userId}/repairs
    function getRepairsCollectionRef() {
        if (!isFirebaseReady || !userId) return null;
        return db.collection(`users/${userId}/repairs`);
    }

    // ====================================
    // 2. LÓGICA DE CARGA DE DATOS
    // ====================================

    // Obtiene los mantenimientos para el mes y año actual desde Firestore.
    async function fetchMaintenanceFromFirestore(date) {
        if (!isFirebaseReady) return [];

        const targetMonth = date.getMonth() + 1;
        const targetYear = date.getFullYear();

        try {
            const repairsRef = getRepairsCollectionRef();
            if (!repairsRef) return [];

            // Consultar mantenimientos que coincidan con el mes y año, O que sean periódicos y toque este mes
            // Simplificación: Traemos todos los pendientes y filtramos en cliente por ahora para manejar la lógica de periodicidad compleja
            // En producción, esto debería ser una query compuesta optimizada.
            const snapshot = await repairsRef
                .where('status', '==', 'Pendiente')
                .get();

            const maintenanceList = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // Filtrar localmente por mes/año si es necesario, o incluir lógica de periodicidad
                // Por ahora, asumimos que 'maintenance_month' y 'maintenance_year' indican la PRÓXIMA fecha
                if (data.maintenance_month === targetMonth && data.maintenance_year === targetYear) {
                    maintenanceList.push({ id: doc.id, ...data });
                }
            });

            return maintenanceList;

        } catch (error) {
            showMessage('error', 'Error al cargar mantenimientos.');
            return [];
        }
    }

    // Función principal para obtener y renderizar mantenimientos.
    window.fetchMaintenanceData = async function () {
        const listContainer = document.getElementById('monthly-maintenance-list');
        const loadingSpinner = listContainer ? listContainer.querySelector('.loading-spinner') : null;
        const noDataMessage = document.getElementById('no-maintenance-message');
        const countDisplay = document.getElementById('monthly-count');
        const monthYearDisplay = document.getElementById('current-maintenance-month-year');

        if (monthYearDisplay) {
            const monthName = currentViewDate.toLocaleString('es-ES', { month: 'long' });
            monthYearDisplay.textContent = `${monthName} ${currentViewDate.getFullYear()}`;
        }

        if (loadingSpinner) loadingSpinner.style.display = 'block';
        if (noDataMessage) noDataMessage.classList.add('hidden');

        let maintenanceItems = [];

        if (!isFirebaseReady) {
            // Wait or handle not ready
        } else {
            // MODO FIREBASE
            maintenanceItems = await fetchMaintenanceFromFirestore(currentViewDate);
        }

        currentMaintenanceData = maintenanceItems; // Guardar para búsqueda

        if (loadingSpinner) loadingSpinner.style.display = 'none';

        if (maintenanceItems.length === 0) {
            if (listContainer) listContainer.innerHTML = '';
            if (noDataMessage) noDataMessage.classList.remove('hidden');
            if (countDisplay) countDisplay.textContent = '0';
        } else {
            // Si el método es 'ai', aplicamos distancias CACHEADAS si existen
            if (currentSortMethod === 'ai') {
                maintenanceItems.forEach(item => {
                    if (distanceCache[item.id] !== undefined) {
                        item.distance = distanceCache[item.id];
                    } else {
                        item.distance = Infinity; // Nuevo item sin calcular
                    }
                });
            }

            // Render (incluye el sort interno que usa item.distance si method es 'ai')
            renderMaintenanceList(maintenanceItems, currentViewDate);

            if (countDisplay) countDisplay.textContent = maintenanceItems.length;
        }
    }

    // ====================================
    // 3. LÓGICA DE RENDERIZADO Y NAVEGACIÓN
    // ====================================

    // Renderiza la lista de mantenimientos en la vista.
    function renderMaintenanceList(data, currentDate) {
        const listContainer = document.getElementById('monthly-maintenance-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Lógica de ordenación dinámica
        data.sort((a, b) => {
            if (currentSortMethod === 'location') {
                // Por Ubicación: Alfabético por location
                // "cuantas mas palabras tengan en comun" -> Alfabético agrupa palabras iniciales idénticas
                const locA = (a.location || '').toLowerCase();
                const locB = (b.location || '').toLowerCase();
                if (locA < locB) return -1;
                if (locA > locB) return 1;
                return 0;
            } else if (currentSortMethod === 'ai') {
                // Por Distancia (IA): Menor distancia primero
                // Se asume que 'distance' ya ha sido calculado en el objeto
                const distA = a.distance !== undefined ? a.distance : Infinity;
                const distB = b.distance !== undefined ? b.distance : Infinity;
                return distA - distB;
            } else {
                // Por Prioridad (Default): Alta > Media > Baja
                const priorityOrder = { 'Alta': 1, 'Media': 2, 'Baja': 3 };
                const pA = priorityOrder[a.priority] || 99;
                const pB = priorityOrder[b.priority] || 99;
                if (pA !== pB) return pA - pB;
                return a.location.localeCompare(b.location);
            }
        });

        data.forEach(item => {
            const card = createMaintenanceCard(item);
            listContainer.appendChild(card);
        });
    }

    // Helpers para valores de prioridad y contrato (para ordenamiento si fuera necesario)
    renderMaintenanceList.priorityValue = function (p) {
        if (p === 'Alta') return 3;
        if (p === 'Media') return 2;
        return 1;
    };

    renderMaintenanceList.contractValue = function (c) {
        if (c === 'Mensual') return 1;
        if (c === 'Trimestral') return 3;
        if (c === 'Semestral') return 6;
        if (c === 'Anual') return 12;
        return 0;
    };

    // Crea la tarjeta HTML para un mantenimiento individual (DISEÑO ACTUALIZADO).
    function createMaintenanceCard(item) {
        const div = document.createElement('div');
        // Usamos la clase maintenance-item definida en Main.css
        div.className = 'maintenance-item relative overflow-hidden';

        // Determinar clase de prioridad
        let priorityClass = 'priority-media'; // Default
        if (item.priority === 'Alta') priorityClass = 'priority-alta';
        else if (item.priority === 'Baja') priorityClass = 'priority-baja';

        div.classList.add(priorityClass);

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg leading-tight pr-8">${item.location}</h3>
                <span class="maintenance-priority-badge">${item.priority}</span>
            </div>
            
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                <div class="flex items-center gap-1">
                    <i class="ph ph-file-text"></i>
                    <span>${item.contract}</span>
                </div>
                <div class="flex items-center gap-1">
                    <i class="ph ph-wrench"></i>
                    <span>${item.model || 'N/A'}</span>
                </div>
            </div>

            ${item.description ? `
            <div class="maintenance-observation-box">
                <span class="maintenance-observation-box-title">Observaciones:</span>
                <p class="maintenance-observation-box-text">${item.description}</p>
            </div>
            ` : ''}

            ${item.breakdown ? `
            <div class="maintenance-observation-box" style="border-left: 3px solid var(--color-accent-red);">
                <span class="maintenance-observation-box-title text-red-500">Avería:</span>
                <p class="maintenance-observation-box-text">${item.breakdown}</p>
            </div>
            ` : ''}

            <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <span class="text-xs text-gray-400">ID: ${item.key_id || '---'}</span>
                <button class="text-accent-magenta hover:text-white hover:bg-accent-magenta p-1.5 rounded-full transition-colors" 
                        onclick="event.stopPropagation(); window.openMaintenanceMap('${item.location}')" title="Ver Mapa">
                    <i class="ph ph-map-pin text-lg"></i>
                </button>
            </div>
        `;

        // Evento de clic para abrir detalles
        div.onclick = () => showMaintenanceDetailsModal(item);

        return div;
    }

    // ====================================
    // 4. ACCIONES GLOBALES (MAPA Y COMPLETAR)
    // ====================================

    window.openMaintenanceMap = function (location) {
        const query = encodeURIComponent(location);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    }

    async function executeCompleteMaintenance(id, breakdownRepaired) {
        try {
            let repair = null;
            if (isFirebaseReady) {
                const doc = await getRepairsCollectionRef().doc(id).get();
                if (doc.exists) repair = { id: doc.id, ...doc.data() };
            }

            if (!repair) {
                showMessage('error', 'No se encontró el mantenimiento.');
                return;
            }

            // Calcular próxima fecha
            let nextMonth = repair.maintenance_month;
            let nextYear = repair.maintenance_year;
            let increment = 1;

            switch (repair.contract) {
                case 'Mensual': increment = 1; break;
                case 'Bimensual': increment = 2; break;
                case 'Trimestral': increment = 3; break;
                case 'Cuatrimestral': increment = 4; break;
                case 'Semestral': increment = 6; break;
                case 'Anual': increment = 12; break;
            }

            nextMonth += increment;
            while (nextMonth > 12) {
                nextMonth -= 12;
                nextYear++;
            }

            // Historial (Siempre guarda todo)
            const historyRecord = {
                ...repair,
                completedAt: new Date(), // Changed to completedAt (Firestore Timestamp compatible if using serverTimestamp, but Date object/ISO string works for now with client sort)
                completedBy: userId,
                username: sessionStorage.getItem('portis-user-display-name') || 'Usuario', // Capture username
                original_month: repair.maintenance_month,
                original_year: repair.maintenance_year
            };
            delete historyRecord.id;

            // Lógica de Avería para Historial
            if (repair.breakdown) {
                historyRecord.breakdown = repair.breakdown;
                historyRecord.repairStatus = breakdownRepaired ? 'Reparado' : 'No Reparado';
            }

            // Updates para el mantenimiento recurrente
            const updates = {
                maintenance_month: nextMonth,
                maintenance_year: nextYear,
                status: 'Pendiente', // Asegurar reset de estado
                // Observaciones siempre se mantienen en el mantenimiento recurrente según instrucciones
                description: repair.description || ''
            };

            // Lógica de Avería
            if (breakdownRepaired) {
                // Si se reparó, borramos la avería y bajamos prioridad
                updates.breakdown = firebase.firestore.FieldValue.delete();
                updates.priority = 'Baja';
            } else {
                // Si no se reparó, mantenemos la avería y la prioridad
                // No need to add anything to updates, existing values persist
            }

            // Update en Firebase
            if (isFirebaseReady) {
                const batch = db.batch();
                const repairRef = getRepairsCollectionRef().doc(id);
                const historyRef = db.collection(`users/${userId}/history`).doc();

                batch.update(repairRef, updates);
                batch.set(historyRef, historyRecord);

                await batch.commit();
            }

            showMessage('success', 'Mantenimiento completado.');
            hideMaintenanceModal();
            if (window.fetchMaintenanceData) window.fetchMaintenanceData();

        } catch (error) {
            console.error("Error completing maintenance:", error);
            showMessage('error', 'Error al completar la tarea.');
        }
    }

    window.confirmCompleteMaintenance = function (id) {
        // Buscar el ítem en los datos cargados
        const item = currentMaintenanceData.find(i => i.id === id);

        const obsModal = document.getElementById('observation-retention-modal');
        if (!obsModal) {
            if (confirm("¿Completar tarea?")) executeCompleteMaintenance(id, true);
            return;
        }

        const title = obsModal.querySelector('h3');
        const desc = obsModal.querySelector('p');
        const btnYes = document.getElementById('btn-keep-obs');
        const btnNo = document.getElementById('btn-delete-obs');

        // Clonar botones para limpiar listeners anteriores
        const newBtnYes = btnYes.cloneNode(true);
        btnYes.parentNode.replaceChild(newBtnYes, btnYes);
        const newBtnNo = btnNo.cloneNode(true);
        btnNo.parentNode.replaceChild(newBtnNo, btnNo);

        // CASE 1: Mantenimiento con AVERÍA
        if (item && item.breakdown && item.breakdown.trim()) {
            if (title) title.textContent = "¿Avería Reparada?";
            if (desc) desc.textContent = "El mantenimiento tiene una avería registrada. ¿Se ha solucionado?";

            newBtnYes.innerHTML = '<i class="ph ph-check"></i> Sí, Completar';
            newBtnYes.onclick = () => {
                obsModal.classList.add('hidden');
                obsModal.classList.remove('flex');
                executeCompleteMaintenance(id, true); // Sí reparado (Clean breakdown)
            };
            newBtnYes.classList.remove('hidden');

            newBtnNo.innerHTML = '<i class="ph ph-x"></i> No, Completar';
            newBtnNo.onclick = () => {
                obsModal.classList.add('hidden');
                obsModal.classList.remove('flex');
                executeCompleteMaintenance(id, false); // No reparado (Keep breakdown)
            };
            newBtnNo.classList.remove('hidden');

        } else {
            // CASE 2: Mantenimiento NORMAL
            if (title) title.textContent = "¿Mantenimiento Completado?";

            // Texto descriptivo opcional
            if (desc) desc.textContent = "Se registrará como completado y se actualizará la fecha.";

            newBtnYes.innerHTML = '<i class="ph ph-check"></i> Completar';
            newBtnYes.onclick = () => {
                obsModal.classList.add('hidden');
                obsModal.classList.remove('flex');
                executeCompleteMaintenance(id, true);
            };
            newBtnYes.classList.remove('hidden');

            // Ocultar el segundo botón (Cancelar) ya que existe un botón estático de cancelar en el footer del modal
            newBtnNo.classList.add('hidden');
        }

        obsModal.classList.remove('hidden');
        obsModal.classList.add('flex');
    }

    window.toggleMaintenanceSearch = function () {
        const container = document.getElementById('maintenance-search-container');
        const input = document.getElementById('maintenance-search-input');

        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            input.focus();
        } else {
            container.classList.add('hidden');
            input.value = '';
            // Restaurar lista completa
            renderMaintenanceList(currentMaintenanceData, currentViewDate);
        }
    }

    // ====================================
    // LÓGICA DE ORDENACIÓN (NUEVO)
    // ====================================

    window.toggleMaintenanceSortMenu = function () {
        const menu = document.getElementById('maintenance-sort-menu');
        if (menu) {
            menu.classList.toggle('hidden');
            updateSortMenuUI();
        }
    }

    window.refreshAiSort = function () {
        applyAiSorting();
    }

    async function getCoordinatesForAddress(address) {
        // Simple cache
        const cacheKey = `geo_${address}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);

        try {
            // Nominatim OpenStreetMap (Free, requires User-Agent)
            // En produccion se deberia usar un servicio mas robusto o Google Maps Platform
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`, {
                headers: { 'User-Agent': 'PortisApp/1.0' }
            });
            const data = await response.json();
            if (data && data.length > 0) {
                const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                localStorage.setItem(cacheKey, JSON.stringify(coords));
                return coords;
            }
        } catch (e) {
            console.error("Geocoding error", e);
        }
        return null;
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
        const R = 6371; // Radio de la tierra en km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Nueva función dedicada a la lógica de IA para ser reutilizable y estable
    async function applyAiSorting(baseItems) {
        if (!navigator.geolocation) {
            showMessage('error', 'Geolocalización no soportada.');
            window.setMaintenanceSort('priority');
            return;
        }

        // Mostrar estado de carga solo si vamos a tardar
        const listContainer = document.getElementById('monthly-maintenance-list');
        // Solo mostrar spinner si no hay items pintados o si es una acción explícita
        if (listContainer && (baseItems || currentMaintenanceData.length > 0)) {
            listContainer.innerHTML = '<div class="loading-spinner"></div><p class="text-center text-sm text-gray-400 mt-2 animate-pulse">Analizando rutas...</p>';
        }

        const itemsToProcess = baseItems || currentMaintenanceData;

        navigator.geolocation.getCurrentPosition(async (position) => {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;

            // Procesamos una copia para evitar problemas de mutación durante el render
            // Usamos Promise.all para esperar a todas las geocodificaciones
            const processedItems = await Promise.all(itemsToProcess.map(async (item) => {
                // Clonamos item para no mutar el original de currentMaintenanceData inmediatamente si algo falla
                const newItem = { ...item };

                let coords = newItem.coords;
                // Intentar recuperar de cache si no tiene coords (la cache ya la maneja getCoordinatesForAddress pero validamos aqui)
                if (!coords) {
                    coords = await getCoordinatesForAddress(newItem.location);
                    newItem.coords = coords;
                }

                if (coords) {
                    newItem.distance = calculateDistance(userLat, userLon, coords.lat, coords.lon);
                } else {
                    newItem.distance = Infinity;
                }

                // Guardar en cache de sesión
                if (newItem.id) distanceCache[newItem.id] = newItem.distance;

                return newItem;
            }));

            // Actualizamos la referencia global con los items enriquecidos
            currentMaintenanceData = processedItems;

            // Renderizamos FINALMENTE
            renderMaintenanceList(currentMaintenanceData, currentViewDate);

        }, (error) => {
            console.error("Geoloc error:", error);
            showMessage('error', 'Error de ubicación. Volviendo a prioridad.');
            window.setMaintenanceSort('priority');
        });
    }

    window.setMaintenanceSort = async function (method) {
        currentSortMethod = method;
        localStorage.setItem('portis-maintenance-sort', method);

        // Ocultar menú
        const menu = document.getElementById('maintenance-sort-menu');
        if (menu) menu.classList.add('hidden');
        updateSortMenuUI();

        if (method === 'ai') {
            await applyAiSorting(); // Usamos los datos actuales
        } else {
            // Métodos síncronos (priority, location)
            renderMaintenanceList(currentMaintenanceData, currentViewDate);
        }
    }

    function updateSortMenuUI() {
        // Actualizar checkmarks visuales
        const checkPriority = document.getElementById('sort-check-priority');
        const checkLocation = document.getElementById('sort-check-location');
        const checkAi = document.getElementById('sort-check-ai');

        if (checkPriority) checkPriority.classList.toggle('active', currentSortMethod === 'priority');
        if (checkLocation) checkLocation.classList.toggle('active', currentSortMethod === 'location');
        if (checkAi) checkAi.classList.toggle('active', currentSortMethod === 'ai');

        if (checkPriority) checkPriority.classList.toggle('opacity-0', currentSortMethod !== 'priority');
        if (checkLocation) checkLocation.classList.toggle('opacity-0', currentSortMethod !== 'location');
        if (checkAi) checkAi.classList.toggle('opacity-0', currentSortMethod !== 'ai');

        // Botón Refresh
        const refreshBtn = document.getElementById('ai-refresh-btn');
        if (refreshBtn) {
            if (currentSortMethod === 'ai') refreshBtn.classList.remove('hidden');
            else refreshBtn.classList.add('hidden');
        }
    }
    // Cerrar menú si se hace click fuera
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('maintenance-sort-menu');
        const btn = document.querySelector('button[title="Organizar"]'); // Selector un poco frágil pero funcional por ahora

        if (menu && !menu.classList.contains('hidden')) {
            if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
                menu.classList.add('hidden');
            }
        }
    });

    // Listener para búsqueda en tiempo real
    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('maintenance-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = currentMaintenanceData.filter(item =>
                    item.location.toLowerCase().includes(term) ||
                    (item.description && item.description.toLowerCase().includes(term))
                );
                renderMaintenanceList(filtered, currentViewDate);
            });
        }
    });

    // ====================================
    // 4. INICIALIZACIÓN
    // ====================================

    function initMaintenance() {
        // Aplicar tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        setupFirebase().then(() => {
            window.fetchMaintenanceData();
        });
    }

    // Exponer acciones de mantenimiento para Buttons.js
    window.MaintenanceActions = {
        prevMonth: () => {
            // Implementar si se añade navegación por meses en el futuro
        },
        nextMonth: () => {
            // Implementar si se añade navegación por meses en el futuro
        }
    };

    // Hacer la función de inicialización global
    window.initMaintenanceView = initMaintenance;

    // ===================================================================================
    // FUNCIONES DEL MODAL DE DETALLES
    // ===================================================================================

    let currentEditMaintenanceId = null;

    function hideMaintenanceModal() {
        const modal = document.getElementById('maintenance-detail-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    function getFormattedDate(month, year) {
        const date = new Date(year, month - 1);
        return date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    }

    function generateMaintenanceModalContent(item, isEditMode) {
        const priority = item.priority || 'Media';
        const status = isEditMode ? (item.status || 'Pendiente') : 'En Progreso';
        const maintenanceDate = getFormattedDate(item.maintenance_month, item.maintenance_year);
        const contact = item.contact || {};

        // Helper para inputs (MODIFICADO: Usando clases CSS)
        const baseInput = (id, label, value, readOnly = true, type = 'text', customClass = 'minimal-input') => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="modal-detail-label">${label}</span>
                    <p class="modal-detail-value">${value || '---'}</p>
                </div>
                `;
            }
            return `
            <div class="space-y-1">
                <label for="${id}" class="modal-detail-label">${label}</label>
                <input id="${id}" type="${type}" value="${value || ''}" 
                        class="${customClass} w-full border-accent-magenta">
            </div>
            `;
        };

        const baseTextarea = (id, label, value, readOnly = true, rows = 2, customClass = 'minimal-input') => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="modal-detail-label">${label}</span>
                    <p class="modal-detail-value italic whitespace-pre-wrap">${value || '---'}</p>
                </div>
                `;
            }
            return `
            <div class="space-y-1">
                <label for="${id}" class="modal-detail-label">${label}</label>
                <textarea id="${id}" rows="${rows}" 
                        class="${customClass} w-full resize-none border-accent-magenta">${value || ''}</textarea>
            </div>
            `;
        };

        const prioritySelect = (priorityValue, readOnly = true) => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="modal-detail-label">Prioridad</span>
                    <p class="modal-detail-value">${priorityValue}</p>
                </div>
                `;
            }
            const options = ['Alta', 'Media', 'Baja'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${priorityValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            return `
            <div class="space-y-1">
                <label for="edit-priority" class="modal-detail-label">Prioridad</label>
                <select id="edit-priority" class="minimal-input w-full border-accent-magenta">
                    ${optionHtml}
                </select>
            </div>
            `;
        };

        const contractSelect = (contractValue, readOnly = true) => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="modal-detail-label">Contrato</span>
                    <p class="modal-detail-value">${contractValue}</p>
                </div>
                `;
            }
            const options = ['Mensual', 'Bimensual', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${contractValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            return `
                <div class="space-y-1">
                    <label for="edit-contract" class="modal-detail-label">Contrato</label>
                    <select id="edit-contract" class="minimal-input w-full border-accent-magenta">
                        ${optionHtml}
                    </select>
                </div>
            `;
        };

        let bodyContent = '';
        if (!isEditMode) {
            // MODO VISTA
            bodyContent = `
            <div class="p-6 space-y-4 relative">
                <!-- Botones Superiores -->
                <div class="flex justify-between items-center mb-2">
                    <button id="close-maintenance-modal-btn" class="secondary-icon-btn p-2 rounded-full">
                        <i class="ph ph-x text-xl"></i>
                    </button>
                    <button id="edit-toggle-btn" class="text-accent-magenta hover:text-accent-magenta/80 transition-colors p-2 rounded-full hover:bg-accent-magenta/10 border border-accent-magenta/30 hover:border-accent-magenta">
                        <i class="ph ph-pencil-simple text-xl"></i>
                    </button>
                </div>

                <div class="flex justify-between items-start">
                    <h3 class="text-xl font-bold text-accent-magenta">${item.location}</h3>
                    <span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800">${status}</span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm mt-4">
                    ${baseInput('view-date', 'Fecha Prevista', maintenanceDate)}
                    ${baseInput('view-model', 'Modelo', item.model)}
                    ${contractSelect(item.contract)}
                    ${baseInput('view-key', 'ID Clave/TAG', item.key_id)}
                    ${prioritySelect(priority)}
                    ${baseInput('view-status', 'Estado', status)}
                </div>
    
                ${item.description ? baseTextarea('view-desc', 'Observaciones', item.description) : ''}
                
                ${item.breakdown ? `
                    <div class="space-y-1">
                        <span class="modal-detail-label text-red-400">Avería</span>
                        <p class="modal-detail-value italic whitespace-pre-wrap text-red-300 border-l-2 border-red-500 pl-2">${item.breakdown}</p>
                    </div>
                ` : ''}
    
                ${(contact.name || contact.phone) ? `
                    <div class="pt-4 border-t" style="border-color: var(--color-border);">
                        <h4 class="text-sm font-bold mb-2 uppercase" style="color: var(--color-text-secondary);">Contacto</h4>
                        <div class="grid grid-cols-2 gap-4">
                            ${baseInput('view-contact-name', 'Nombre', contact.name)}
                            ${baseInput('view-contact-phone', 'Teléfono', contact.phone)}
                        </div>
                    </div>
                ` : ''}
            </div>
            `;
        } else {
            // MODO EDICION
            bodyContent = `
            <div class="p-6 space-y-4">
                <h3 class="text-xl font-bold mb-4" style="color: var(--color-text-primary);">Editar Mantenimiento</h3>
                
                ${baseInput('edit-location', 'Ubicación', item.location, false)}
                
                <div class="grid grid-cols-2 gap-4">
                    ${baseInput('edit-model', 'Modelo', item.model, false)}
                    ${baseInput('edit-key', 'ID Clave/TAG', item.key_id, false)}
                    ${prioritySelect(priority, false)}
                    ${contractSelect(item.contract, false)}
                </div>
    
                ${baseTextarea('edit-desc', 'Observaciones', item.description, false, 3)}
                ${baseTextarea('edit-breakdown', 'Avería', item.breakdown, false, 3)}
    
                <div class="pt-4 border-t" style="border-color: var(--color-border);">
                    <h4 class="text-sm font-bold mb-2 uppercase" style="color: var(--color-text-secondary);">Contacto</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${baseInput('edit-contact-name', 'Nombre', contact.name, false)}
                        ${baseInput('edit-contact-phone', 'Teléfono', contact.phone, false)}
                    </div>
                </div>
            </div>
            `;
        }

        // Footer con botones
        const footerContent = `
            <div class="modal-footer">
                ${!isEditMode ? `
                    <button onclick="window.confirmCompleteMaintenance('${item.id}')" class="primary-btn w-full py-3 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-accent-magenta/20">
                        <i class="ph ph-check-circle text-xl"></i> 
                        <span class="text-lg">Completar Tarea</span>
                    </button>
                ` : `
                    <button id="edit-toggle-btn" class="secondary-btn rounded-lg">Cancelar</button>
                    <button id="save-edit-btn" class="primary-btn px-6 py-2 rounded-lg">Guardar</button>
                `}
            </div>
        `;

        return bodyContent + footerContent;
    }


    function showMaintenanceDetailsModal(item, isEditMode = false) {
        currentEditMaintenanceId = item.id;
        const modal = document.getElementById('maintenance-detail-modal');

        if (!modal) {
            createMaintenanceModalElement();
            return showMaintenanceDetailsModal(item, isEditMode);
        }

        modal.querySelector('.modal-content').innerHTML = generateMaintenanceModalContent(item, isEditMode);

        // Asignar eventos
        const closeBtn = document.getElementById('close-maintenance-modal-btn');
        if (closeBtn) closeBtn.onclick = hideMaintenanceModal;

        const editBtn = document.getElementById('edit-toggle-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                showMaintenanceDetailsModal(item, !isEditMode);
            };
        }

        const saveBtn = document.getElementById('save-edit-btn');
        if (saveBtn) {
            saveBtn.onclick = saveEditedMaintenance;
        }

        if (isEditMode) {
            configureMaintenanceEditInputs(item);
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function configureMaintenanceEditInputs(item) {
        // Lógica adicional para inputs complejos si fuera necesaria
    }

    async function saveEditedMaintenance() {
        const id = currentEditMaintenanceId;
        if (!id) return;

        const contactName = document.getElementById('edit-contact-name').value.trim() || null;
        const contactPhone = document.getElementById('edit-contact-phone').value.trim() || null;

        const newValues = {
            location: document.getElementById('edit-location').value.trim(),
            model: document.getElementById('edit-model').value.trim() || null,
            contract: document.getElementById('edit-contract').value.trim(),
            key_id: document.getElementById('edit-key').value.trim() || null,
            priority: document.getElementById('edit-priority').value,
            description: document.getElementById('edit-desc').value.trim(),
            breakdown: document.getElementById('edit-breakdown').value.trim(),
            contact: (contactName || contactPhone) ? {
                name: contactName,
                phone: contactPhone
            } : null
        };

        // Regla: Si hay avería, la prioridad sube a Alta automáticamente
        if (newValues.breakdown) {
            newValues.priority = 'Alta';
        }

        if (!newValues.location || !newValues.contract) {
            showMessage('error', 'Ubicación y Contrato son obligatorios.');
            return;
        }

        try {
            if (!isFirebaseReady) {
                // Handle not ready
            } else {
                // MODO FIREBASE
                const repairsRef = getRepairsCollectionRef();
                if (!repairsRef) {
                    throw new Error("No se pudo obtener referencia a la colección de reparaciones.");
                }

                await repairsRef.doc(id).update(newValues);
                showMessage('success', 'Mantenimiento actualizado correctamente en la nube.');
                hideMaintenanceModal();
                window.fetchMaintenanceData();
            }
        } catch (error) {
            showMessage('error', 'Error al guardar los cambios.');
        }
    }

    function createMaintenanceModalElement() {
        if (document.getElementById('maintenance-detail-modal')) return;

        const modalHtml = `
            <div id="maintenance-detail-modal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-70 flex justify-center items-center p-4 transition-opacity duration-300 modal-backdrop">
                <div class="modal-content w-full max-w-lg rounded-xl shadow-2xl relative transition-transform duration-300 overflow-hidden"
                    style="background-color: var(--color-bg-secondary); color: var(--color-text-primary); max-height: 90vh; overflow-y: auto;">
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

})();
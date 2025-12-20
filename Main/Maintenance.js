// ===================================================================================
// Maintenance.js - Lógica de la Vista de Mantenimientos (Pendientes)
// ===================================================================================

// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito

    // ====================================
    // 1. CONFIGURACIÓN Y ESTADO GLOBAL
    // ====================================

    let isFirebaseReady = false;
    let db = null;
    let userId = null;
    let currentMaintenanceData = [];
    let currentViewDate = new Date();
    let currentSortMethod = localStorage.getItem('portis-maintenance-sort') || 'priority';
    let selectedMaterialsByTask = {}; // Objeto para guardar materiales por ID de tarea

    // Cache de distancias para evitar recalcular
    let distanceCache = {};

    // --- PERSISTENCIA LOCAL DE MATERIALES ---
    function saveMaterialsToLocal() {
        if (!userId) return;
        localStorage.setItem(`portis-maint-materials-${userId}`, JSON.stringify(selectedMaterialsByTask));
    }

    function loadMaterialsFromLocal() {
        if (!userId) return;
        const saved = localStorage.getItem(`portis-maint-materials-${userId}`);
        if (saved) {
            try {
                selectedMaterialsByTask = JSON.parse(saved);
                console.log("[Maintenance] Materiales cargados de localStorage:", selectedMaterialsByTask);
            } catch (e) {
                console.error("Error parsing materials from local:", e);
                selectedMaterialsByTask = {};
            }
        }
    }

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
            loadMaterialsFromLocal(); // Cargar materiales guardados
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

            // Consultamos tanto 'Pendiente' como 'En Progreso'
            // Firestore no soporta 'IN' con array grande facilmente en v8, hacemos dos queries o client-side filtering.
            // Dado que el volumen de repairs activas no deberia ser gigante, traemos las que no son 'Completado' o filtramos.
            // Mejor strategy: Traer todo lo que NO sea 'Completado' (si existiera estado) o status 'in' ['Pendiente', 'En Progreso']
            const snapshot = await repairsRef
                .where('status', 'in', ['Pendiente', 'En Progreso'])
                .get();

            const maintenanceList = [];
            const batch = db.batch(); // Para actualizaciones automáticas
            let batchCount = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const itemMonth = data.maintenance_month;
                const itemYear = data.maintenance_year;
                const currentStatus = data.status;

                let shouldBeInProgress = (itemMonth === targetMonth && itemYear === targetYear);

                // Lógica de transición de estado
                // 1. Si debería estar En Progreso (es este mes) y está Pendiente -> Actualizar a En Progreso
                if (shouldBeInProgress && currentStatus === 'Pendiente') {
                    batch.update(doc.ref, { status: 'En Progreso' });
                    data.status = 'En Progreso'; // Actualizamos localmente
                    batchCount++;
                }
                // 2. Si NO debería estar En Progreso (es otro mes) y está En Progreso -> Volver a Pendiente
                else if (!shouldBeInProgress && currentStatus === 'En Progreso') {
                    batch.update(doc.ref, { status: 'Pendiente' });
                    data.status = 'Pendiente'; // Actualizamos localmente
                    batchCount++;
                }

                // Filtrar para la vista: Solo mostramos los que coinciden con el mes objetivo
                if (itemMonth === targetMonth && itemYear === targetYear) {
                    maintenanceList.push({ id: doc.id, ...data });
                }
            });

            if (batchCount > 0) {
                await batch.commit();
                console.log(`[Maintenance] Actualizados ${batchCount} registros de estado.`);
            }

            return maintenanceList;

        } catch (error) {
            console.error("Error fetching/updating maintenance:", error);
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
            // Si el método es 'ai' o 'location', aplicamos distancias CACHEADAS si existen
            if (currentSortMethod === 'ai' || currentSortMethod === 'location') {
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

        // DEBUG: Verificar método de ordenación
        console.log('[Maintenance] Current sort method:', currentSortMethod);

        // Limpiar modificadores expirados antes de ordenar
        if (window.IA) window.IA.cleanExpiredModifiers();

        // ============================================================================
        // SISTEMA DE ORDENACIÓN CON TRES GRUPOS: ADELANTAR / NORMAL / APLAZAR
        // ============================================================================

        // Lógica de ordenación dinámica
        if (currentSortMethod === 'ai' && window.IA) {
            // Pre-calcular puntajes para visualización y ordenamiento
            console.log('%c[Maintenance IA] Calculando puntuaciones...', 'color: #ff00ff; font-weight: bold');

            data.forEach(item => {
                item._tempScore = window.IA.calculateSmartScore(item, currentDate);
            });

            // SEPARAR EN TRES GRUPOS
            const adelantadas = [];
            const normales = [];
            const aplazadas = [];

            data.forEach(item => {
                const modifier = window.IA.modifiers[item.id];

                if (modifier && modifier.type === 'adelantar') {
                    adelantadas.push(item);
                } else if (modifier && modifier.type === 'aplazar') {
                    aplazadas.push(item);
                } else {
                    normales.push(item);
                }
            });

            // Ordenar cada grupo por puntuación
            adelantadas.sort((a, b) => b._tempScore - a._tempScore);
            normales.sort((a, b) => b._tempScore - a._tempScore);
            aplazadas.sort((a, b) => b._tempScore - a._tempScore);

            // Combinar: adelantadas primero, normales en medio, aplazadas al final
            const sortedData = [...adelantadas, ...normales, ...aplazadas];

            // Reemplazar el array original con el ordenado
            data.length = 0;
            data.push(...sortedData);

            // Log detallado después de ordenar
            console.log('%c[Maintenance AI] Ruta optimizada:', 'color: #00ff00; font-weight: bold');

            if (adelantadas.length > 0) {
                console.log(`%c📌 ADELANTADAS (${adelantadas.length}):`, 'color: #00ff00; font-weight: bold; font-size: 14px');
            }

            data.forEach((item, index) => {
                const breakdown = item._scoreBreakdown || {};
                const modifier = window.IA ? window.IA.modifiers[item.id] : null;

                let prefix = '  ';
                if (modifier && modifier.type === 'adelantar') {
                    prefix = '📌 ';
                } else if (modifier && modifier.type === 'aplazar') {
                    prefix = '⏸️ ';
                }

                // Separador visual entre grupos
                if (index === adelantadas.length && adelantadas.length > 0) {
                    console.log(`%c━━━ NORMALES (${normales.length}) ━━━`, 'color: #ffff00; font-weight: bold; font-size: 14px');
                }
                if (index === adelantadas.length + normales.length && aplazadas.length > 0) {
                    console.log(`%c━━━ APLAZADAS (${aplazadas.length}) ━━━`, 'color: #ff0000; font-weight: bold; font-size: 14px');
                }

                console.log(
                    `%c${prefix}${index + 1}. ${item.location} %c(${item._tempScore} pts)`,
                    'color: #00ffff; font-weight: bold',
                    'color: #ff00ff; font-weight: bold'
                );
                console.log(
                    `   📍 Prioridad: ${breakdown.priority || 0} | ` +
                    `⚠️ Avería: ${breakdown.breakdown || 0} | ` +
                    `📝 Obs: ${breakdown.observations || 0} | ` +
                    `📄 Contrato: ${breakdown.contract || 0}`
                );
                console.log(
                    `   ⏰ Tiempo: ${breakdown.time || 0} (${breakdown.monthsSince || 0} meses) | ` +
                    `🚗 Distancia: ${breakdown.distanceToStart || 0} (${breakdown.distanceKm || 'N/A'} km) | ` +
                    `🗺️ Cluster: ${breakdown.clustering || 0} (${breakdown.nearestNeighborKm || 'N/A'} km)`
                );
                console.log(
                    `   🕐 Horario: ${breakdown.openingHours || 0} (${breakdown.openingHoursStatus || '⚪ Sin horario'}) | ` +
                    `📅 Programado: ${breakdown.scheduled || 0} (${breakdown.scheduledStatus || '⚪ Sin programar'})`
                );

                if (modifier) {
                    if (modifier.type === 'adelantar') {
                        console.log(`   %c🚀 ADELANTADA - Posición fija al inicio`, 'color: #00ff00; font-weight: bold');
                    } else if (modifier.type === 'aplazar') {
                        const timestamp = new Date(modifier.timestamp);
                        const now = new Date();
                        const hoursLeft = 12 - ((now - timestamp) / (60 * 60 * 1000));
                        console.log(`   %c⏸️ APLAZADA - ${hoursLeft.toFixed(1)}h restantes`, 'color: #ff0000; font-weight: bold');
                    }
                }

                console.log('   ─────────────────────────────────────────');
            });

        } else if (currentSortMethod === 'location') {
            // En modo location, también calculamos el score para mostrarlo (opcional)
            data.forEach(item => {
                if (window.IA) {
                    item._tempScore = window.IA.calculateSmartScore(item, currentDate);
                }
            });

            // SEPARAR EN TRES GRUPOS también en modo location
            const adelantadas = [];
            const normales = [];
            const aplazadas = [];

            data.forEach(item => {
                const modifier = window.IA ? window.IA.modifiers[item.id] : null;

                if (modifier && modifier.type === 'adelantar') {
                    adelantadas.push(item);
                } else if (modifier && modifier.type === 'aplazar') {
                    aplazadas.push(item);
                } else {
                    normales.push(item);
                }
            });

            // Ordenar cada grupo por distancia
            const sortByDistance = (a, b) => {
                const distA = a.distance !== undefined ? a.distance : Infinity;
                const distB = b.distance !== undefined ? b.distance : Infinity;
                return distA - distB;
            };

            adelantadas.sort(sortByDistance);
            normales.sort(sortByDistance);
            aplazadas.sort(sortByDistance);

            // Combinar grupos
            const sortedData = [...adelantadas, ...normales, ...aplazadas];
            data.length = 0;
            data.push(...sortedData);

            console.log('[Maintenance] Ordenado por distancia (con grupos adelantar/aplazar)');

        } else {
            // Por Prioridad (Default) - No calculamos score pero SÍ respetamos grupos
            console.log('[Maintenance] Priority mode');

            const adelantadas = [];
            const normales = [];
            const aplazadas = [];

            data.forEach(item => {
                const modifier = window.IA ? window.IA.modifiers[item.id] : null;

                if (modifier && modifier.type === 'adelantar') {
                    adelantadas.push(item);
                } else if (modifier && modifier.type === 'aplazar') {
                    aplazadas.push(item);
                } else {
                    normales.push(item);
                }
            });

            // Ordenar cada grupo por prioridad
            const sortByPriority = (a, b) => {
                const priorityOrder = { 'Alta': 1, 'Media': 2, 'Baja': 3 };
                const pA = priorityOrder[a.priority] || 99;
                const pB = priorityOrder[b.priority] || 99;
                if (pA !== pB) return pA - pB;
                return a.location.localeCompare(b.location);
            };

            adelantadas.sort(sortByPriority);
            normales.sort(sortByPriority);
            aplazadas.sort(sortByPriority);

            // Combinar grupos
            const sortedData = [...adelantadas, ...normales, ...aplazadas];
            data.length = 0;
            data.push(...sortedData);
        }

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
                <h3 class="font-bold text-lg leading-tight pr-12">
                    ${item.location}
                </h3>
                <div class="flex gap-1.5 items-center">
                    ${item.isScheduled ? `
                        <i class="ph ph-calendar-check text-blue-500 text-xl" title="Programado"></i>
                    ` : ''}
                    ${window.IA && window.IA.modifiers && window.IA.modifiers[item.id] ? `
                        <i class="ph ph-hourglass-high text-orange-500 text-xl animate-pulse-subtle" title="Ajustado por IA"></i>
                    ` : ''}
                </div>
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
                ${item.preferred_schedule && item.preferred_schedule !== 'Cualquiera' ? `
                <div class="flex items-center gap-1 text-accent-blue">
                    <i class="ph ph-calendar-check"></i>
                    <span>${item.preferred_schedule}</span>
                </div>` : ''}
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
                <span class="text-xs text-gray-400">
                    ID: ${item.key_id || '---'} 
                    ${(item._tempScore !== undefined && item._tempScore !== null && sessionStorage.getItem('portis-user-display-name') === 'Administrador') ?
                `<span class="text-accent-magenta font-bold ml-2" title="Puntuación IA: ${item._tempScore}">(${Math.round(item._tempScore)} pts)</span>` :
                ((currentSortMethod === 'ai' || currentSortMethod === 'location') && sessionStorage.getItem('portis-user-display-name') === 'Administrador' ?
                    `<span class="text-yellow-500 font-bold ml-2" title="Score no calculado">(?)</span>` : '')}
                </span>
                
                <div class="flex items-center gap-2">
                    <button class="text-blue-500 hover:text-white hover:bg-blue-500 p-1.5 rounded-full transition-colors" 
                            onclick="event.stopPropagation(); window.openScheduleModal('${item.id}', '${item.location.replace(/'/g, "\\'")}', '${item.description || ''}', '${item.breakdown || ''}')" title="Programar en Calendar">
                        <i class="ph ph-calendar-plus text-lg"></i>
                    </button>
                    ${currentSortMethod === 'ai' && window.IA ? (() => {
                const mod = window.IA.modifiers[item.id];
                const modType = mod ? mod.type : 'normal';
                let iconColorClass = 'text-orange-500'; // Default/Normal
                let icon = 'ph-hourglass-medium'; // Default icon

                if (modType === 'adelantar') {
                    iconColorClass = 'text-green-500 font-bold';
                    icon = 'ph-arrow-up';
                } else if (modType === 'aplazar') {
                    iconColorClass = 'text-red-500 font-bold';
                    icon = 'ph-arrow-down';
                }

                return `
                        <button class="${iconColorClass} hover:text-white p-1.5 rounded-full transition-colors relative" 
                                onclick="event.stopPropagation(); IA.openScoreMenu(event, '${item.id}')" title="Ajustar Prioridad IA">
                            <i class="ph ${icon} text-lg"></i>
                        </button>
                        `;
            })() : ''}
                    <button class="text-accent-magenta hover:text-white hover:bg-accent-magenta p-1.5 rounded-full transition-colors" 
                            onclick="event.stopPropagation(); window.openMaintenanceMap('${item.location}')" title="Ver Mapa">
                        <i class="ph ph-map-pin text-lg"></i>
                    </button>
                </div>
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

            // LIMPIEZA DE PROGRAMACIÓN
            // Al completar, el mantenimiento pasa al siguiente ciclo, por lo que borramos la programación actual tarjeta
            if (repair.isScheduled) {
                updates.scheduledDate = firebase.firestore.FieldValue.delete();
                updates.scheduledTime = firebase.firestore.FieldValue.delete();
                updates.scheduledDateTime = firebase.firestore.FieldValue.delete();
                updates.isScheduled = false;
            }

            // Update en Firebase
            if (isFirebaseReady) {
                const batch = db.batch();
                const repairRef = getRepairsCollectionRef().doc(id);
                const historyRef = db.collection(`users/${userId}/history`).doc();

                batch.update(repairRef, updates);
                batch.set(historyRef, historyRecord);

                // --- DESCONTAR MATERIAL DEL INVENTARIO ---
                const taskMaterials = selectedMaterialsByTask[id] || [];
                if (taskMaterials.length > 0) {
                    for (const mat of taskMaterials) {
                        try {
                            const materialRef = db.collection(`users/${userId}/inventory`).doc(mat.id);
                            const matDoc = await materialRef.get();
                            if (matDoc.exists) {
                                const currentStock = matDoc.data().stock || 0;
                                batch.update(materialRef, {
                                    stock: Math.max(0, currentStock - 1)
                                });

                                if (window.addMaterialToUsage) {
                                    window.addMaterialToUsage(mat.name, 1, repair.location);
                                }
                            }
                        } catch (e) { console.error("Error deducting material:", e); }
                    }
                }

                // ACTUALIZAR EVENTO CALENDAR (Para que quede constancia)
                if (repair.isScheduled) {
                    const calendarRef = db.collection(`users/${userId}/calendar`);
                    const eventQuery = await calendarRef.where('maintenanceId', '==', id).get();

                    eventQuery.forEach(doc => {
                        // Cambiamos el tipo a 'mantenimiento_completado' para que quede en el historial visual
                        // y actualizamos el estilo visual en Calendar.js si es necesario
                        batch.update(doc.ref, {
                            type: 'mantenimiento_completado',
                            completedAt: new Date(),
                            status: 'completed'
                        });
                    });
                }

                await batch.commit();
            }

            showMessage('success', 'Mantenimiento completado.');

            // Resetear modificador IA si existe
            if (window.IA && window.IA.modifiers[id]) {
                delete window.IA.modifiers[id];
                window.IA.saveModifiers();
            }

            hideMaintenanceModal();

            // Limpiar materiales SOLO de esta tarea específica al completar
            delete selectedMaterialsByTask[id];
            currentEditMaintenanceId = null;
            saveMaterialsToLocal(); // Guardar cambios en local

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


    // ====================================\n    // LÓGICA DE ORDENACIÓN (NUEVO)\n    // ====================================\n
    window.toggleMaintenanceSortMenu = function () {
        const menu = document.getElementById('maintenance-sort-menu');
        if (menu) {
            menu.classList.toggle('hidden');
            updateSortMenuUI();
        }
    }

    window.refreshAiSort = function () {
        enrichMaintenanceData();
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

    // Función unificada para enriquecer datos (Geo + Historial) según el modo
    async function enrichMaintenanceData(baseItems) {
        if (!navigator.geolocation) {
            showMessage('error', 'Geolocalización no soportada.');
            window.setMaintenanceSort('priority');
            return;
        }

        const mode = currentSortMethod; // 'location' or 'ai'

        // Mostrar estado de carga
        const listContainer = document.getElementById('monthly-maintenance-list');
        if (listContainer && (baseItems || currentMaintenanceData.length > 0)) {
            const msg = mode === 'ai' ? 'Analizando rutas y prioridades...' : 'Calculando distancias...';
            listContainer.innerHTML = `<div class="loading-spinner"></div><p class="text-center text-sm text-gray-400 mt-2 animate-pulse">${msg}</p>`;
        }

        const itemsToProcess = baseItems || currentMaintenanceData;

        // Preparar fetch de historial si es modo AI
        let recentHistoryLocations = new Set();
        if (mode === 'ai' && isFirebaseReady) {
            try {
                // Buscar completados en los ultimos 21 dias
                const date21DaysAgo = new Date();
                date21DaysAgo.setDate(date21DaysAgo.getDate() - 21);

                const historyRef = db.collection(`users/${userId}/history`);
                const snapshot = await historyRef
                    .where('completedAt', '>=', date21DaysAgo)
                    .get(); // Optimize: select only location field if possible but client filtering is ok for small scale

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.location) recentHistoryLocations.add(data.location);
                });
            } catch (err) {
                console.error("Error fetching history for AI sort:", err);
            }
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;

            const processedItems = await Promise.all(itemsToProcess.map(async (item) => {
                const newItem = { ...item };

                // 1. Geolocalización
                let coords = newItem.coords;
                if (!coords) {
                    coords = await getCoordinatesForAddress(newItem.location);
                    newItem.coords = coords;
                }

                if (coords) {
                    newItem.distance = calculateDistance(userLat, userLon, coords.lat, coords.lon);
                } else {
                    newItem.distance = Infinity;
                }
                if (newItem.id) distanceCache[newItem.id] = newItem.distance;

                // 2. Comprobación de Historial (Solo AI)
                if (mode === 'ai') {
                    // Check if location is in recent history
                    newItem.isRecentPenalty = recentHistoryLocations.has(newItem.location);
                } else {
                    newItem.isRecentPenalty = false;
                }

                return newItem;
            }));

            // 3. Calculo de Distancia entre Tarjetas (Nearest Neighbor) - Solo modo AI
            if (mode === 'ai') {
                for (let i = 0; i < processedItems.length; i++) {
                    let minNeighborDist = Infinity;
                    const itemA = processedItems[i];
                    if (itemA.coords) {
                        for (let j = 0; j < processedItems.length; j++) {
                            if (i === j) continue;
                            const itemB = processedItems[j];
                            if (itemB.coords) {
                                const d = calculateDistance(itemA.coords.lat, itemA.coords.lon, itemB.coords.lat, itemB.coords.lon);
                                if (d < minNeighborDist) minNeighborDist = d;
                            }
                        }
                    }
                    itemA.nearestNeighborDistance = minNeighborDist;
                }
            }

            // Actualizar referencia global
            currentMaintenanceData = processedItems;

            // Render
            renderMaintenanceList(currentMaintenanceData, currentViewDate);

        }, (error) => {
            console.error("Geoloc error:", error);
            showMessage('error', 'Error de ubicación.');
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

        if (method === 'ai' || method === 'location') {
            await enrichMaintenanceData();
        } else {
            // Métodos síncronos (priority)
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

        // Botón Refresh (Visible en AI y en Location)
        const refreshBtn = document.getElementById('ai-refresh-btn');
        if (refreshBtn) {
            if (currentSortMethod === 'ai' || currentSortMethod === 'location') refreshBtn.classList.remove('hidden');
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

        // Asegurar que la UI (boton refresh) refleja el estado actual
        updateSortMenuUI();

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
                    <button id="edit-toggle-btn" class="text-accent-magenta hover:text-accent-magenta/80 transition-colors p-2 rounded-full hover:bg-accent-magenta/10 border border-accent-magenta/30 hover:border-accent-magenta">
                        <i class="ph ph-pencil-simple text-xl"></i>
                    </button>
                    <button id="close-maintenance-modal-btn" class="secondary-icon-btn p-2 rounded-full">
                        <i class="ph ph-x text-xl"></i>
                    </button>
                </div>

                <div class="flex justify-between items-start">
                    <h3 class="text-xl font-bold text-accent-magenta">${item.location}</h3>
                    <span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800">${status}</span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm mt-4">
                    ${baseInput('view-date', 'Fecha Prevista', maintenanceDate)}
                    ${item.model ? baseInput('view-model', 'Modelo', item.model) : ''}
                    ${contractSelect(item.contract)}
                    ${item.key_id ? baseInput('view-key', 'ID Clave/TAG', item.key_id) : ''}
                    ${prioritySelect(priority)}
                    ${baseInput('view-status', 'Estado', status)}
                    ${(item.preferred_schedule && item.preferred_schedule !== 'Cualquiera') ? baseInput('view-preferred', 'Horario Pref.', item.preferred_schedule) : ''}
                    ${item.opening_time ? baseInput('view-open', 'Apertura', item.opening_time) : ''}
                    ${item.closing_time ? baseInput('view-close', 'Cierre', item.closing_time) : ''}
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

                <!-- Botón Material Usado -->
                <div class="pt-4 border-t flex flex-col gap-3" style="border-color: var(--color-border);">
                    <div class="flex justify-between items-center">
                        <h4 class="text-sm font-bold uppercase" style="color: var(--color-text-secondary);">Recambios y Materiales</h4>
                        <button onclick="window.openMaterialSelector()" class="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1">
                            <i class="ph ph-plus-circle"></i> AÑADIR MATERIAL
                        </button>
                    </div>
                    <div id="maint-summary-materials" class="flex flex-wrap gap-2">
                         <!-- Aquí se listarán los materiales seleccionados -->
                         <p class="text-[10px] text-gray-500 italic">No se ha añadido material a esta tarea.</p>
                    </div>
                </div>
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

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1">
                        <label for="edit-preferred" class="modal-detail-label">Horario Pref.</label>
                        <select id="edit-preferred" class="minimal-input w-full border-accent-magenta">
                            <option value="Cualquiera" ${item.preferred_schedule === 'Cualquiera' ? 'selected' : ''}>Cualquiera</option>
                            <option value="Mañana" ${item.preferred_schedule === 'Mañana' ? 'selected' : ''}>Mañana</option>
                            <option value="Tarde" ${item.preferred_schedule === 'Tarde' ? 'selected' : ''}>Tarde</option>
                            <option value="Noche" ${item.preferred_schedule === 'Noche' ? 'selected' : ''}>Noche</option>
                        </select>
                    </div>
                    ${baseInput('edit-open', 'Apertura', item.opening_time, false, 'time')}
                    ${baseInput('edit-close', 'Cierre', item.closing_time, false, 'time')}
                </div>
    
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
        // Inicializar array para esta tarea si no existe
        if (!selectedMaterialsByTask[item.id]) {
            selectedMaterialsByTask[item.id] = [];
        }
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

        // Actualizar el resumen visual de materiales
        updateMaintMaterialsSummary();
    }

    // --- LÓGICA DE SELECCIÓN DE MATERIALES ---

    window.openMaterialSelector = function () {
        if (typeof window.showModal === 'function') {
            window.showModal('maint-material-selector-modal');
        } else {
            document.getElementById('maint-material-selector-modal').classList.remove('hidden');
            document.getElementById('maint-material-selector-modal').classList.add('flex');
        }
        renderMaintInventoryList();
    };

    window.filterMaintMaterials = function () {
        const query = document.getElementById('maint-material-search').value.toLowerCase();
        renderMaintInventoryList(query);
    };

    function renderMaintInventoryList(filter = '') {
        const container = document.getElementById('maint-inventory-list');
        if (!container) return;

        const materials = window.getMaterialsForSelection ? window.getMaterialsForSelection() : [];
        const filtered = materials.filter(m => m.name.toLowerCase().includes(filter));

        container.innerHTML = filtered.map(m => `
            <div onclick="window.selectMaterialForMaint('${m.id}', '${m.name.replace(/'/g, "\\'")}')" class="p-2 px-3 flex justify-between items-center bg-white/5 hover:bg-blue-500/20 rounded-lg cursor-pointer transition-all border border-transparent hover:border-blue-500/30">
                <span class="text-xs text-white">${m.name}</span>
                <span class="text-[10px] font-bold text-gray-500">STOCK: ${m.stock || 0}</span>
            </div>
        `).join('') || '<p class="text-[10px] text-gray-500 text-center py-4">No hay materiales en el inventario.</p>';
    }

    window.selectMaterialForMaint = function (id, name) {
        if (!currentEditMaintenanceId) return;
        if (!selectedMaterialsByTask[currentEditMaintenanceId]) {
            selectedMaterialsByTask[currentEditMaintenanceId] = [];
        }
        selectedMaterialsByTask[currentEditMaintenanceId].push({ id, name });
        saveMaterialsToLocal(); // Guardar persistencia
        updateMaintMaterialsSummary();
        renderSelectedMaterialsList();
    };

    function renderSelectedMaterialsList() {
        const container = document.getElementById('maint-selected-materials');
        if (!container || !currentEditMaintenanceId) return;

        const currentMaterials = selectedMaterialsByTask[currentEditMaintenanceId] || [];

        container.innerHTML = currentMaterials.map((m, idx) => `
            <div class="flex justify-between items-center bg-blue-500/10 p-2 rounded-lg border border-blue-500/30">
                <span class="text-[11px] text-white">${m.name}</span>
                <button onclick="window.removeMaterialFromMaint(${idx})" class="text-red-400 p-1"><i class="ph ph-trash"></i></button>
            </div>
        `).join('') || '<p class="text-[10px] text-gray-500 text-center py-2 italic">Ninguno seleccionado.</p>';

        const countBadge = document.getElementById('maint-material-count');
        if (countBadge) countBadge.textContent = `${currentMaterials.length} RECAMBIOS`;
    }

    window.removeMaterialFromMaint = function (index) {
        if (!currentEditMaintenanceId || !selectedMaterialsByTask[currentEditMaintenanceId]) return;
        selectedMaterialsByTask[currentEditMaintenanceId].splice(index, 1);
        saveMaterialsToLocal(); // Guardar persistencia
        renderSelectedMaterialsList();
        updateMaintMaterialsSummary();
    };

    function updateMaintMaterialsSummary() {
        const container = document.getElementById('maint-summary-materials');
        if (!container || !currentEditMaintenanceId) return;

        const currentMaterials = selectedMaterialsByTask[currentEditMaintenanceId] || [];

        if (currentMaterials.length === 0) {
            container.innerHTML = '<p class="text-[10px] text-gray-500 italic">No se ha añadido material a esta tarea.</p>';
            return;
        }

        container.innerHTML = currentMaterials.map(m => `
            <span class="text-[10px] font-bold bg-blue-500/20 text-blue-300 px-2 py-1 rounded inline-flex items-center gap-1 border border-blue-500/30">
                <i class="ph ph-cube"></i> ${m.name}
            </span>
        `).join('');
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
            preferred_schedule: document.getElementById('edit-preferred').value,
            opening_time: document.getElementById('edit-open').value || null,
            closing_time: document.getElementById('edit-close').value || null,
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

    // ====================================
    // PROGRAMACIÓN EN CALENDAR
    // ====================================

    let currentSchedulingMaintenanceId = null;
    let originalScheduledDate = null;
    let originalScheduledTime = null;

    /**
     * Abre el modal para programar un mantenimiento en el calendar
     */
    window.openScheduleModal = function (maintenanceId, location, description, breakdown) {
        currentSchedulingMaintenanceId = maintenanceId;

        // Obtener datos del mantenimiento para ver si ya está programado
        const maintenance = currentMaintenanceData.find(m => m.id === maintenanceId);
        const isAlreadyScheduled = maintenance && maintenance.isScheduled;

        // Guardar valores originales
        originalScheduledDate = maintenance?.scheduledDate || null;
        originalScheduledTime = maintenance?.scheduledTime || null;

        // Mostrar ubicación en el modal
        const locationElement = document.getElementById('schedule-location-name');
        if (locationElement) {
            locationElement.textContent = `📍 ${location}`;
        }

        // Pre-rellenar notas con descripción/avería si existen
        const notesElement = document.getElementById('schedule-notes');
        if (notesElement) {
            let notes = '';
            if (breakdown) notes += `⚠️ AVERÍA: ${breakdown}\n`;
            if (description) notes += `📝 ${description}`;
            notesElement.value = notes.trim();
        }

        // Establecer fecha mínima (hoy)
        const dateInput = document.getElementById('schedule-date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;

            // Si ya está programado, usar esa fecha, sino usar hoy
            dateInput.value = isAlreadyScheduled ? originalScheduledDate : today;

            // Listener para detectar cambios
            dateInput.onchange = updateScheduleButton;
        }

        // Establecer hora
        const timeInput = document.getElementById('schedule-time');
        if (timeInput) {
            if (isAlreadyScheduled) {
                // Usar hora programada
                timeInput.value = originalScheduledTime;
            } else {
                // Hora por defecto (hora actual + 1h)
                const now = new Date();
                now.setHours(now.getHours() + 1);
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                timeInput.value = `${hours}:${minutes}`;
            }

            // Listener para detectar cambios
            timeInput.onchange = updateScheduleButton;
        }

        // Actualizar botón según estado
        updateScheduleButton();

        // Mostrar modal
        const modal = document.getElementById('schedule-maintenance-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    };

    /**
     * Actualiza el botón de programar/desprogramar según el estado
     */
    function updateScheduleButton() {
        const dateInput = document.getElementById('schedule-date');
        const timeInput = document.getElementById('schedule-time');
        const maintenance = currentMaintenanceData.find(m => m.id === currentSchedulingMaintenanceId);

        const currentDate = dateInput?.value;
        const currentTime = timeInput?.value;

        // Verificar si los valores han cambiado
        const hasChanged = currentDate !== originalScheduledDate || currentTime !== originalScheduledTime;
        const isAlreadyScheduled = maintenance && maintenance.isScheduled && !hasChanged;

        // Obtener contenedor del botón
        const buttonContainer = document.querySelector('#schedule-maintenance-modal .flex.gap-3.mt-6');
        if (!buttonContainer) return;

        // Actualizar HTML del botón
        if (isAlreadyScheduled) {
            // Mostrar botón Desprogramar
            buttonContainer.innerHTML = `
                <button onclick="closeModal('schedule-maintenance-modal')"
                    class="secondary-btn w-1/2 rounded-lg">Cancelar</button>
                <button onclick="window.unscheduleMaintenance()"
                    class="primary-btn w-1/2 rounded-lg bg-red-600 hover:bg-red-700">
                    <i class="ph ph-calendar-x mr-2"></i>
                    Desprogramar
                </button>
            `;
        } else {
            // Mostrar botón Programar
            buttonContainer.innerHTML = `
                <button onclick="closeModal('schedule-maintenance-modal')"
                    class="secondary-btn w-1/2 rounded-lg">Cancelar</button>
                <button onclick="window.saveScheduledMaintenance()"
                    class="primary-btn w-1/2 rounded-lg bg-blue-600 hover:bg-blue-700">
                    <i class="ph ph-calendar-check mr-2"></i>
                    Programar
                </button>
            `;
        }
    }

    /**
     * Guarda el mantenimiento programado en Calendar
     */
    window.saveScheduledMaintenance = async function () {
        if (!currentSchedulingMaintenanceId) return;

        const dateInput = document.getElementById('schedule-date');
        const timeInput = document.getElementById('schedule-time');
        const notesInput = document.getElementById('schedule-notes');

        if (!dateInput.value || !timeInput.value) {
            showMessage('error', 'Fecha y hora son obligatorios');
            return;
        }

        try {
            // Obtener datos del mantenimiento
            const maintenance = currentMaintenanceData.find(m => m.id === currentSchedulingMaintenanceId);
            if (!maintenance) {
                showMessage('error', 'Mantenimiento no encontrado');
                return;
            }

            // Crear timestamp del evento
            const scheduledDateTime = new Date(`${dateInput.value}T${timeInput.value}`);

            // Preparar datos del evento para Calendar
            const eventData = {
                userId: userId,
                date: dateInput.value,
                type: 'mantenimiento_programado',
                hours: 0, // No es evento de horas extra
                maintenanceId: currentSchedulingMaintenanceId,
                maintenanceLocation: maintenance.location,
                scheduledTime: timeInput.value,
                scheduledDateTime: firebase.firestore.Timestamp.fromDate(scheduledDateTime),
                notes: notesInput.value || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Guardar en Firestore (colección calendar del usuario)
            // IMPORTANTE: Calendar.js lee de la colección 'calendar', no 'events'
            const eventsRef = window.db.collection(`users/${userId}/calendar`);
            await eventsRef.add(eventData);

            // Actualizar el mantenimiento con la info de programación
            const repairsRef = getRepairsCollectionRef();
            if (repairsRef) {
                await repairsRef.doc(currentSchedulingMaintenanceId).update({
                    scheduledDate: dateInput.value,
                    scheduledTime: timeInput.value,
                    scheduledDateTime: firebase.firestore.Timestamp.fromDate(scheduledDateTime),
                    isScheduled: true
                });
            }

            showMessage('success', '✅ Mantenimiento programado en Calendar');

            // Cerrar modal
            window.closeModal('schedule-maintenance-modal');

            // Recargar datos para actualizar scoring
            if (typeof window.fetchMaintenanceData === 'function') {
                window.fetchMaintenanceData();
            }

        } catch (error) {
            console.error('Error al programar mantenimiento:', error);
            showMessage('error', 'Error al programar mantenimiento');
        }
    };

    /**
     * Desprograma un mantenimiento eliminando el evento de Calendar
     */
    window.unscheduleMaintenance = async function () {
        if (!currentSchedulingMaintenanceId) return;

        try {
            const maintenance = currentMaintenanceData.find(m => m.id === currentSchedulingMaintenanceId);
            if (!maintenance) {
                showMessage('error', 'Mantenimiento no encontrado');
                return;
            }

            // Eliminar evento de Calendar si existe
            if (maintenance.scheduledDate) {
                // Usar colección 'calendar' para que coincida con lo que creamos
                const eventsRef = window.db.collection(`users/${userId}/calendar`);
                const querySnapshot = await eventsRef
                    .where('maintenanceId', '==', currentSchedulingMaintenanceId)
                    .get();

                // Eliminar todos los eventos relacionados
                const deletePromises = [];
                querySnapshot.forEach(doc => {
                    deletePromises.push(doc.ref.delete());
                });
                await Promise.all(deletePromises);
            }

            // Actualizar el mantenimiento eliminando campos de programación
            const repairsRef = getRepairsCollectionRef();
            if (repairsRef) {
                await repairsRef.doc(currentSchedulingMaintenanceId).update({
                    scheduledDate: firebase.firestore.FieldValue.delete(),
                    scheduledTime: firebase.firestore.FieldValue.delete(),
                    scheduledDateTime: firebase.firestore.FieldValue.delete(),
                    isScheduled: false
                });
            }

            showMessage('success', '✅ Mantenimiento desprogramado');

            // Cerrar modal
            window.closeModal('schedule-maintenance-modal');

            // Recargar datos
            if (typeof window.fetchMaintenanceData === 'function') {
                window.fetchMaintenanceData();
            }

        } catch (error) {
            console.error('Error al desprogramar mantenimiento:', error);
            showMessage('error', 'Error al desprogramar mantenimiento');
        }
    };

})();
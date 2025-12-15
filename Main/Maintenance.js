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
    let customScoreModifiers = {}; // Almacenar modificadores de puntaje manuales: { id: scoreDelta }

    // Init customScoreModifiers from LocalStorage
    try {
        const storedModifiers = localStorage.getItem('portis-maintenance-modifiers');
        if (storedModifiers) {
            customScoreModifiers = JSON.parse(storedModifiers);
        }
    } catch (e) {
        console.error("Error loading modifiers from storage", e);
    }

    // Helper to persist modifiers
    function saveModifiersToStorage() {
        localStorage.setItem('portis-maintenance-modifiers', JSON.stringify(customScoreModifiers));
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

        // ============================================================================
        // SISTEMA DE PUNTUACIÓN AVANZADO PARA OPTIMIZACIÓN DE RUTAS
        // ============================================================================

        /**
         * Calcula el tiempo transcurrido desde el último mantenimiento en meses
         * @param {Object} item - Item de mantenimiento
         * @param {Date} currentDate - Fecha actual de referencia
         * @returns {number} - Meses desde el último mantenimiento
         */
        function getMonthsSinceLastMaintenance(item, currentDate) {
            const currentMonth = currentDate.getMonth() + 1; // 1-12
            const currentYear = currentDate.getFullYear();

            const itemMonth = item.maintenance_month;
            const itemYear = item.maintenance_year;

            // Calcular diferencia en meses
            const monthsDiff = (currentYear - itemYear) * 12 + (currentMonth - itemMonth);

            return monthsDiff;
        }

        /**
         * Calcula la puntuación por tiempo transcurrido según el tipo de contrato
         * Sistema progresivo que aumenta la prioridad cuanto más tiempo pasa
         * @param {Object} item - Item de mantenimiento
         * @param {number} monthsSince - Meses desde el último mantenimiento
         * @returns {number} - Puntos por tiempo transcurrido
         */
        function calculateTimeScore(item, monthsSince) {
            let points = 0;

            // Determinar el intervalo esperado según el contrato
            let expectedInterval = 1; // Default mensual
            switch (item.contract) {
                case 'Mensual': expectedInterval = 1; break;
                case 'Bimensual': expectedInterval = 2; break;
                case 'Trimestral': expectedInterval = 3; break;
                case 'Cuatrimestral': expectedInterval = 4; break;
                case 'Semestral': expectedInterval = 6; break;
                case 'Anual': expectedInterval = 12; break;
            }

            // PENALIZACIÓN: Si el mantenimiento es muy reciente (< 21 días para mensuales, < 1 mes para otros)
            if (item.isRecentPenalty) {
                // Penalización fuerte para mantenimientos muy recientes
                points -= 80;
            }
            // PENALIZACIÓN MODERADA: Si no ha pasado suficiente tiempo según el contrato
            else if (monthsSince < expectedInterval) {
                // Penalización proporcional: cuanto más cerca del último, más penalización
                const ratio = monthsSince / expectedInterval; // 0 a 1
                points -= (1 - ratio) * 50; // Hasta -50 puntos
            }
            // BONIFICACIÓN: Si ha pasado el tiempo esperado o más
            else {
                // Bonificación base por estar en tiempo
                points += 30;

                // Bonificación progresiva por cada mes adicional de retraso
                const monthsOverdue = monthsSince - expectedInterval;
                if (monthsOverdue > 0) {
                    // +15 puntos por cada mes de retraso (escalado)
                    points += monthsOverdue * 15;

                    // Bonificación extra si el retraso es significativo (>2 meses)
                    if (monthsOverdue > 2) {
                        points += 20;
                    }
                }
            }

            return points;
        }

        /**
         * Calcula la puntuación por tipo de contrato
         * Los contratos más frecuentes tienen mayor prioridad
         * @param {string} contract - Tipo de contrato
         * @returns {number} - Puntos por tipo de contrato
         */
        function calculateContractScore(contract) {
            const contractScores = {
                'Mensual': 25,      // Mayor prioridad
                'Bimensual': 20,
                'Trimestral': 15,
                'Cuatrimestral': 10,
                'Semestral': 5,
                'Anual': 0          // Menor prioridad
            };
            return contractScores[contract] || 0;
        }

        /**
         * Calcula la puntuación por distancia con curva logarítmica
         * Prioriza ubicaciones cercanas pero sin penalizar excesivamente las lejanas
         * @param {number} distance - Distancia en km
         * @param {number} maxPoints - Puntos máximos para distancia 0
         * @returns {number} - Puntos por distancia
         */
        function calculateDistanceScore(distance, maxPoints = 60) {
            if (distance === undefined || distance === Infinity) return 0;

            // Curva logarítmica: distancias muy cercanas tienen gran ventaja
            // pero la penalización se suaviza con la distancia
            if (distance < 0.5) {
                return maxPoints; // Muy cerca: puntuación máxima
            } else if (distance < 1) {
                return maxPoints * 0.9; // Cerca: 90%
            } else if (distance < 3) {
                return maxPoints * 0.7; // Moderadamente cerca: 70%
            } else if (distance < 5) {
                return maxPoints * 0.5; // Distancia media: 50%
            } else if (distance < 10) {
                return maxPoints * 0.3; // Lejos: 30%
            } else if (distance < 20) {
                return maxPoints * 0.15; // Muy lejos: 15%
            } else {
                return maxPoints * 0.05; // Extremadamente lejos: 5%
            }
        }

        /**
         * Sistema de puntuación completo y optimizado
         * @param {Object} item - Item de mantenimiento
         * @param {Date} currentDate - Fecha actual
         * @param {number} routePosition - Posición en la ruta (0 = primera parada)
         * @returns {number} - Puntuación total
         */
        function calculateSmartScore(item, currentDate, routePosition = 0) {
            let points = 0;
            let breakdown = {}; // Para debugging

            // ═══════════════════════════════════════════════════════════════
            // 1. PRIORIDAD BASE (0-50 puntos)
            // ═══════════════════════════════════════════════════════════════
            const priorityScores = {
                'Alta': 50,
                'Media': 25,
                'Baja': 0
            };
            const priorityPoints = priorityScores[item.priority] || 0;
            points += priorityPoints;
            breakdown.priority = priorityPoints;

            // ═══════════════════════════════════════════════════════════════
            // 2. AVERÍA (0-100 puntos) - CRÍTICO
            // ═══════════════════════════════════════════════════════════════
            if (item.breakdown && item.breakdown.trim()) {
                const breakdownPoints = 100;
                points += breakdownPoints;
                breakdown.breakdown = breakdownPoints;

                // Bonus adicional si tiene avería Y alta prioridad
                if (item.priority === 'Alta') {
                    points += 30;
                    breakdown.breakdownHighPriority = 30;
                }
            } else {
                breakdown.breakdown = 0;
            }

            // ═══════════════════════════════════════════════════════════════
            // 3. OBSERVACIONES (0-15 puntos)
            // ═══════════════════════════════════════════════════════════════
            if (item.description && item.description.trim()) {
                const observationPoints = 15;
                points += observationPoints;
                breakdown.observations = observationPoints;
            } else {
                breakdown.observations = 0;
            }

            // ═══════════════════════════════════════════════════════════════
            // 4. TIPO DE CONTRATO (0-25 puntos)
            // ═══════════════════════════════════════════════════════════════
            const contractPoints = calculateContractScore(item.contract);
            points += contractPoints;
            breakdown.contract = contractPoints;

            // ═══════════════════════════════════════════════════════════════
            // 5. TIEMPO DESDE ÚLTIMO MANTENIMIENTO (-80 a +100 puntos)
            // ═══════════════════════════════════════════════════════════════
            const monthsSince = getMonthsSinceLastMaintenance(item, currentDate);
            const timePoints = calculateTimeScore(item, monthsSince);
            points += timePoints;
            breakdown.time = timePoints;
            breakdown.monthsSince = monthsSince;

            // ═══════════════════════════════════════════════════════════════
            // 6. DISTANCIA AL PUNTO DE PARTIDA/ACTUAL (0-60 puntos)
            // ═══════════════════════════════════════════════════════════════
            // Para la primera ubicación: distancia al usuario
            // Para ubicaciones siguientes: distancia a la ubicación anterior en la ruta
            const distanceToStart = item.distance !== undefined ? item.distance : Infinity;
            const distancePoints = calculateDistanceScore(distanceToStart, 60);
            points += distancePoints;
            breakdown.distanceToStart = distancePoints;
            breakdown.distanceKm = distanceToStart !== Infinity ? distanceToStart.toFixed(2) : 'N/A';

            // ═══════════════════════════════════════════════════════════════
            // 7. PROXIMIDAD ENTRE UBICACIONES - CLUSTERING (0-50 puntos)
            // ═══════════════════════════════════════════════════════════════
            // Bonifica ubicaciones que están cerca de otras ubicaciones
            // Esto ayuda a crear clusters eficientes
            const neighborDistance = item.nearestNeighborDistance !== undefined ?
                item.nearestNeighborDistance : Infinity;
            const clusterPoints = calculateDistanceScore(neighborDistance, 50);
            points += clusterPoints;
            breakdown.clustering = clusterPoints;
            breakdown.nearestNeighborKm = neighborDistance !== Infinity ?
                neighborDistance.toFixed(2) : 'N/A';

            // ═══════════════════════════════════════════════════════════════
            // 8. MODIFICADOR MANUAL (±100 puntos)
            // ═══════════════════════════════════════════════════════════════
            const manualModifier = customScoreModifiers[item.id] || 0;
            if (manualModifier !== 0) {
                // Amplificar el modificador manual para que tenga más impacto
                const amplifiedModifier = manualModifier * 2; // ±100 puntos
                points += amplifiedModifier;
                breakdown.manual = amplifiedModifier;
            } else {
                breakdown.manual = 0;
            }

            // ═══════════════════════════════════════════════════════════════
            // 9. BONUS POR POSICIÓN EN RUTA (Optimización dinámica)
            // ═══════════════════════════════════════════════════════════════
            // A medida que avanzamos en la ruta, priorizamos más la distancia
            // que otros factores para optimizar el recorrido
            if (routePosition > 0) {
                const routeBonus = distancePoints * 0.3 * routePosition;
                points += routeBonus;
                breakdown.routeOptimization = routeBonus;
            }

            // Guardar breakdown para debugging
            item._scoreBreakdown = breakdown;

            return Math.round(points);
        }

        listContainer.innerHTML = '';

        // DEBUG: Verificar método de ordenación
        console.log('[Maintenance] Current sort method:', currentSortMethod);

        // Lógica de ordenación dinámica
        if (currentSortMethod === 'ai') {
            // Pre-calcular puntajes para visualización y ordenamiento
            console.log('%c[Maintenance AI] Calculando puntuaciones...', 'color: #ff00ff; font-weight: bold');

            data.forEach(item => {
                item._tempScore = calculateSmartScore(item, currentDate);
            });

            // Ordenar por puntuación
            data.sort((a, b) => b._tempScore - a._tempScore);

            // Log detallado después de ordenar
            console.log('%c[Maintenance AI] Ruta optimizada:', 'color: #00ff00; font-weight: bold');
            data.forEach((item, index) => {
                const breakdown = item._scoreBreakdown || {};
                console.log(
                    `%c${index + 1}. ${item.location} %c(${item._tempScore} pts)`,
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
                if (breakdown.manual !== 0) {
                    console.log(`   🎚️ Modificador Manual: ${breakdown.manual > 0 ? '+' : ''}${breakdown.manual}`);
                }
                console.log('   ─────────────────────────────────────────');
            });
        } else if (currentSortMethod === 'location') {
            // En modo location, también calculamos el score para mostrarlo (opcional)
            data.forEach(item => {
                item._tempScore = calculateSmartScore(item, currentDate);
            });

            data.sort((a, b) => {
                const distA = a.distance !== undefined ? a.distance : Infinity;
                const distB = b.distance !== undefined ? b.distance : Infinity;
                return distA - distB;
            });

            console.log('[Maintenance] Ordenado por distancia');
        } else {
            // Por Prioridad (Default) - No calculamos score
            console.log('[Maintenance] Priority mode - no scores calculated');
            data.sort((a, b) => {
                const priorityOrder = { 'Alta': 1, 'Media': 2, 'Baja': 3 };
                const pA = priorityOrder[a.priority] || 99;
                const pB = priorityOrder[b.priority] || 99;
                if (pA !== pB) return pA - pB;
                return a.location.localeCompare(b.location);
            });
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
                <span class="text-xs text-gray-400">
                    ID: ${item.key_id || '---'} 
                    ${item._tempScore !== undefined && item._tempScore !== null ?
                `<span class="text-accent-magenta font-bold ml-2" title="Puntuación IA: ${item._tempScore}">(${Math.round(item._tempScore)} pts)</span>` :
                (currentSortMethod === 'ai' || currentSortMethod === 'location' ?
                    `<span class="text-yellow-500 font-bold ml-2" title="Score no calculado">(?)</span>` : '')}
                </span>
                
                <div class="flex items-center gap-2">
                    <button class="text-accent-magenta hover:text-white hover:bg-accent-magenta p-1.5 rounded-full transition-colors" 
                            onclick="event.stopPropagation(); window.openMaintenanceMap('${item.location}')" title="Ver Mapa">
                        <i class="ph ph-map-pin text-lg"></i>
                    </button>
                    ${currentSortMethod === 'ai' ? (() => {
                const mod = customScoreModifiers[item.id] || 0;
                let iconColorClass = 'text-orange-500'; // Default/Normal
                // Use standard Tailwind colors to ensure visibility
                if (mod === 50) iconColorClass = 'text-green-500'; // Adelantar
                if (mod === -50) iconColorClass = 'text-red-500';   // Aplazar

                return `
                        <button class="${iconColorClass} hover:text-white p-1.5 rounded-full transition-colors relative" 
                                onclick="event.stopPropagation(); window.openScoreMenu(event, '${item.id}')" title="Ajustar Prioridad IA">
                            <i class="ph ph-hourglass-medium text-lg"></i>
                        </button>
                        `;
            })() : ''}
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

            // Resetear modificador IA si existe
            if (customScoreModifiers[id]) {
                delete customScoreModifiers[id];
                saveModifiersToStorage();
            }

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
    // MENU DE PUNTUACIÓN IA
    // ====================================

    window.openScoreMenu = function (event, id) {
        let menu = document.getElementById('ai-score-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'ai-score-menu';
            menu.className = 'absolute z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl hidden flex-col w-32 overflow-hidden';
            document.body.appendChild(menu);

            // Cerrar menú al hacer click fuera
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && e.target.id !== 'ai-score-menu') {
                    menu.classList.add('hidden');
                }
            });
        }

        const currentMod = customScoreModifiers[id] || 0;

        // Configurar contenido del menú
        menu.innerHTML = `
            <button onclick="window.applyScoreModifier('${id}', 50)" class="w-full text-left px-4 py-2 hover:bg-gray-700 text-green-500 text-sm font-medium flex items-center gap-2">
                <i class="ph ph-arrow-up"></i> Adelantar
                ${currentMod === 50 ? '<i class="ph ph-check text-accent-magenta ml-auto"></i>' : ''}
            </button>
            <button onclick="window.applyScoreModifier('${id}', 0)" class="w-full text-left px-4 py-2 hover:bg-gray-700 text-orange-500 text-sm font-medium flex items-center gap-2">
                <i class="ph ph-minus"></i> Normal
                 ${currentMod === 0 ? '<i class="ph ph-check text-accent-magenta ml-auto"></i>' : ''}
            </button>
            <button onclick="window.applyScoreModifier('${id}', -50)" class="w-full text-left px-4 py-2 hover:bg-gray-700 text-red-500 text-sm font-medium flex items-center gap-2">
                <i class="ph ph-arrow-down"></i> Aplazar
                 ${currentMod === -50 ? '<i class="ph ph-check text-accent-magenta ml-auto"></i>' : ''}
            </button>
        `;

        // Posicionar menú
        const rect = event.currentTarget.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
        menu.style.left = `${rect.left + window.scrollX - 80}px`; // Ajuste ligero a la izquierda

        menu.classList.remove('hidden');
        menu.classList.add('flex');
    }

    window.applyScoreModifier = function (id, value) {
        customScoreModifiers[id] = value;
        saveModifiersToStorage();
        const menu = document.getElementById('ai-score-menu');
        if (menu) menu.classList.add('hidden');

        // Re-ordenar
        renderMaintenanceList(currentMaintenanceData, currentViewDate);
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
// ====================================
// IA.js - Lógica de Inteligencia Artificial para Ordenación
// ====================================

(function () {
    const IA = {
        /**
         * Calcula el tiempo transcurrido desde el último mantenimiento en meses
         */
        getMonthsSinceLastMaintenance: function (item, currentDate) {
            const currentMonth = currentDate.getMonth() + 1; // 1-12
            const currentYear = currentDate.getFullYear();

            const itemMonth = item.maintenance_month;
            const itemYear = item.maintenance_year;

            // Calcular diferencia en meses
            const monthsDiff = (currentYear - itemYear) * 12 + (currentMonth - itemMonth);

            return monthsDiff;
        },

        /**
         * Calcula la puntuación por tiempo transcurrido según el tipo de contrato
         */
        calculateTimeScore: function (item, monthsSince) {
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
        },

        /**
         * Calcula la puntuación por tipo de contrato
         */
        calculateContractScore: function (contract) {
            const contractScores = {
                'Mensual': 25,      // Mayor prioridad
                'Bimensual': 20,
                'Trimestral': 15,
                'Cuatrimestral': 10,
                'Semestral': 5,
                'Anual': 0          // Menor prioridad
            };
            return contractScores[contract] || 0;
        },

        /**
         * Calcula la puntuación por distancia con curva logarítmica
         */
        calculateDistanceScore: function (distance, maxPoints = 60) {
            if (distance === undefined || distance === Infinity) return 0;

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
        },

        /**
         * Sistema de puntuación completo y optimizado
         */
        calculateSmartScore: function (item, currentDate, routePosition = 0) {
            let points = 0;
            let breakdown = {}; // Para debugging

            // 1. PRIORIDAD BASE (0-50 puntos)
            const priorityScores = {
                'Alta': 50,
                'Media': 25,
                'Baja': 0
            };
            const priorityPoints = priorityScores[item.priority] || 0;
            points += priorityPoints;
            breakdown.priority = priorityPoints;

            // 2. AVERÍA (0-100 puntos) - CRÍTICO
            if (item.breakdown && item.breakdown.trim()) {
                const breakdownPoints = 100;
                points += breakdownPoints;
                breakdown.breakdown = breakdownPoints;

                if (item.priority === 'Alta') {
                    points += 30;
                    breakdown.breakdownHighPriority = 30;
                }
            } else {
                breakdown.breakdown = 0;
            }

            // 3. OBSERVACIONES (0-15 puntos)
            if (item.description && item.description.trim()) {
                const observationPoints = 15;
                points += observationPoints;
                breakdown.observations = observationPoints;
            } else {
                breakdown.observations = 0;
            }

            // 4. TIPO DE CONTRATO (0-25 puntos)
            const contractPoints = this.calculateContractScore(item.contract);
            points += contractPoints;
            breakdown.contract = contractPoints;

            // 5. TIEMPO DESDE ÚLTIMO MANTENIMIENTO (-80 a +100 puntos)
            const monthsSince = this.getMonthsSinceLastMaintenance(item, currentDate);
            const timePoints = this.calculateTimeScore(item, monthsSince);
            points += timePoints;
            breakdown.time = timePoints;
            breakdown.monthsSince = monthsSince;

            // 6. DISTANCIA AL PUNTO DE PARTIDA/ACTUAL (0-60 puntos)
            const distanceToStart = item.distance !== undefined ? item.distance : Infinity;
            const distancePoints = this.calculateDistanceScore(distanceToStart, 60);
            points += distancePoints;
            breakdown.distanceToStart = distancePoints;
            breakdown.distanceKm = distanceToStart !== Infinity ? distanceToStart.toFixed(2) : 'N/A';

            // 7. PROXIMIDAD ENTRE UBICACIONES - CLUSTERING (0-50 puntos)
            const neighborDistance = item.nearestNeighborDistance !== undefined ?
                item.nearestNeighborDistance : Infinity;
            const clusterPoints = this.calculateDistanceScore(neighborDistance, 50);
            points += clusterPoints;
            breakdown.clustering = clusterPoints;
            breakdown.nearestNeighborKm = neighborDistance !== Infinity ?
                neighborDistance.toFixed(2) : 'N/A';

            // 8. HORARIOS DE APERTURA (-40 a +30 puntos)
            let openingHoursPoints = 0;
            if (item.opening_time && item.closing_time) {
                const now = new Date();
                const currentTime = now.getHours() * 60 + now.getMinutes();

                const [openHour, openMin] = item.opening_time.split(':').map(Number);
                const [closeHour, closeMin] = item.closing_time.split(':').map(Number);
                const openingMinutes = openHour * 60 + openMin;
                const closingMinutes = closeHour * 60 + closeMin;

                if (currentTime >= openingMinutes && currentTime <= closingMinutes) {
                    openingHoursPoints = 30;
                    breakdown.openingHoursStatus = '🟢 Abierto';
                } else {
                    openingHoursPoints = -40;
                    breakdown.openingHoursStatus = '🔴 Cerrado';
                }
            } else {
                breakdown.openingHoursStatus = '⚪ Sin horario';
            }
            points += openingHoursPoints;
            breakdown.openingHours = openingHoursPoints;

            // ═══════════════════════════════════════════════════════════════
            // 8b. HORARIO PREFERIDO (0 a +40 puntos)
            // ═══════════════════════════════════════════════════════════════
            let preferredSchedulePoints = 0;
            if (item.preferred_schedule && item.preferred_schedule !== 'Cualquiera') {
                const now = new Date();
                const hour = now.getHours();
                const pref = item.preferred_schedule;

                let isMatch = false;
                if (pref === 'Mañana' && (hour >= 8 && hour < 14)) isMatch = true;
                else if (pref === 'Tarde' && (hour >= 14 && hour < 20)) isMatch = true;
                else if (pref === 'Noche' && (hour >= 20 || hour < 8)) isMatch = true;

                if (isMatch) {
                    preferredSchedulePoints = 40;
                    breakdown.preferredScheduleStatus = `✅ En horario (${pref})`;
                } else {
                    preferredSchedulePoints = -10;
                    breakdown.preferredScheduleStatus = `⏳ Fuera de horario preferido (${pref})`;
                }
            } else {
                breakdown.preferredScheduleStatus = '⚪ Sin preferencia';
            }
            points += preferredSchedulePoints;
            breakdown.preferredSchedule = preferredSchedulePoints;

            // ═══════════════════════════════════════════════════════════════
            // 8c. TIEMPO ESTIMADO Y JORNADA (-50 a +30 puntos)
            // ═══════════════════════════════════════════════════════════════
            // Constante: 20m trabajo + 5m aparcar = 25m
            const workAndParkingTime = 25;
            const travelTime = item.distance !== undefined ? (item.distance / 40) * 60 : 30;
            const totalEstimatedTime = workAndParkingTime + travelTime;

            breakdown.estimatedTotalTime = Math.round(totalEstimatedTime);

            // Si el trabajo total es muy largo (>2h), penalizar un poco para no bloquear el día
            // a menos que sea alta prioridad
            if (totalEstimatedTime > 120 && item.priority !== 'Alta') {
                points -= 20;
                breakdown.workloadScore = -20;
            } else if (totalEstimatedTime < 45) {
                // Tareas rápidas son buenas para rellenar huecos
                points += 15;
                breakdown.workloadScore = 15;
            }

            // Jornada de 8h (480 min)
            // Si estuviéramos trackeando el tiempo total de la ruta (basado en routePosition), 
            // podríamos penalizar si se pasa de 480 min.
            // Estimación simple: si la posición en la ruta indica que ya es tarde:
            const estimatedDayMinutesProgress = routePosition * 45; // Asumimos 45 min por parada de media
            if (estimatedDayMinutesProgress + totalEstimatedTime > 480) {
                points -= 50;
                breakdown.workloadStatus = '⚠️ Excede jornada 8h';
            } else {
                breakdown.workloadStatus = '✅ Cabe en jornada';
            }

            // 9. PROGRAMACIÓN EN CALENDAR (0 a +80 puntos)
            let scheduledPoints = 0;
            if (item.isScheduled && item.scheduledDateTime) {
                const now = new Date();
                const scheduledTime = item.scheduledDateTime.toDate ? item.scheduledDateTime.toDate() : new Date(item.scheduledDateTime);

                const minutesUntilScheduled = (scheduledTime - now) / (1000 * 60);
                const travelTimeMinutes = item.distance ? (item.distance / 40) * 60 : 30;
                const minutesUntilDeparture = minutesUntilScheduled - travelTimeMinutes;

                if (minutesUntilDeparture <= 0 && minutesUntilScheduled > 0) {
                    scheduledPoints = 80;
                    breakdown.scheduledStatus = '🚨 ¡SALIR AHORA!';
                } else if (minutesUntilDeparture > 0 && minutesUntilDeparture <= 60) {
                    scheduledPoints = 60;
                    breakdown.scheduledStatus = `⏰ Salir en ${Math.round(minutesUntilDeparture)} min`;
                } else if (minutesUntilDeparture > 60 && minutesUntilDeparture <= 180) {
                    scheduledPoints = 40;
                    const hours = Math.floor(minutesUntilDeparture / 60);
                    breakdown.scheduledStatus = `📅 Salir en ${hours}h`;
                } else if (minutesUntilDeparture > 180 && minutesUntilDeparture <= 1440) {
                    scheduledPoints = 20;
                    breakdown.scheduledStatus = '📅 Programado hoy';
                } else if (minutesUntilScheduled < 0) {
                    scheduledPoints = -30;
                    breakdown.scheduledStatus = '❌ Cita pasada';
                } else {
                    scheduledPoints = 10;
                    const date = scheduledTime.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    breakdown.scheduledStatus = `📅 ${date}`;
                }
            } else {
                breakdown.scheduledStatus = '⚪ Sin programar';
            }
            points += scheduledPoints;
            breakdown.scheduled = scheduledPoints;

            item._scoreBreakdown = breakdown;

            return Math.round(points);
        },

        // ====================================
        // GESTIÓN DE MODIFICADORES (ADELANTAR/APLAZAR)
        // ====================================
        modifiers: {},

        loadModifiers: function () {
            const stored = localStorage.getItem('portis-maintenance-modifiers');
            if (stored) {
                try {
                    this.modifiers = JSON.parse(stored);
                    this.cleanExpiredModifiers();
                } catch (e) {
                    this.modifiers = {};
                }
            }
        },

        saveModifiers: function () {
            localStorage.setItem('portis-maintenance-modifiers', JSON.stringify(this.modifiers));
        },

        cleanExpiredModifiers: function () {
            const now = new Date();
            const TWELVE_HOURS = 12 * 60 * 60 * 1000;
            let hasChanges = false;

            Object.keys(this.modifiers).forEach(id => {
                const modifier = this.modifiers[id];
                if (modifier.type === 'aplazar' && modifier.timestamp) {
                    const modifierTime = new Date(modifier.timestamp);
                    const elapsed = now - modifierTime;
                    if (elapsed >= TWELVE_HOURS) {
                        delete this.modifiers[id];
                        hasChanges = true;
                    }
                }
            });

            if (hasChanges) this.saveModifiers();
        },

        openScoreMenu: function (event, id) {
            let menu = document.getElementById('ai-score-menu');
            if (!menu) {
                menu = document.createElement('div');
                menu.id = 'ai-score-menu';
                menu.className = 'absolute z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl hidden flex-col w-40 overflow-hidden';
                document.body.appendChild(menu);

                document.addEventListener('click', (e) => {
                    if (!menu.contains(e.target) && e.target.id !== 'ai-score-menu') {
                        menu.classList.add('hidden');
                    }
                });
            }

            const currentMod = this.modifiers[id];
            const currentType = currentMod ? currentMod.type : 'normal';

            menu.innerHTML = `
                <button onclick="IA.applyScoreModifier('${id}', 'adelantar')" class="w-full text-left px-4 py-2 hover:bg-gray-700 text-green-500 text-sm font-medium flex items-center gap-2">
                    <i class="ph ph-arrow-up"></i> Adelantar
                    ${currentType === 'adelantar' ? '<i class="ph ph-check text-accent-magenta ml-auto"></i>' : ''}
                </button>
                <button onclick="IA.applyScoreModifier('${id}', 'normal')" class="w-full text-left px-4 py-2 hover:bg-gray-700 text-orange-500 text-sm font-medium flex items-center gap-2">
                    <i class="ph ph-minus"></i> Normal
                     ${currentType === 'normal' ? '<i class="ph ph-check text-accent-magenta ml-auto"></i>' : ''}
                </button>
                <button onclick="IA.applyScoreModifier('${id}', 'aplazar')" class="w-full text-left px-4 py-2 hover:bg-gray-700 text-red-500 text-sm font-medium flex items-center gap-2">
                    <i class="ph ph-arrow-down"></i> Aplazar (12h)
                     ${currentType === 'aplazar' ? '<i class="ph ph-check text-accent-magenta ml-auto"></i>' : ''}
                </button>
            `;

            const rect = event.currentTarget.getBoundingClientRect();
            menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
            menu.style.left = `${rect.left + window.scrollX - 100}px`;

            menu.classList.remove('hidden');
            menu.classList.add('flex');
        },

        applyScoreModifier: function (id, type) {
            if (type === 'normal') {
                delete this.modifiers[id];
            } else {
                this.modifiers[id] = {
                    type: type,
                    timestamp: new Date().toISOString()
                };
            }

            this.saveModifiers();
            const menu = document.getElementById('ai-score-menu');
            if (menu) menu.classList.add('hidden');

            const showMsg = (t, m) => {
                if (window.showAppMessage) window.showAppMessage(t, m);
            };

            if (type === 'adelantar') {
                showMsg('success', 'Tarjeta adelantada - Se mostrará al inicio de la lista');
            } else if (type === 'aplazar') {
                showMsg('info', 'Tarjeta aplazada durante 12 horas - Se mostrará al final de la lista');
            } else {
                showMsg('info', 'Tarjeta restaurada a orden normal');
            }

            // Notificar a Maintenance para re-renderizar
            if (window.fetchMaintenanceData) {
                window.fetchMaintenanceData();
            }
        }
    };

    // Inicializar modificadores
    IA.loadModifiers();

    // Exponer el objeto IA globalmente
    window.IA = IA;

})();

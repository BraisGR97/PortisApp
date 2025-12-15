# Sistema de Puntuación Avanzado para Organización de Mantenimientos

## 🆕 ACTUALIZACIÓN v2.1 - Sistema de Adelantar/Aplazar Mejorado

### Cambios Importantes

El sistema de **Adelantar/Aplazar** ha sido completamente rediseñado para ser más intuitivo y potente:

#### ✅ **Adelantar** - Posición Fija al Inicio
- Las tarjetas marcadas como "Adelantar" se colocan **SIEMPRE al principio** de la lista
- No importa su puntuación - tienen prioridad absoluta
- Útil para compromisos urgentes con clientes o situaciones especiales
- Icono: 🚀 (flecha verde hacia arriba)

#### ⏸️ **Aplazar** - Posición Fija al Final (12 horas)
- Las tarjetas marcadas como "Aplazar" se colocan **SIEMPRE al final** de la lista
- Duración: **12 horas automáticas**
- Después de 12h, vuelven automáticamente a "Normal"
- Útil para posponer temporalmente ubicaciones no urgentes
- Icono: ⏸️ (flecha roja hacia abajo)

#### 🔄 **Normal** - Orden por Puntuación
- Las tarjetas normales se ordenan según el sistema de puntuación inteligente
- Este es el comportamiento por defecto

---

## Estructura de Ordenación

La lista se divide en **3 grupos fijos**:

```
┌─────────────────────────────────┐
│  📌 ADELANTADAS                 │  ← Siempre arriba
│  (ordenadas por puntuación)     │
├─────────────────────────────────┤
│  📊 NORMALES                    │  ← Ordenadas por IA
│  (ordenadas por puntuación)     │
├─────────────────────────────────┤
│  ⏸️ APLAZADAS (12h)             │  ← Siempre abajo
│  (ordenadas por puntuación)     │
└─────────────────────────────────┘
```

Dentro de cada grupo, las tarjetas se ordenan por su puntuación calculada.

---

## Descripción General

Este sistema calcula una puntuación inteligente para cada ubicación de mantenimiento, optimizando la ruta de trabajo considerando múltiples factores críticos. El objetivo es minimizar el tiempo de desplazamiento mientras se priorizan las tareas más urgentes.

---

## Factores de Puntuación

### 1. **Prioridad Base** (0-50 puntos)
Puntuación base según la prioridad asignada manualmente:
- **Alta**: +50 puntos
- **Media**: +25 puntos
- **Baja**: +0 puntos

**Justificación**: Las tareas de alta prioridad deben atenderse primero independientemente de otros factores.

---

### 2. **Avería** (0-130 puntos) ⚠️ CRÍTICO
Sistema de puntuación para averías:
- **Sin avería**: +0 puntos
- **Con avería**: +100 puntos
- **Avería + Prioridad Alta**: +130 puntos (bonus de +30)

**Justificación**: Las averías son situaciones críticas que requieren atención inmediata. Si además tienen prioridad alta, se convierten en la máxima urgencia.

---

### 3. **Observaciones** (0-15 puntos)
- **Con observaciones**: +15 puntos
- **Sin observaciones**: +0 puntos

**Justificación**: Las ubicaciones con observaciones suelen requerir atención especial o tienen historial de problemas.

---

### 4. **Tipo de Contrato** (0-25 puntos)
Puntuación según la frecuencia del contrato:
- **Mensual**: +25 puntos (máxima prioridad)
- **Bimensual**: +20 puntos
- **Trimestral**: +15 puntos
- **Cuatrimestral**: +10 puntos
- **Semestral**: +5 puntos
- **Anual**: +0 puntos (mínima prioridad)

**Justificación**: Los contratos más frecuentes requieren mayor atención y seguimiento constante.

---

### 5. **Tiempo desde Último Mantenimiento** (-80 a +100 puntos) 📅

Este es el factor más complejo y dinámico:

#### A. Penalización por Mantenimiento Muy Reciente
- **< 21 días (mensuales)**: -80 puntos
- **< 1 mes (otros contratos)**: -80 puntos

#### B. Penalización Moderada (No ha pasado suficiente tiempo)
Si `meses_transcurridos < intervalo_esperado`:
- Penalización proporcional: hasta -50 puntos
- Fórmula: `-(1 - ratio) * 50` donde `ratio = meses_transcurridos / intervalo_esperado`

**Ejemplo**: 
- Contrato mensual, 15 días desde último mantenimiento
- Ratio = 0.5 (medio mes de 1 mes esperado)
- Penalización = -(1 - 0.5) * 50 = -25 puntos

#### C. Bonificación por Tiempo Cumplido
Si `meses_transcurridos >= intervalo_esperado`:
- **Bonificación base**: +30 puntos
- **Por cada mes de retraso**: +15 puntos adicionales
- **Retraso significativo (>2 meses)**: +20 puntos extra

**Ejemplo**:
- Contrato mensual, 4 meses desde último mantenimiento
- Bonificación base: +30
- Meses de retraso: 3 meses × 15 = +45
- Retraso significativo: +20
- **Total**: +95 puntos

**Justificación**: Este sistema asegura que:
1. No se visiten ubicaciones recién atendidas
2. Se prioricen ubicaciones con retraso
3. El retraso acumulado aumente progresivamente la urgencia

---

### 6. **Distancia al Punto Actual** (0-60 puntos) 📍

Sistema de curva logarítmica para distancias:
- **< 0.5 km**: 60 puntos (100%)
- **< 1 km**: 54 puntos (90%)
- **< 3 km**: 42 puntos (70%)
- **< 5 km**: 30 puntos (50%)
- **< 10 km**: 18 puntos (30%)
- **< 20 km**: 9 puntos (15%)
- **≥ 20 km**: 3 puntos (5%)

**Justificación**: 
- Las ubicaciones muy cercanas tienen gran ventaja
- La penalización se suaviza con la distancia para no descartar ubicaciones importantes pero lejanas
- Usa curva logarítmica en lugar de lineal para mejor balance

---

### 7. **Proximidad entre Ubicaciones - Clustering** (0-50 puntos) 🗺️

Calcula la distancia a la ubicación más cercana en la lista:
- Usa la misma curva logarítmica que el factor 6
- Máximo: 50 puntos

**Justificación**: 
- Favorece la creación de "clusters" o grupos de ubicaciones cercanas
- Optimiza la ruta agrupando visitas en la misma zona
- Reduce el tiempo total de desplazamiento

---

### 8. **Horarios de Apertura** (-40 a +30 puntos) 🕐

Sistema de puntuación basado en horarios de apertura/cierre:
- **Abierto ahora**: +30 puntos 🟢
- **Cerrado ahora**: -40 puntos 🔴
- **Sin horario definido**: 0 puntos ⚪

**Justificación**:
- Evita visitas fallidas a ubicaciones cerradas
- Prioriza ubicaciones que están abiertas en el momento actual
- Optimiza el uso del tiempo de trabajo
- Reduce frustración y pérdida de tiempo

**Configuración**:
- Se configura en "Datos de Contacto" al crear/editar mantenimiento
- Campos: Hora de Apertura y Hora de Cierre (formato 24h)
- El sistema compara automáticamente con la hora actual

---

### 9. **Programación en Calendar** (-30 a +80 puntos) 📅

Sistema de puntuación basado en citas programadas con cálculo inteligente de tiempo de viaje:

**Escala de Puntos**:
- **¡ES HORA DE SALIR!**: +80 puntos 🚨
- **Falta < 1h para salir**: +60 puntos ⏰
- **Falta 1-3h para salir**: +40 puntos 📅
- **Falta 3-24h**: +20 puntos 📅
- **Programado otro día**: +10 puntos 📅
- **Cita pasada**: -30 puntos ❌
- **Sin programar**: 0 puntos ⚪

**Cálculo de Tiempo de Viaje**:
```
Velocidad promedio: 40 km/h (ciudad)
Tiempo de viaje = (distancia_km / 40) * 60 minutos
Tiempo ideal salida = hora_programada - tiempo_viaje
```

**Justificación**:
- Prioriza mantenimientos con citas programadas
- Calcula automáticamente cuándo salir
- Evita retrasos considerando tráfico urbano
- Penaliza citas pasadas para recordar reprogramar
- Máximo bonus cuando es momento crítico de salir

**Configuración**:
- Botón "📅 Programar" en cada tarjeta
- Modal con fecha, hora y notas
- Sincronización automática con Calendar
- Badge visual "📅 Programado" en tarjetas

**Ejemplo**:
- Cita a las 14:00, distancia 20 km
- Tiempo viaje: 30 min → Salir a las 13:30
- A las 13:25: +60 pts (⏰ Salir en 5 min)
- A las 13:35: +80 pts (🚨 ¡SALIR AHORA!)

---

## Rangos de Puntuación Total

### Puntuación Mínima Posible
- Ubicación lejana (3 pts)
- Sin cluster (2.5 pts)
- Recién visitada (-80 pts)
- Cerrada (-40 pts)
- Cita pasada (-30 pts)
- **Total**: ≈ -145 puntos

### Puntuación Máxima Posible
- Prioridad Alta (50 pts)
- Avería + Alta Prioridad (130 pts)
- Observaciones (15 pts)
- Contrato Mensual (25 pts)
- Retraso significativo (95 pts)
- Muy cerca (60 pts)
- Buen clustering (50 pts)
- Abierta ahora (30 pts)
- ¡Hora de salir! (80 pts)
- **Total**: ≈ 535 puntos

### Puntuación Típica
Una ubicación "normal" sin factores especiales:
- Prioridad Media (25 pts)
- Sin avería (0 pts)
- Sin observaciones (0 pts)
- Contrato Trimestral (15 pts)
- En tiempo (30 pts)
- Distancia media 5km (30 pts)
- Clustering moderado (25 pts)
- Sin horario definido (0 pts)
- Sin programar (0 pts)
- **Total**: ≈ 125 puntos

---

## Sistema de Modificadores Manuales

### 🚀 Adelantar
- **Efecto**: Coloca la tarjeta al **inicio absoluto** de la lista
- **Duración**: Permanente hasta que se cambie manualmente
- **Uso**: Compromisos urgentes, citas programadas, clientes VIP
- **Visual**: Icono verde de flecha hacia arriba relleno

### ⏸️ Aplazar (12 horas)
- **Efecto**: Coloca la tarjeta al **final absoluto** de la lista
- **Duración**: **12 horas automáticas**
- **Auto-reset**: Vuelve a "Normal" automáticamente después de 12h
- **Uso**: Ubicaciones temporalmente inaccesibles, posponer tareas no urgentes
- **Visual**: Icono rojo de flecha hacia abajo relleno
- **Contador**: Muestra horas restantes en la consola

### 🔄 Normal
- **Efecto**: Orden según puntuación calculada por IA
- **Duración**: Por defecto
- **Uso**: Comportamiento estándar del sistema

---

## Estrategia de Optimización

### Fase 1: Separación en Grupos
1. **Adelantadas**: Se extraen y colocan al inicio
2. **Normales**: Se ordenan por puntuación IA
3. **Aplazadas**: Se extraen y colocan al final

### Fase 2: Ordenación Interna
Dentro de cada grupo:
- Se calcula la puntuación de cada tarjeta
- Se ordenan de mayor a menor puntuación
- Se identifican urgencias (averías, retrasos)

### Fase 3: Optimización de Ruta
- Comienza con las adelantadas (si existen)
- Continúa con las normales optimizadas
- Termina con las aplazadas (si existen)

---

## Ventajas del Sistema v2.1

✅ **Control Total**: Adelantar/Aplazar con posicionamiento absoluto
✅ **Auto-gestión**: Las aplazadas vuelven a normal automáticamente
✅ **Inteligente**: Considera 7 factores simultáneamente
✅ **Dinámico**: Se adapta al tiempo y ubicación actual
✅ **Balanceado**: Ningún factor domina (excepto averías críticas)
✅ **Flexible**: Permite ajustes manuales potentes
✅ **Eficiente**: Minimiza tiempo de desplazamiento
✅ **Transparente**: Muestra puntuación y desglose
✅ **Aprende**: Penaliza ubicaciones recién visitadas
✅ **Escalable**: Funciona con pocas o muchas ubicaciones

---

## Debugging y Monitoreo

### Consola del Navegador

Cuando activas el modo IA, verás:

```
[Maintenance AI] Calculando puntuaciones...
[Maintenance AI] Ruta optimizada:

📌 ADELANTADAS (2):
📌 1. Ubicación A (245 pts)
   📍 Prioridad: 50 | ⚠️ Avería: 100 | 📝 Obs: 15 | 📄 Contrato: 25
   ⏰ Tiempo: 45 (3 meses) | 🚗 Distancia: 54 (0.8 km) | 🗺️ Cluster: 45 (1.5 km)
   🚀 ADELANTADA - Posición fija al inicio
   ─────────────────────────────────────────

━━━ NORMALES (5) ━━━
  2. Ubicación B (189 pts)
   📍 Prioridad: 25 | ⚠️ Avería: 0 | 📝 Obs: 15 | 📄 Contrato: 25
   ⏰ Tiempo: 60 (4 meses) | 🚗 Distancia: 42 (2.1 km) | 🗺️ Cluster: 35 (2.8 km)
   ─────────────────────────────────────────

━━━ APLAZADAS (1) ━━━
⏸️ 8. Ubicación Z (95 pts)
   📍 Prioridad: 25 | ⚠️ Avería: 0 | 📝 Obs: 0 | 📄 Contrato: 15
   ⏰ Tiempo: 30 (2 meses) | 🚗 Distancia: 30 (4.5 km) | 🗺️ Cluster: 25 (5.2 km)
   ⏸️ APLAZADA - 8.5h restantes
   ─────────────────────────────────────────
```

### Breakdown de Puntuación

Cada item incluye `_scoreBreakdown`:
```javascript
{
  priority: 50,
  breakdown: 100,
  breakdownHighPriority: 30,
  observations: 15,
  contract: 25,
  time: 45,
  monthsSince: 3,
  distanceToStart: 42,
  distanceKm: "2.5",
  clustering: 35,
  nearestNeighborKm: "1.2"
}
```

---

## Casos de Uso Especiales

### Caso 1: Cliente VIP con Cita Programada
**Acción**: Marcar como "Adelantar"
**Resultado**: Va al inicio independientemente de puntuación
**Ventaja**: Garantiza que no se olvide la cita

### Caso 2: Ubicación Temporalmente Cerrada
**Acción**: Marcar como "Aplazar"
**Resultado**: Va al final durante 12h, luego vuelve a normal
**Ventaja**: No hay que recordar reactivarla manualmente

### Caso 3: Avería Urgente Lejana
- Avería + Alta Prioridad: 130 pts
- Lejos (20 km): 3 pts
- **Total base**: 133 pts
- **Decisión**: Se prioriza sobre ubicaciones cercanas sin avería
- **Opción**: Si es CRÍTICA, marcar como "Adelantar"

### Caso 4: Cluster de Ubicaciones
- 5 ubicaciones en radio de 2 km
- Todas reciben bonus de clustering (35-50 pts)
- **Resultado**: Se visitan todas en secuencia

### Caso 5: Contrato Anual con Retraso
- Contrato Anual: 0 pts
- 14 meses de retraso: +30 (base) + 60 (4 meses × 15) + 20 (>2 meses) = 110 pts
- **Resultado**: Alta prioridad a pesar de ser contrato anual

---

## Recomendaciones de Uso

1. **Usa Adelantar con moderación**: Solo para casos realmente urgentes o compromisos
2. **Aplazar es temporal**: Perfecto para posponer sin preocuparte de reactivar
3. **Confía en el sistema**: La puntuación IA está optimizada
4. **Revisa la consola**: Te muestra exactamente por qué cada ubicación está donde está
5. **Mantén prioridades actualizadas**: El sistema se basa en ellas
6. **Registra observaciones**: Ayudan a identificar ubicaciones problemáticas

---

## Actualizaciones Futuras Posibles

- [ ] Configurar duración personalizada para aplazar (6h, 12h, 24h)
- [ ] Machine Learning para predecir averías
- [ ] Consideración de tráfico en tiempo real (Google Maps API)
- [x] **Horarios de apertura de ubicaciones** ✅ IMPLEMENTADO v2.2
- [ ] Preferencias de clientes (días/horas)
- [ ] Tiempo estimado por visita
- [ ] Optimización multi-día
- [x] **Integración con calendario** ✅ IMPLEMENTADO v2.3

---

**Versión**: 2.3
**Fecha**: Diciembre 2025
**Autor**: Sistema de IA Antigravity
**Última actualización**: Añadido Factor 9 - Programación en Calendar con cálculo de tiempo de viaje

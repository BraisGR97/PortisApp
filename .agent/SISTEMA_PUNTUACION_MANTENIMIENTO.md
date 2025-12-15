# Sistema de Puntuación Avanzado para Organización de Mantenimientos

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

### 8. **Modificador Manual** (±100 puntos) 🎚️

El usuario puede ajustar manualmente la prioridad:
- **Adelantar**: +100 puntos (modificador base 50 × 2)
- **Normal**: +0 puntos
- **Aplazar**: -100 puntos (modificador base -50 × 2)

**Justificación**: 
- Permite al usuario tener control final sobre la ruta
- El modificador se amplifica (×2) para tener impacto significativo
- Útil para casos especiales o compromisos con clientes

---

### 9. **Bonus por Posición en Ruta** (Variable) 🚗

A medida que avanzas en la ruta, se prioriza más la cercanía:
- Fórmula: `distancePoints × 0.3 × routePosition`
- Solo aplica después de la primera ubicación

**Justificación**: 
- Optimización dinámica de ruta
- Después de visitar la primera ubicación, la siguiente debe ser la más cercana a ESA ubicación, no al punto de partida
- Mejora progresivamente la eficiencia del recorrido

---

## Rangos de Puntuación Total

### Puntuación Mínima Posible
- Ubicación lejana (3 pts)
- Sin cluster (2.5 pts)
- Recién visitada (-80 pts)
- Aplazada manualmente (-100 pts)
- **Total**: ≈ -175 puntos

### Puntuación Máxima Posible
- Prioridad Alta (50 pts)
- Avería + Alta Prioridad (130 pts)
- Observaciones (15 pts)
- Contrato Mensual (25 pts)
- Retraso significativo (95 pts)
- Muy cerca (60 pts)
- Buen clustering (50 pts)
- Adelantada manualmente (100 pts)
- **Total**: ≈ 525 puntos

### Puntuación Típica
Una ubicación "normal" sin factores especiales:
- Prioridad Media (25 pts)
- Sin avería (0 pts)
- Sin observaciones (0 pts)
- Contrato Trimestral (15 pts)
- En tiempo (30 pts)
- Distancia media 5km (30 pts)
- Clustering moderado (25 pts)
- **Total**: ≈ 125 puntos

---

## Estrategia de Optimización

### Fase 1: Identificación de Urgencias
El sistema primero identifica las ubicaciones más urgentes:
1. Averías con prioridad alta (hasta 180 pts solo por estos factores)
2. Ubicaciones con retraso significativo
3. Contratos frecuentes (mensuales/bimensuales)

### Fase 2: Optimización de Ruta
Una vez identificadas las urgencias, optimiza la ruta:
1. Comienza con la ubicación más urgente Y cercana
2. Agrupa ubicaciones cercanas entre sí (clustering)
3. Minimiza desplazamientos innecesarios

### Fase 3: Ajustes Manuales
El usuario puede:
1. Adelantar ubicaciones específicas (compromisos con clientes)
2. Aplazar ubicaciones no urgentes
3. Estos ajustes tienen gran impacto (±100 pts)

---

## Ventajas del Sistema

✅ **Multifactorial**: Considera 9 factores diferentes
✅ **Dinámico**: Se adapta al tiempo transcurrido y ubicación actual
✅ **Balanceado**: Ningún factor domina completamente (excepto averías críticas)
✅ **Flexible**: Permite ajustes manuales significativos
✅ **Eficiente**: Optimiza tiempo de desplazamiento
✅ **Inteligente**: Aprende del historial (penaliza recién visitados)
✅ **Escalable**: Funciona con pocas o muchas ubicaciones
✅ **Transparente**: Cada ubicación muestra su puntuación

---

## Debugging y Monitoreo

El sistema incluye un objeto `_scoreBreakdown` en cada item que muestra:
- Puntos por cada factor
- Distancias calculadas
- Meses desde último mantenimiento
- Modificadores aplicados

Ejemplo de breakdown:
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
  nearestNeighborKm: "1.2",
  manual: 0,
  routeOptimization: 0
}
```

---

## Casos de Uso Especiales

### Caso 1: Avería Urgente Lejana
- Avería + Alta Prioridad: 130 pts
- Lejos (20 km): 3 pts
- **Total base**: 133 pts
- **Decisión**: Se prioriza sobre ubicaciones cercanas sin avería

### Caso 2: Cluster de Ubicaciones
- 5 ubicaciones en radio de 2 km
- Todas reciben bonus de clustering (35-50 pts)
- **Resultado**: Se visitan todas en secuencia

### Caso 3: Contrato Anual con Retraso
- Contrato Anual: 0 pts
- 14 meses de retraso: +30 (base) + 60 (4 meses × 15) + 20 (>2 meses) = 110 pts
- **Resultado**: Alta prioridad a pesar de ser contrato anual

### Caso 4: Recién Visitado
- Cualquier puntuación base
- Penalización: -80 pts
- **Resultado**: Va al final de la lista automáticamente

---

## Recomendaciones de Uso

1. **Confía en el sistema**: Está diseñado para optimizar tu tiempo
2. **Usa modificadores con moderación**: Solo para casos especiales
3. **Revisa el breakdown**: Si una ubicación parece mal posicionada, revisa su desglose
4. **Actualiza prioridades**: Mantén las prioridades actualizadas para mejores resultados
5. **Registra observaciones**: Ayudan a identificar ubicaciones problemáticas

---

## Actualizaciones Futuras Posibles

- [ ] Machine Learning para predecir averías
- [ ] Consideración de tráfico en tiempo real
- [ ] Horarios de apertura de ubicaciones
- [ ] Preferencias de clientes (días/horas)
- [ ] Tiempo estimado por visita
- [ ] Optimización multi-día
- [ ] Integración con calendario

---

**Versión**: 2.0
**Fecha**: Diciembre 2025
**Autor**: Sistema de IA Antigravity

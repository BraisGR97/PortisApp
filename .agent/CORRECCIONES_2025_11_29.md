# Correcciones Realizadas - 29 de Noviembre 2025

## Resumen
Se han corregido 3 problemas críticos en la aplicación PortisApp relacionados con la carga de mantenimientos y permisos de Firestore.

---

## ✅ Problema 1: Tarjetas de Mantenimiento NO Cargan en Modo Normal

### Descripción del Problema
En `Main/Maintenance.js`, las tarjetas de mantenimiento no se cargaban cuando la aplicación estaba en modo normal (conectada a Firebase), aunque había mantenimientos guardados con fecha actual en Firestore.

### Causa
La función `fetchMaintenanceData` solo tenía implementada la lógica para **MOCK MODE** (líneas 172-220), pero le faltaba el bloque `else` para cargar datos desde Firestore cuando **NO** está en modo mock.

### Solución Aplicada
**Archivo**: `Main/Maintenance.js`  
**Líneas**: 218-232

Agregado el bloque `else` que:
1. Llama a `fetchMaintenanceFromFirestore(date)` para obtener datos de Firestore
2. Guarda los datos en `currentMaintenanceData` para el buscador
3. Renderiza la lista con `renderMaintenanceList(data, date)`
4. Maneja errores con try/catch y muestra mensajes al usuario

```javascript
} else {
    // MODO NORMAL: Cargar desde Firestore
    console.log('NORMAL MODE: Cargando datos desde Firestore.');
    try {
        data = await fetchMaintenanceFromFirestore(date);
        currentMaintenanceData = data;
        renderMaintenanceList(data, date);
    } catch (error) {
        console.error('Error al cargar mantenimientos desde Firestore:', error);
        showMessage('error', 'Error al cargar mantenimientos desde la base de datos.');
    }
}
```

---

## ✅ Problema 2: Actualización Automática de Fechas para Todos los Tipos de Contratos

### Descripción del Problema
Cuando una tarjeta se marca como completada desde Maintenance, solo se actualizaba correctamente la fecha para contratos "Mensual" (+1 mes) y "Anual" (+1 año), pero no para los demás tipos: Bimensual, Trimestral, Cuatrimestral y Semestral.

### Causa
La función `confirmCompleteMaintenance` en su lógica `updateLogic` solo consideraba dos casos:
- `isAnnual` → +1 año
- Todos los demás → +1 mes (incorrecto para Bimensual, Trimestral, etc.)

### Solución Aplicada
**Archivo**: `Main/Maintenance.js`  
**Líneas**: 385-429

Reescrita completamente la lógica de `updateLogic` para:
1. Detectar el tipo de contrato mediante `contractLower.includes()`
2. Asignar el incremento correcto de meses según el tipo:
   - **Mensual**: +1 mes
   - **Bimensual**: +2 meses
   - **Trimestral**: +3 meses
   - **Cuatrimestral**: +4 meses
   - **Semestral**: +6 meses
   - **Anual**: +12 meses
3. Calcular el nuevo mes y año con un bucle `while` para manejar correctamente el cambio de año

```javascript
const updateLogic = (repair) => {
    let nextMonth = repair.maintenance_month;
    let nextYear = repair.maintenance_year;
    const contractLower = repair.contract ? repair.contract.toLowerCase() : '';

    // Determinar incremento de meses según el tipo de contrato
    let monthsToAdd = 1; // Por defecto mensual

    if (contractLower.includes('anual')) {
        monthsToAdd = 12;
    } else if (contractLower.includes('semestral')) {
        monthsToAdd = 6;
    } else if (contractLower.includes('cuatrimestral')) {
        monthsToAdd = 4;
    } else if (contractLower.includes('trimestral')) {
        monthsToAdd = 3;
    } else if (contractLower.includes('bimensual')) {
        monthsToAdd = 2;
    } else if (contractLower.includes('mensual')) {
        monthsToAdd = 1;
    }

    // Calcular nuevo mes y año
    nextMonth += monthsToAdd;
    while (nextMonth > 12) {
        nextMonth -= 12;
        nextYear += 1;
    }

    return {
        maintenance_month: nextMonth,
        maintenance_year: nextYear,
        status: 'Pendiente'
    };
};
```

---

## ✅ Problema 3: Error de Permisos en History.js

### Descripción del Problema
Al intentar cargar la lista de registros en History, se producía el error:
```
History.js:228 Error al cargar registros: FirebaseError: Missing or insufficient permissions.
```

### Causa
El código usaba la ruta de subcolección `users/{userId}/history`, pero según las reglas de Firestore definidas, la colección debe ser:

```javascript
// Reglas de Firestore
match /history/{historyId} {
  allow read: if request.auth != null && request.auth.uid == resource.data.userId;
}
```

La colección es **`history`** (raíz), no una subcolección, y el `userId` es un **campo** dentro de los documentos, no parte de la ruta.

### Solución Aplicada
**Archivo**: `History/History.js`  
**Líneas modificadas**: 145-150, 214-217

#### Cambio 1: Actualizar `getHistoryCollectionRef()`
```javascript
function getHistoryCollectionRef() {
    if (!db || !userId) return null;
    // Colección raíz 'history' según las reglas de Firestore
    // Filtraremos por userId en las queries
    return db.collection('history');
}
```

#### Cambio 2: Agregar filtro por `userId` en `loadRecords()`
```javascript
// Filtrar por userId y location según las reglas de Firestore
const snapshot = await historyRef
    .where('userId', '==', userId)
    .where('location', '==', location)
    .orderBy('completedAt', 'desc')
    .get();
```

---

## Notas Importantes

### Índices de Firestore Requeridos
Para que la query en `loadRecords()` funcione correctamente, necesitas crear un **índice compuesto** en Firestore:

**Colección**: `history`  
**Campos**:
1. `userId` (Ascending)
2. `location` (Ascending)
3. `completedAt` (Descending)

Firebase te dará un enlace directo para crear este índice cuando intentes ejecutar la query por primera vez.

### Estructura de Documentos en `history`
Cada documento en la colección `history` debe tener el campo `userId`:

```javascript
{
  userId: "uid-del-usuario",
  location: "Nombre de la ubicación",
  completedAt: timestamp,
  // ... otros campos
}
```

---

## Testing Recomendado

1. **Modo Normal (Firebase)**:
   - Verifica que las tarjetas de mantenimiento carguen correctamente
   - Completa un mantenimiento y verifica que la fecha se actualice según el tipo de contrato
   - Accede a History y verifica que los registros carguen sin errores de permisos

2. **Modo Mock**:
   - Verifica que todo siga funcionando correctamente en modo simulado
   - Prueba los diferentes tipos de contratos al completar mantenimientos

3. **Tipos de Contratos a Probar**:
   - Mensual (debe pasar de noviembre 2025 → diciembre 2025)
   - Bimensual (debe pasar de noviembre 2025 → enero 2026)
   - Trimestral (debe pasar de noviembre 2025 → febrero 2026)
   - Cuatrimestral (debe pasar de noviembre 2025 → marzo 2026)
   - Semestral (debe pasar de noviembre 2025 → mayo 2026)
   - Anual (debe pasar de noviembre 2025 → noviembre 2026)

---

## Archivos Modificados

1. ✅ `Main/Maintenance.js` - 2 correcciones
2. ✅ `History/History.js` - 1 corrección

---

**Fecha de Correcciones**: 29 de Noviembre de 2025  
**Estado**: ✅ Completado

# Correcciones Necesarias - Flujo Completo de Mantenimientos

## Resumen del Flujo Correcto

### 1. Creación en Repairs
- Las tarjetas se crean en `Repairs.js`
- Cada tarjeta tiene: ubicación, modelo, contrato, fecha_mantenimiento (mes/año), prioridad, etc.
- Se guardan en la colección `users/{userId}/repairs`

### 2. Aparición en Maintenance  
- Cuando `maintenance_month` y `maintenance_year` coinciden con la fecha ACTUAL (mes y año)
- La tarjeta aparece en `Maintenance.js` con estado "En Progreso"
- El usuario puede ver detalles, editar (sin cambiar estado), o completar

### 3. Completar Mantenimiento
Al hacer clic en "Completar" o cuando la fecha pasa:

**Paso 1: Guardar en History**
- Copiar TODOS los datos actuales del mantenimiento
- Agregar campos adicionales:
  - `status: 'Completado'`
  - `completedAt: timestamp`
  - `username: nombre del usuario que completó`
- Guardar en colección `history` (raíz, no subcolección)
- Incluir el campo `userId` para las reglas de Firestore

**Paso 2: Actualizar fecha en Repairs**
- Calcular nueva fecha según el contrato:
  - Mensual: +1 mes
  - Bimensual: +2 meses
  - Trimestral: +3 meses
  - Cuatrimestral: +4 meses
  - Semestral: +6 meses
  - Anual: +12 meses
- Actualizar `maintenance_month` y `maintenance_year`
- Mantener `status: 'Pendiente'` para el próximo ciclo

### 4. Visualización en History
- `History.js` muestra todas las tarjetas únicas (agrupadas por ubicación/modelo/contrato)
- Al hacer clic en una tarjeta, muestra todos los registros de `history` para esa ubicación
- Cada registro muestra:
  - Fecha de completado
  - Usuario que lo completó
  - Datos del mantenimiento en ese momento
  - Estado: "Completado"

## Problemas Actuales

### ❌ Problema 1: Error al editar
**Línea** `Maintenance.js:787`
**Error**: `Cannot read properties of null (reading 'value')`
**Causa**: Intenta leer `document.getElementById('edit-status').value` pero ese campo no existe en el modal de edición
**Sol

ución**: Eliminar la línea 787 que intenta leer `edit-status`

### ❌ Problema 2: No guarda en History al completar
**Causa**: La función `confirmCompleteMaintenance` solo actualiza la fecha, NO guarda registro en History
**Solución**: Agregar lógica para guardar en History ANTES de actualizar la fecha

##Cambios Necesarios en Maintenance.js

### Cambio 1: Eliminar línea de edit-status (línea ~787)
```javascript
// ANTES:
const newValues = {
    location: document.getElementById('edit-location').value.trim(),
    model: document.getElementById('edit-model').value.trim() || null,
    contract: document.getElementById('edit-contract').value.trim(),
    key_id: document.getElementById('edit-key_id').value.trim() || null,
    maintenance_year: parseInt(dateInput[0]),
    maintenance_month: parseInt(dateInput[1]),
    priority: document.getElementById('edit-priority').value,
    status: document.getElementById('edit-status').value,  // ← ELIMINAR ESTA LÍNEA
    description: document.getElementById('edit-description').value.trim(),
    contact: (contactName || contactPhone || contactNotes) ? {
        name: contactName,
        phone: contactPhone,
        notes: contactNotes
    } : null
};

// DESPUÉS:
const newValues = {
    location: document.getElementById('edit-location').value.trim(),
    model: document.getElementById('edit-model').value.trim() || null,
    contract: document.getElementById('edit-contract').value.trim(),
    key_id: document.getElementById('edit-key_id').value.trim() || null,
    maintenance_year: parseInt(dateInput[0]),
    maintenance_month: parseInt(dateInput[1]),
    priority: document.getElementById('edit-priority').value,
    description: document.getElementById('edit-description').value.trim(),
    contact: (contactName || contactPhone || contactNotes) ? {
        name: contactName,
        phone: contactPhone,
        notes: contactNotes
    } : null
};
```

### Cambio 2: Guardar en History al completar (MOCK MODE)
```javascript
// En la función confirmCompleteMaintenance, sección MOCK MODE
if (window.IS_MOCK_MODE || !isFirebaseReady) {
    try {
        let allRepairs = loadMaintenanceFromStorage();
        const index = allRepairs.findIndex(r => r.id === id);
        if (index !== -1) {
            const currentRepair = allRepairs[index];
            const updates = updateLogic(currentRepair);
            
            // 🆕 NUEVO: Guardar en History
            const historyRecord = {
                id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                ...currentRepair,
                status: 'Completado',
                completedAt: new Date().toISOString(),
                username: sessionStorage.getItem('portis-user-display-name') || 'Usuario'
            };
            
            const MOCK_HISTORY_KEY = 'mock_history_data';
            let historyData = [];
            try {
                const stored = localStorage.getItem(MOCK_HISTORY_KEY);
                historyData = stored ? JSON.parse(stored) : [];
            } catch (e) {
                console.error('Error al leer history:', e);
            }
            historyData.push(historyRecord);
            localStorage.setItem(MOCK_HISTORY_KEY, JSON.stringify(historyData));
            
            // Actualizar fecha para próximo ciclo
            allRepairs[index] = { ...allRepairs[index], ...updates };
            localStorage.setItem(MOCK_REPAIRS_KEY, JSON.stringify(allRepairs));
            
            showMessage('success', 'Mantenimiento completado y reprogramado.');
            window.fetchMaintenanceData();
        }
    } catch (e) {
        console.error("Error updating mock maintenance:", e);
        showMessage('error', 'Error al actualizar.');
    }
}
```

### Cambio 3: Guardar en History al completar (FIREBASE MODE)
```javascript
// En la función confirmCompleteMaintenance, sección FIREBASE
} else {
    try {
        const repairsRef = getRepairsCollectionRef();
        if (repairsRef) {
            const doc = await repairsRef.doc(id).get();
            if (doc.exists) {
                const currentRepair = { id: doc.id, ...doc.data() };
                const updates = updateLogic(currentRepair);
                
                // 🆕 NUEVO: Guardar en History
                const historyRecord = {
                    ...currentRepair,
                    userId: userId, // Campo requerido por reglas de Firestore
                    status: 'Completado',
                    completed At: firebase.firestore.FieldValue.serverTimestamp(),
                    username: sessionStorage.getItem('portis-user-display-name') || 'Usuario'
                };
                
                await db.collection('history').add(historyRecord);
                
                // Actualizar fecha para próximo ciclo
                await repairsRef.doc(id).update(updates);
                
                showMessage('success', 'Mantenimiento completado y reprogramado.');
                window.fetchMaintenanceData();
            }
        }
    } catch (e) {
        console.error("Error updating firestore maintenance:", e);
        showMessage('error', 'Error al actualizar en base de datos.');
    }
}
```

## Resultado Esperado

1. ✅ Editar mantenimiento funciona sin errores
2. ✅ Al completar un mantenimiento:
   - Se guarda un registro en History con estado "Completado"
   - Se actualiza la fecha del mantenimiento en Repairs para el próximo ciclo
3. ✅ En History se pueden ver todos los registros de mantenimientos completados
4. ✅ El flujo completo funciona tanto en modo Mock como en Firebase

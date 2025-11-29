# Instrucciones de Corrección Manual

## ⚠️ IMPORTANTE
Las herramientas de edición tienen problemas con archivos grandes. 
Necesitas hacer estos cambios MANUALMENTE.

## Cambio 1: Línea 787 - Eliminar línea de edit-status

**Archivo**: `Main/Maintenance.js`
**Línea**: 787

**ELIMINAR esta línea:**
```javascript
            status: document.getElementById('edit-status').value,
```

**Resultado**: Las líneas 779-794 deben quedar así:
```javascript
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

---

## Cambio 2: Líneas 443-458 - Agregar guardado en History (MOCK MODE)

**Archivo**: `Main/Maintenance.js`
**Líneas**: 443-458

**REEMPLAZAR desde línea 443 hasta 458 con:**

```javascript
        if (window.IS_MOCK_MODE || !isFirebaseReady) {
            try {
                let allRepairs = loadMaintenanceFromStorage();
                const index = allRepairs.findIndex(r => r.id === id);
                if (index !== -1) {
                    const currentRepair = allRepairs[index];
                    const updates = updateLogic(currentRepair);
                    
                    // Guardar registro en History ANTES de actualizar
                    const historyRecord = {
                        id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        ...currentRepair,
                        status: 'Completado',
                        completedAt: new Date().toISOString(),
                        username: sessionStorage.getItem('portis-user-display-name') || 'Usuario'
                    };
                    
                    // Guardar en localStorage para History
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
                    
                    // Actualizar la fecha del mantenimiento para el próximo ciclo
                    allRepairs[index] = { ...allRepairs[index], ...updates };
                    localStorage.setItem(MOCK_REPAIRS_KEY, JSON.stringify(allRepairs));
                    
                    showMessage('success', 'Mantenimiento completado y reprogramado.');
                    window.fetchMaintenanceData();
                }
            } catch (e) {
                console.error("Error updating mock maintenance:", e);
                showMessage('error', 'Error al actualizar.');
            }
```

---

## Cambio 3: Líneas 459-479 - Agregar guardado en History (FIREBASE MODE)

**Archivo**: `Main/Maintenance.js`
**Líneas**: 459-479

**REEMPLAZAR desde línea 459 hasta 479 con:**

```javascript
        } else {
            try {
                const repairsRef = getRepairsCollectionRef();
                if (repairsRef) {
                    // Primero necesitamos obtener el documento para saber su contrato actual
                    const doc = await repairsRef.doc(id).get();
                    if (doc.exists) {
                        const currentRepair = { id: doc.id, ...doc.data() };
                        const updates = updateLogic(currentRepair);
                        
                        // Guardar registro en History (colección raíz) ANTES de actualizar
                        const historyRecord = {
                            ...currentRepair,
                            userId: userId,
                            status: 'Completado',
                            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            username: sessionStorage.getItem('portis-user-display-name') || 'Usuario'
                        };
                        
                        // Guardar en la colección raíz 'history'
                        await db.collection('history').add(historyRecord);
                        
                        // Actualizar la fecha del mantenimiento para el próximo ciclo
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
    };
```

---

## Verificación

Después de hacer los cambios, verifica:

1. ✅ La línea 787 (edit-status) está eliminada
2. ✅ La función en modo MOCK guarda en History antes de actualizar la fecha
3. ✅ La función en modo FIREBASE guarda en History antes de actualizar la fecha
4. ✅ No hay errores de sintaxis (llaves balanceadas, punto y coma, etc.)

## Prueba

1. Crea una tarjeta en Repairs con fecha actual (noviembre 2025)
2. Ve a Maintenance y verifica que aparece la tarjeta
3. Haz clic en "Completar"
4. Verifica que:
   - La tarjeta desaparece de Maintenance
   - En localStorage `mock_history_data` aparece el registro con status='Completado'
   - En localStorage `portis-repairs-mock` la fecha se actualizó correctamente
5. Edita una tarjeta sin errores

// =============================================================================
// CÓDIGO PARA REEMPLAZAR EN Maintenance.js
// =============================================================================

// -----------------------------------------------------------------------------
// CAMBIO 1: Reemplazar líneas 443-458 (Modo MOCK)
// -----------------------------------------------------------------------------
// BUSCA ESTO (líneas 443-458):
if (window.IS_MOCK_MODE || !isFirebaseReady) {
    try {
        let allRepairs = loadMaintenanceFromStorage();
        const index = allRepairs.findIndex(r => r.id === id);
        if (index !== -1) {
            const updates = updateLogic(allRepairs[index]);
            allRepairs[index] = { ...allRepairs[index], ...updates };

            localStorage.setItem(MOCK_REPAIRS_KEY, JSON.stringify(allRepairs));
            showMessage('success', 'Mantenimiento completado y reprogramado.');
            window.fetchMaintenanceData();
        }
    } catch (e) {
        console.error("Error updating mock maintenance:", e);
        showMessage('error', 'Error al actualizar.');
    }

    // REEMPLAZA CON ESTO:
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

        // -----------------------------------------------------------------------------
        // CAMBIO 2: Reemplazar líneas 459-478 (Modo FIREBASE)
        // -----------------------------------------------------------------------------
        // BUSCA ESTO (líneas 459-478):
    } else {
        try {
            const repairsRef = getRepairsCollectionRef();
            if (repairsRef) {
                // Primero necesitamos obtener el documento para saber su contrato actual
                const doc = await repairsRef.doc(id).get();
                if (doc.exists) {
                    const repair = doc.data();
                    const updates = updateLogic(repair);

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

// REEMPLAZA CON ESTO:
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

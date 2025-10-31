// History.js - Lógica para la página de detalle de una sola avería

let currentHistoryId = null;
let currentInitialObservations = ''; // Nueva variable para almacenar el valor inicial

// --- Utilidades del DOM ---

function showMessageBox(message, isError = true) {
    const msgBox = document.getElementById('historyMessageBox');
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (!isError) {
        msgBox.classList.add('success');
    } else {
        msgBox.classList.add('error');
    }
    
    // Ocultar mensaje después de 5 segundos
    setTimeout(() => {
        msgBox.classList.add('hidden');
    }, 5000);
}

/**
 * Rellena los elementos de vista (no editables) con los datos.
 */
function fillDetailView(data) {
    const dateParts = data.fecha ? data.fecha.split('-') : [];
    const formattedDate = dateParts.length === 2 ? `${dateParts[1]}/${dateParts[0]}` : 'Fecha Desconocida';



    document.getElementById('detailUbicacion').textContent = data.ubicacion || 'N/A';
    document.getElementById('detailModelo').textContent = data.modelo || 'N/A';
    document.getElementById('detailLlave').textContent = data.llave || 'N/A';
    document.getElementById('detailContrato').textContent = data.contrato || 'N/A';
    document.getElementById('detailFecha').textContent = formattedDate;
    document.getElementById('detailAveria').textContent = data.averia || 'N/A';
	document.getElementById('detailcompletedAt').textContent = data.completedAt || 'N/A';
}

/**
 * Rellena los campos de input (editables) con los datos.
 */
function fillInputFields(data) {
    // Rellena y captura el valor inicial de observaciones
    const observationsTextarea = document.getElementById('detailObservaciones');
    observationsTextarea.value = data.observaciones || '';
    currentInitialObservations = observationsTextarea.value; 
}

// --- Lógica de Datos ---

/**
 * Obtiene el ID de la avería de la URL.
 * @returns {string|null} El ID de la avería o null.
 */
function getHistoryIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

/**
 * Carga los datos específicos de la avería desde Firestore.
 */
async function loadHistoryDetails() {
    currentHistoryId = getHistoryIdFromUrl();
    
    if (!currentHistoryId) {
        document.getElementById('detailUbicacion').textContent = "Error: ID de avería no encontrado.";
        showMessageBox("No se pudo cargar la avería. Falta el ID en la URL.", true);
        return;
    }
    
    const db = window.db;
    const historyDocRef = window.doc(db, 'records', currentHistoryId);

    try {
        const docSnap = await window.getDoc(historyDocRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Llenar los campos de vista y edición
            fillDetailView(data);
            fillInputFields(data);
        } else {
            document.getElementById('detailUbicacion').textContent = `Error: No existe avería con ID ${currentHistoryId}`;
            showMessageBox("Avería no encontrada en la base de datos.", true);
        }
    } catch (error) {
        console.error("Error al cargar detalles de la avería:", error);
        showMessageBox(`Error de conexión al cargar: ${error.message}`, true);
    }
}

/**
 * Guarda las observaciones editadas de la reparación.
 */
async function handleSaveObservations(event) {
    event.preventDefault();
    
    const recordId = currentHistoryId;
    const submitBtn = document.getElementById('saveObservationsBtn');
    submitBtn.disabled = true;

    if (!recordId) {
        showMessageBox("Error: ID de avería no encontrado.", true);
        submitBtn.disabled = false;
        return;
    }

    showMessageBox("Guardando observaciones...", false);
    
    const newObservations = document.getElementById('detailObservaciones').value;
    
    const db = window.db;
    const recordDocRef = window.doc(db, 'records', recordId); 

    try {
        await window.updateDoc(recordDocRef, {
            observaciones: newObservations,
            updatedAt: new Date().toISOString()
        });
        
        showMessageBox("Observaciones guardadas con éxito.", false);
        document.getElementById('saveObservationsBtn').classList.add('hidden');
        currentInitialObservations = newObservations; // Actualiza el valor inicial
        
    } catch (error) {
        console.error("Error al actualizar observaciones:", error);
        showMessageBox(`Error al guardar: ${error.message}`, true);
    } finally {
        setTimeout(() => { submitBtn.disabled = false; }, 1000);
    }
}

/**
 * Maneja la eliminación de la avería.
 */
async function handleDeleteHistory() {
    if (!currentHistoryId) return;
    
    const confirmed = confirm("¿Estás seguro de que quieres ELIMINAR esta avería? Esta acción es irreversible.");
    
    if (confirmed) {
        const db = window.db;
        const recordDocRef = window.doc(db, 'records', currentHistoryId);
        
        try {
            showMessageBox("Eliminando...", false);
            await window.deleteDoc(recordDocRef);
            
            alert("Avería eliminada con éxito.");
            window.location.href = '../Records/Records.html'; 
            
        } catch (error) {
            console.error("Error al eliminar:", error);
            showMessageBox(`Error al eliminar: ${error.message}`, true);
        }
    }
}

// ... (dentro de tu función de carga, ej: loadRecordDetails) ...
// Ejemplo: cuando cargas los detalles, almacena los datos en la variable global:
/* async function loadHistoryDetails() {
    // ... lógica de carga ...
    currentRecordData = { id: doc.id, ...doc.data() };
    // ...
}
*/

// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    const editDetailsBtn = document.getElementById('editDetailsBtn'); 
    const deleteBtn = document.getElementById('deleteHistoryBtn'); 
    const completeBtn = document.getElementById('completeHistoryBtn');
    const saveObservationsForm = document.getElementById('saveObservationsForm');
    const editHistoryForm = document.getElementById('editHistoryForm');
    const observationsTextarea = document.getElementById('detailObservaciones');
    const saveObservationsBtn = document.getElementById('saveObservationsBtn');

    // Navegación
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '../Records/Records.html'; 
        });
    }
    
    // Guardar Observaciones
    if (saveObservationsForm) {
        saveObservationsForm.addEventListener('submit', handleSaveObservations);
    }
    
    // Control de visibilidad del botón Guardar Observaciones
    if (observationsTextarea && saveObservationsBtn) {
        
        // Se usa 'input' para detectar cualquier cambio (teclado, pegar, eliminar)
        observationsTextarea.addEventListener('input', function() {
            const currentValue = this.value;
            // Usa la variable global actualizada
            if (currentValue !== currentInitialObservations) { 
                saveObservationsBtn.classList.remove('hidden');
            } else {
                saveObservationsBtn.classList.add('hidden');
            }
        });
    }

    // Cargar los detalles de la avería
    loadHistoryDetails();
});
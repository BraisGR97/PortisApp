// History.js - Lógica para la página de detalle de un registro de historial

let currentHistoryId = null;
let currentInitialObservations = ''; // Nueva variable para almacenar el valor inicial

// --- Lógica del Modal de Confirmación ---
let modal, modalTitle, modalMessage, btnYes, btnNo, btnCancel; // Referencias al DOM del modal

function initializeModalReferences() {
    modal = document.getElementById('confirmationModal'); 
    modalTitle = document.getElementById('modalTitle');
    modalMessage = document.getElementById('modalMessage');
    btnYes = document.getElementById('btnYes');
    btnNo = document.getElementById('btnNo');
    btnCancel = document.getElementById('btnCancel');
}

/** Muestra el modal de confirmación para eliminar. */
function showDeleteConfirmationModal() {
    if (!modal) return;
    
    modalTitle.textContent = '¡ATENCIÓN! Eliminar Registro';
    modalMessage.textContent = 'Estás seguro de que deseas ELIMINAR permanentemente este registro del historial?';
    btnYes.textContent = 'Sí, Eliminar';
    btnNo.textContent = 'No';
    btnCancel.classList.add('hidden'); 
    btnNo.style.display = 'inline-block';
    
    modal.classList.remove('hidden'); 
    modal.focus();
}

/** Oculta el modal de confirmación. */
function hideConfirmationModal() {
    if (modal) {
        modal.classList.add('hidden');
    }
}

/** * Maneja la respuesta del modal.
 * @param {boolean} confirmed - true si pulsa Sí; false si pulsa No.
 */
function handleConfirmation(confirmed) {
    hideConfirmationModal(); // Cerrar el modal inmediatamente

    if (confirmed) {
        handleDeleteRecord();
    } 
    // Si pulsa 'No' (confirmed es false), simplemente se cierra el modal.
}


// --- Lógica de Eliminación de Firestore ---

async function handleDeleteRecord() {
    const recordId = currentHistoryId;

    if (!recordId) {
        showMessageBox("Error: ID de registro no encontrado.", true);
        return;
    }

    const db = window.db; // Asumiendo que 'db' se expone globalmente desde el script de Firebase
    const recordDocRef = window.doc(db, 'records', recordId); // Colección 'records'
    
    showMessageBox("Eliminando registro del historial...", false);

    try {
        await window.deleteDoc(recordDocRef);
        
        showMessageBox("✅ Registro de historial eliminado con éxito. Redirigiendo...", false);
        
        // Redirigir a Records.html (Requisito)
        setTimeout(() => {
            window.location.href = '../Records/Records.html'; 
        }, 1500); 
        
    } catch (error) {
        console.error("FIREBASE ERROR: Error al eliminar el registro:", error);
        showMessageBox(`❌ Error al eliminar: ${error.message}`, true);
    }
}

// --- Utilidades del DOM ---

function showMessageBox(message, isError = true) {
    const msgBox = document.getElementById('historyMessageBox');
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (!isError) {
        msgBox.classList.add('success');
        msgBox.classList.remove('error'); // Asegurar que se elimina 'error'
    } else {
        msgBox.classList.add('error');
        msgBox.classList.remove('success'); // Asegurar que se elimina 'success'
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

    // Formatear la fecha de completado (ISO String)
    let completedAtDate = 'N/A';
    if (data.completedAt) {
        try {
            // Crea un objeto Date y lo formatea (ej: 01/11/2025 12:00)
            const date = new Date(data.completedAt);
            completedAtDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (e) {
            console.error("Error al parsear completedAt:", e);
        }
    }


    document.getElementById('detailUbicacion').textContent = data.ubicacion || 'N/A';
    document.getElementById('detailModelo').textContent = data.modelo || 'N/A';
    document.getElementById('detailLlave').textContent = data.llave || 'N/A';
    document.getElementById('detailContrato').textContent = data.contrato || 'N/A';
    document.getElementById('detailFecha').textContent = formattedDate;
    document.getElementById('detailAveria').textContent = data.averia || 'N/A';
	document.getElementById('detailcompletedAt').textContent = completedAtDate;
}

/**
 * Rellena los campos de input (editables) con los datos.
 */
function fillInputFields(data) {
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


// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function() {
    
    // Inicializar referencias al DOM del modal (CLAVE)
    initializeModalReferences(); 
    
    const backBtn = document.getElementById('backBtn');
    const deleteBtn = document.getElementById('deleteHistoryBtn'); 
    const saveObservationsForm = document.getElementById('saveObservationsForm');
    const observationsTextarea = document.getElementById('detailObservaciones');
    const saveObservationsBtn = document.getElementById('saveObservationsBtn');

    // --- Listeners de Navegación y Observaciones ---
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '../Records/Records.html'; 
        });
    }
    
    if (saveObservationsForm) {
        saveObservationsForm.addEventListener('submit', handleSaveObservations);
    }
    
    // Control de visibilidad del botón Guardar Observaciones
    if (observationsTextarea && saveObservationsBtn) {
        observationsTextarea.addEventListener('input', function() {
            const currentValue = this.value;
            if (currentValue !== currentInitialObservations) { 
                saveObservationsBtn.classList.remove('hidden');
            } else {
                saveObservationsBtn.classList.add('hidden');
            }
        });
    }

    // --- Listeners del Modal ---

    // 1. Botón para abrir el modal de eliminación
    if (deleteBtn) {
        deleteBtn.addEventListener('click', showDeleteConfirmationModal);
    }

    // 2. Botones de respuesta del modal
    if (btnYes) {
        btnYes.addEventListener('click', () => handleConfirmation(true));
    }
    if (btnNo) {
        btnNo.addEventListener('click', () => handleConfirmation(false)); // Cierra el modal
    }
    // btnCancel no es necesario, pero lo mantenemos si lo necesitas más tarde:
    if (btnCancel) { 
        btnCancel.addEventListener('click', hideConfirmationModal);
    }

    // Cargar los detalles de la avería
    loadHistoryDetails();
});
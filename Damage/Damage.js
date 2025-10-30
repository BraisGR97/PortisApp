// Damage.js - Lógica para la página de detalle de una sola avería

let currentDamageId = null;
let currentInitialObservations = ''; // Nueva variable para almacenar el valor inicial

// --- Utilidades del DOM ---

function showMessageBox(message, isError = true) {
    const msgBox = document.getElementById('damageMessageBox');
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
}

/**
 * Rellena los campos de input (editables) con los datos.
 */
function fillInputFields(data) {
    document.getElementById('inputUbicacion').value = data.ubicacion || '';
    document.getElementById('inputModelo').value = data.modelo || '';
    document.getElementById('inputLlave').value = data.llave || '';
    document.getElementById('inputContrato').value = data.contrato || '';
    document.getElementById('inputFecha').value = data.fecha || '';
    document.getElementById('inputAveria').value = data.averia || '';
    
    // Rellena y captura el valor inicial de observaciones
    const observationsTextarea = document.getElementById('detailObservaciones');
    observationsTextarea.value = data.observaciones || '';
    currentInitialObservations = observationsTextarea.value; 
}

/**
 * Habilita/Deshabilita el modo edición para los campos principales.
 */
function enableEditMode(enable) {
    const detailView = document.getElementById('detailView');
    const editForm = document.getElementById('editDamageForm');
    const savePrimaryBtn = document.getElementById('savePrimaryDetailsBtn');
    const editDetailsBtn = document.getElementById('editDetailsBtn');
    
    if (enable) {
        // Modo Edición Activado
        detailView.classList.add('hidden');
        editForm.classList.remove('hidden');
        savePrimaryBtn.classList.remove('hidden');
        editDetailsBtn.classList.add('active'); // Para indicar que está activo
        showMessageBox("Modo edición activado. Pulsa 'Guardar Cambios' para aplicar.", false);
    } else {
        // Modo Edición Desactivado
        detailView.classList.remove('hidden');
        editForm.classList.add('hidden');
        savePrimaryBtn.classList.add('hidden');
        editDetailsBtn.classList.remove('active');
        
        // Muestra mensaje solo si se ha desactivado manualmente (no después de un guardado exitoso)
        // La lógica de guardado ya muestra su propio mensaje de éxito/error.
        if (!document.getElementById('damageMessageBox').textContent.includes("guardado con éxito")) {
            showMessageBox("Modo edición desactivado.", false); 
        }
    }
}

// --- Lógica de Datos ---

/**
 * Obtiene el ID de la avería de la URL.
 * @returns {string|null} El ID de la avería o null.
 */
function getDamageIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

/**
 * Carga los datos específicos de la avería desde Firestore.
 */
async function loadDamageDetails() {
    currentDamageId = getDamageIdFromUrl();
    
    if (!currentDamageId) {
        document.getElementById('detailUbicacion').textContent = "Error: ID de avería no encontrado.";
        showMessageBox("No se pudo cargar la avería. Falta el ID en la URL.", true);
        return;
    }
    
    const db = window.db;
    const damageDocRef = window.doc(db, 'repairs', currentDamageId);

    try {
        const docSnap = await window.getDoc(damageDocRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Llenar los campos de vista y edición
            fillDetailView(data);
            fillInputFields(data);
            // **IMPORTANTE**: Deshabilitar el modo edición al cargar
            enableEditMode(false); 
        } else {
            document.getElementById('detailUbicacion').textContent = `Error: No existe avería con ID ${currentDamageId}`;
            showMessageBox("Avería no encontrada en la base de datos.", true);
        }
    } catch (error) {
        console.error("Error al cargar detalles de la avería:", error);
        showMessageBox(`Error de conexión al cargar: ${error.message}`, true);
    }
}

// --- Manejadores de Guardado y Eliminación ---

/**
 * Maneja el guardado de los campos principales de la avería.
 */
async function handleSavePrimaryDetails(event) {
    event.preventDefault();
    
    const repairId = currentDamageId;
    const submitBtn = document.getElementById('savePrimaryDetailsBtn');
    submitBtn.disabled = true;

    if (!repairId) {
        showMessageBox("Error: ID de avería no encontrado.", true);
        submitBtn.disabled = false;
        return;
    }

    showMessageBox("Guardando cambios principales...", false);

    const updatedData = {
        ubicacion: document.getElementById('inputUbicacion').value,
        modelo: document.getElementById('inputModelo').value,
        llave: document.getElementById('inputLlave').value,
        contrato: document.getElementById('inputContrato').value,
        fecha: document.getElementById('inputFecha').value,
        averia: document.getElementById('inputAveria').value,
        updatedAt: new Date().toISOString()
    };
    
    const db = window.db;
    const repairDocRef = window.doc(db, 'repairs', repairId);

    try {
        await window.updateDoc(repairDocRef, updatedData);
        
        showMessageBox("Cambios guardados con éxito.", false);
        
        // Deshabilita la edición después de guardar y actualiza la vista
        enableEditMode(false);
        fillDetailView(updatedData);
        
    } catch (error) {
        console.error("Error al actualizar detalles:", error);
        showMessageBox(`Error al guardar: ${error.message}`, true);
    } finally {
        setTimeout(() => { submitBtn.disabled = false; }, 1000);
    }
}

/**
 * Guarda las observaciones editadas de la reparación.
 */
async function handleSaveObservations(event) {
    event.preventDefault();
    
    const repairId = currentDamageId;
    const submitBtn = document.getElementById('saveObservationsBtn');
    submitBtn.disabled = true;

    if (!repairId) {
        showMessageBox("Error: ID de avería no encontrado.", true);
        submitBtn.disabled = false;
        return;
    }

    showMessageBox("Guardando observaciones...", false);
    
    const newObservations = document.getElementById('detailObservaciones').value;
    
    const db = window.db;
    const repairDocRef = window.doc(db, 'repairs', repairId); 

    try {
        await window.updateDoc(repairDocRef, {
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
async function handleDeleteDamage() {
    if (!currentDamageId) return;
    
    const confirmed = confirm("¿Estás seguro de que quieres ELIMINAR esta avería? Esta acción es irreversible.");
    
    if (confirmed) {
        const db = window.db;
        const repairDocRef = window.doc(db, 'repairs', currentDamageId);
        
        try {
            showMessageBox("Eliminando...", false);
            await window.deleteDoc(repairDocRef);
            
            alert("Avería eliminada con éxito.");
            window.location.href = '../Repairs/Repairs.html'; 
            
        } catch (error) {
            console.error("Error al eliminar:", error);
            showMessageBox(`Error al eliminar: ${error.message}`, true);
        }
    }
}
// ... (Otras funciones y lógica de Damage.js) ...

/**
 * Abre el panel flotante de confirmación para completar la avería.
 */
function openCompleteModal() {
    document.getElementById('completeModal').classList.remove('hidden');
    // Asegurarse de que el mensaje de error/éxito del modal esté limpio
    document.getElementById('modalCompleteMessageBox').classList.add('hidden');
}

/**
 * Cierra el panel flotante de confirmación.
 */
function closeCompleteModal() {
    document.getElementById('completeModal').classList.add('hidden');
}
/**
 * Calcula la nueva fecha de la próxima reparación/mantenimiento basándose en el contrato.
 * @param {string} currentFecha - Fecha actual en formato 'YYYY-MM'.
 * @param {string} contrato - Tipo de contrato (Ej: 'Anual', 'Semestral', 'Trimestral').
 * @returns {string} Nueva fecha en formato 'YYYY-MM'.
 */
function calculateNewDate(currentFecha, contrato) {
    if (!currentFecha || !contrato) return currentFecha;

    const [yearStr, monthStr] = currentFecha.split('-');
    const currentYear = parseInt(yearStr, 10);
    const currentMonth = parseInt(monthStr, 10); // 1-12

    let monthsToAdd = 0;

    switch (contrato.toLowerCase()) {
        case 'anual':
            monthsToAdd = 12;
            break;
        case 'semestral':
            monthsToAdd = 6;
            break;
        case 'trimestral':
            monthsToAdd = 3;
            break;
        // Asume 'Mensual' o cualquier otro caso es 1 mes.
        default:
            monthsToAdd = 1;
            break;
    }

    // Calcula el mes y el año de la nueva fecha
    let newMonth = currentMonth + monthsToAdd;
    let newYear = currentYear;

    while (newMonth > 12) {
        newMonth -= 12;
        newYear += 1;
    }

    // Formatear a 'YYYY-MM' (añadiendo el cero inicial si es necesario)
    const newMonthStr = String(newMonth).padStart(2, '0');
    return `${newYear}-${newMonthStr}`;
}
/**
 * Maneja el proceso de completar o registrar la avería en el historial.
 * @param {boolean} isCompleted - true si se pulsa 'Sí' (borrar avería); false si se pulsa 'No' (mantener avería).
 * @param {Object} currentRepairData - Los datos actuales de la reparación.
 */
async function completeRepair(isCompleted, currentRepairData) {
    const db = window.db;
    const repairId = currentRepairData.id;
    const currentFecha = currentRepairData.fecha; // YYYY-MM
    const contrato = currentRepairData.contrato;

    closeCompleteModal(); // Cerrar el modal de confirmación
    showMessageBox("Procesando registro y actualización...", false);

    try {
        // --- 1. PREPARAR DATOS PARA EL REGISTRO DE HISTORIAL (/records) ---
        
        // Crear una copia de los datos actuales, añadiendo el estado de completado y la marca de tiempo
        const recordData = {
            ...currentRepairData,
            completedAt: new Date().toISOString(), // Fecha y hora de completado
            isCompletedSuccessfully: isCompleted, // Indica si se completó o solo se registró
        };
        // Eliminar el ID del documento para que Firestore le asigne uno nuevo en /records
        delete recordData.id;

        // --- 2. PREPARAR DATOS PARA LA ACTUALIZACIÓN DE LA REPARACIÓN (/repairs) ---

        const newFecha = calculateNewDate(currentFecha, contrato);

        // Datos que SIEMPRE se actualizan en /repairs: la fecha de mantenimiento
        let updateData = {
            fecha: newFecha,
        };

        if (isCompleted) {
            // Si pulsa 'Sí', se borra el contenido de 'averia'
            updateData.averia = "";
        }
        // Si pulsa 'No', el campo 'averia' (y 'observaciones') permanece igual

        // --- 3. EJECUTAR LA TRANSACCIÓN DE FIREBASE (Copia + Actualización/Borrado) ---
        
        // Guardar en la colección 'records'
        const recordsCollectionRef = window.collection(db, 'records');
        await window.addDoc(recordsCollectionRef, recordData);
        
        // Actualizar el documento en la colección 'repairs'
        const repairDocRef = window.doc(db, 'repairs', repairId);
        await window.updateDoc(repairDocRef, updateData);
        
        // --- 4. FINALIZACIÓN ---
        const completionStatus = isCompleted ? "y la avería fue resuelta" : "sin modificar el estado de la avería";
        
        showMessageBox(`Registro completado con éxito. Se ha movido a Historial y la fecha de mantenimiento se actualizó a ${newFecha}, ${completionStatus}.`, false, 'listMessageBox');
        
        // Recargar la página para mostrar los datos actualizados y la nueva fecha
        setTimeout(() => {
            window.location.reload(); 
        }, 1500);

    } catch (error) {
        console.error("Error al completar la reparación:", error);
        showMessageBox(`Error al procesar: ${error.message}. Intenta de nuevo.`, true);
    }
}
// ... (resto de tu código de Damage.js) ...

// Variables globales (deberían estar definidas en la parte superior de Damage.js)
let currentRepairData = null; // Necesitas almacenar los datos para usarlos en completeRepair

// ... (dentro de tu función de carga, ej: loadDamageDetails) ...
// Ejemplo: cuando cargas los detalles, almacena los datos en la variable global:
/* async function loadDamageDetails() {
    // ... lógica de carga ...
    currentRepairData = { id: doc.id, ...doc.data() };
    // ...
}
*/

// --- Inicialización (DOM Content Loaded) ---

document.addEventListener('DOMContentLoaded', function() {
    // ... (Listeners existentes: backBtn, toggleEditBtn, savePrimaryDetailsBtn, etc.) ...
    
    // --- LÓGICA DE COMPLETAR AVERÍA ---
    const btnOpenCompleteModal = document.getElementById('btnCompleteRepair'); // Botón principal
    const btnCloseCompleteModal = document.getElementById('closeCompleteModalBtn'); // Cruzeta
    const btnCompleteYes = document.getElementById('btnCompleteYes');
    const btnCompleteNo = document.getElementById('btnCompleteNo');

    if (btnOpenCompleteModal) {
        btnOpenCompleteModal.addEventListener('click', openCompleteModal);
    }
    if (btnCloseCompleteModal) {
        btnCloseCompleteModal.addEventListener('click', closeCompleteModal);
    }

    if (btnCompleteYes) {
        btnCompleteYes.addEventListener('click', () => {
            if (currentRepairData) {
                completeRepair(true, currentRepairData); // TRUE = Avería reparada (borrar 'averia')
            } else {
                showMessageBox("Error: Datos de avería no cargados.", true);
            }
        });
    }

    if (btnCompleteNo) {
        btnCompleteNo.addEventListener('click', () => {
            if (currentRepairData) {
                completeRepair(false, currentRepairData); // FALSE = Solo registrar (mantener 'averia')
            } else {
                showMessageBox("Error: Datos de avería no cargados.", true);
            }
        });
    }

    // ... (llama a la función principal de carga: loadDamageDetails()) ...
});

// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    const editDetailsBtn = document.getElementById('editDetailsBtn'); 
    const deleteBtn = document.getElementById('deleteDamageBtn'); 
    const completeBtn = document.getElementById('completeDamageBtn');
    const saveObservationsForm = document.getElementById('saveObservationsForm');
    const editDamageForm = document.getElementById('editDamageForm');
    const observationsTextarea = document.getElementById('detailObservaciones');
    const saveObservationsBtn = document.getElementById('saveObservationsBtn');

    // Navegación
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '../Repairs/Repairs.html'; 
        });
    }

    // Toggle de Modo Edición
    if (editDetailsBtn) {
        editDetailsBtn.addEventListener('click', function() {
            // Si está activo, desactiva. Si está inactivo, activa.
            const isActive = this.classList.contains('active');
            enableEditMode(!isActive);
        });
    }
    
    // Guardar Edición Principal
    if (editDamageForm) {
        editDamageForm.addEventListener('submit', handleSavePrimaryDetails);
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
	
    // Acciones de pie de página
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteDamage);
    }
    if (completeBtn) {
        completeBtn.addEventListener('click', function() {
            // Se puede añadir aquí la lógica para marcar como completada
            showMessageBox("Funcionalidad 'Completar' pendiente de implementación.", false);
        });
    }

    // Cargar los detalles de la avería
    loadDamageDetails();
});
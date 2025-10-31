// Damage.js - Lógica para la página de detalle de una sola avería

let currentDamageId = null;
let currentInitialObservations = '';
let currentRepairData = null; // CLAVE: Variable global para almacenar los datos completos de la reparación
let currentAction = ''; // Almacena la acción actual del modal ('delete' o 'complete')

// --- LÓGICA DEL MODAL DE CONFIRMACIÓN GLASSMORPHISM ---

// Referencias al DOM del modal (se inicializan en initializePageLogic)
let modal, modalTitle, modalMessage, btnYes, btnNo, btnCancel;

/** Muestra el modal de confirmación con mensajes específicos. */
function showConfirmationModal(actionType) {
    if (!modal) return; // Validación defensiva

    currentAction = actionType;
    modal.classList.remove('hidden'); // Muestra el overlay
    modal.focus(); // Asegura que el modal capture eventos si es necesario

    // Configura el modal basado en la acción
    if (actionType === 'delete') {
        modalTitle.textContent = '¡ATENCIÓN! Eliminar Avería';
        modalMessage.textContent = 'Estás seguro de que deseas ELIMINAR permanentemente esta avería?';
        btnYes.textContent = 'Sí, Eliminar';
        btnNo.textContent = 'No';
        btnCancel.classList.add('hidden'); // Ocultar Cancelar en la acción de Eliminar
        btnNo.style.display = 'inline-block'; // Asegurar que 'No' se muestre

    } else if (actionType === 'complete') {
        // Validación: no permitir completar en modo edición
        const editDetailsBtn = document.getElementById('editDetailsBtn');
        if (editDetailsBtn && editDetailsBtn.classList.contains('active')) {
            showMessageBox("Desactiva el modo edición para completar o registrar la avería.", true);
            modal.classList.add('hidden'); // Asegurarse de que esté oculto si se cancela la apertura
            return;
        }

        modalTitle.textContent = 'Completar Avería';
        modalMessage.textContent = 'La avería ha sido resuelta (SI) o solo deseas registrar el mantenimiento (NO)?';
        btnYes.textContent = 'Sí (Resuelta)';
        btnNo.textContent = 'No (Solo Registrar)';
        btnCancel.textContent = 'Cancelar';
        btnCancel.classList.remove('hidden'); // Mostrar Cancelar
        btnNo.style.display = 'inline-block';
    }
}

/** Oculta el modal de confirmación. */
function hideConfirmationModal() {
    if (modal) {
        modal.classList.add('hidden');
        // 🔥 IMPORTANTE: Eliminamos el reset de currentAction de aquí.
    }
}

/**
 * Maneja la respuesta del usuario (Sí/No) y ejecuta la acción.
 * @param {boolean} confirmed - true si pulsa Sí; false si pulsa No.
 */
function handleConfirmation(confirmed) {
    // 1. Cerrar Modal
    hideConfirmationModal(); 

    console.log(`DEBUG: currentAction después de cerrar modal: ${currentAction}`); // Log para depurar

    if (!currentRepairData) {
        showMessageBox("Error: Datos de avería no cargados.", true);
        currentAction = ''; // Resetear antes de salir por error
        return;
    }

    if (currentAction === 'delete') {
        if (confirmed) {
            // **CLAVE:** Si es 'delete' y 'Sí', ejecuta la eliminación
            handleDeleteDamage(true); 
        } else {
            // Si el modal es de eliminación y el usuario pulsa 'No'
            showMessageBox('Eliminación cancelada.', false);
        }
    } else if (currentAction === 'complete') {
        // ... Lógica de Completado ...
        completeRepair(confirmed, currentRepairData);
    }

    // 2. 🔥 CORRECCIÓN: Resetear la acción al final, después de que se haya procesado.
    currentAction = ''; 
}

// --- LÓGICA DE ELIMINACIÓN (Ahora con mensajes y redirección) ---

/** Maneja la eliminación de la avería.
 * @param {boolean} isConfirmedByModal - Indica si la acción ha sido confirmada por el modal.
 */
async function handleDeleteDamage(isConfirmedByModal) {
    console.log("DEBUG: Entrando a handleDeleteDamage. Confirmado:", isConfirmedByModal); 
    console.log("DEBUG: currentDamageId actual:", currentDamageId);
    
    // 1. Validar que la acción fue confirmada y que tenemos un ID
    if (!currentDamageId || !isConfirmedByModal) {
        console.error("ERROR: No se puede eliminar. currentDamageId es nulo o la acción no fue confirmada.");
        showMessageBox("❌ Error interno: No se encontró la ID de la avería para eliminar.", true);
        return; 
    }

    const db = window.db;
    // La colección 'repairs' y el ID del documento
    const repairDocRef = window.doc(db, 'repairs', currentDamageId);
    
    try {
        // 2. Mostrar mensaje de "Eliminando..."
        showMessageBox("Eliminando avería...", false);
        
        // 3. Eliminar de Firestore
        await window.deleteDoc(repairDocRef);
        
        // 4. Mostrar mensaje de éxito
        showMessageBox("✅ Avería eliminada con éxito. Redirigiendo...", false);
        
        // 5. Redirigir a Repairs.html después de 1.5 segundos
        setTimeout(() => {
            window.location.href = '../Repairs/Repairs.html'; 
        }, 1500); 
        
    } catch (error) {
        console.error("FIREBASE ERROR: Error al eliminar:", error);
        // Manejo de errores específicos y genéricos
        let errorMessage = `Error al eliminar: ${error.message}`;
        if (error.message.includes('Missing or insufficient permissions')) {
             errorMessage = "Error de Permisos: Revisa las reglas de Firestore (allow delete).";
        }
        showMessageBox(`❌ ${errorMessage}`, true);
    }
}


// --- Utilidades del DOM (Funciones auxiliares) ---

function showMessageBox(message, isError = true) {
    const msgBox = document.getElementById('damageMessageBox');
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (!isError) {
        msgBox.classList.add('success');
        msgBox.classList.remove('error');
    } else {
        msgBox.classList.add('error');
        msgBox.classList.remove('success');
    }
    
    setTimeout(() => {
        msgBox.classList.add('hidden');
    }, 5000);
}

/** Rellena los elementos de vista (no editables) con los datos. */
function fillDetailView(data) {
    const dateParts = data.fecha ? data.fecha.split('-') : [];
    const formattedDate = dateParts.length === 2 ? `${dateParts[1]}/${dateParts[0]}` : 'Fecha Desconocida';

    const ubicacion = document.getElementById('detailUbicacion');
    const modelo = document.getElementById('detailModelo');
    const llave = document.getElementById('detailLlave');
    const contrato = document.getElementById('detailContrato');
    const fecha = document.getElementById('detailFecha');
    const averia = document.getElementById('detailAveria');
    
    if (ubicacion) ubicacion.textContent = data.ubicacion || 'N/A';
    if (modelo) modelo.textContent = data.modelo || 'N/A';
    if (llave) llave.textContent = data.llave || 'N/A';
    if (contrato) contrato.textContent = data.contrato || 'N/A';
    if (fecha) fecha.textContent = formattedDate;
    if (averia) averia.textContent = data.averia || 'N/A';
}

/** Rellena los campos de input (editables) con los datos. */
function fillInputFields(data) {
    const inputUbicacion = document.getElementById('inputUbicacion');
    const inputModelo = document.getElementById('inputModelo');
    const inputLlave = document.getElementById('inputLlave');
    const inputContrato = document.getElementById('inputContrato');
    const inputFecha = document.getElementById('inputFecha');
    const inputAveria = document.getElementById('inputAveria');
    const observationsTextarea = document.getElementById('detailObservaciones');
    
    if (inputUbicacion) inputUbicacion.value = data.ubicacion || '';
    if (inputModelo) inputModelo.value = data.modelo || '';
    if (inputLlave) inputLlave.value = data.llave || '';
    if (inputContrato) inputContrato.value = data.contrato || '';
    if (inputFecha) inputFecha.value = data.fecha || '';
    if (inputAveria) inputAveria.value = data.averia || '';
    
    if (observationsTextarea) {
        observationsTextarea.value = data.observaciones || '';
        currentInitialObservations = observationsTextarea.value; 
    }
}

/** Habilita/Deshabilita el modo edición para los campos principales. */
function enableEditMode(enable) {
    // Obtenemos las referencias del DOM en cada llamada para mayor seguridad
    const detailView = document.getElementById('detailView');
    const editForm = document.getElementById('editDamageForm');
    const savePrimaryBtn = document.getElementById('savePrimaryDetailsBtn');
    const editDetailsBtn = document.getElementById('editDetailsBtn');
    
    if (enable) {
        if (detailView) detailView.classList.add('hidden');
        if (editForm) editForm.classList.remove('hidden');
        if (savePrimaryBtn) savePrimaryBtn.classList.remove('hidden');
        if (editDetailsBtn) editDetailsBtn.classList.add('active');
        showMessageBox("Modo edición activado. Pulsa 'Guardar Cambios' para aplicar.", false);
    } else {
        if (detailView) detailView.classList.remove('hidden');
        if (editForm) editForm.classList.add('hidden');
        if (savePrimaryBtn) savePrimaryBtn.classList.add('hidden');
        if (editDetailsBtn) editDetailsBtn.classList.remove('active');
        
        const msgBox = document.getElementById('damageMessageBox');
        if (msgBox && !msgBox.textContent.includes("guardado con éxito")) {
            showMessageBox("Modo edición desactivado.", false); 
        }
    }
}

// --- Lógica de Datos ---

/** Obtiene el ID de la avería de la URL. */
function getDamageIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

/** Carga los datos específicos de la avería desde Firestore. */
async function loadDamageDetails() {
    currentDamageId = getDamageIdFromUrl();
    
    if (!currentDamageId) {
        const ubicacion = document.getElementById('detailUbicacion');
        if (ubicacion) ubicacion.textContent = "Error: ID de avería no encontrado.";
        showMessageBox("No se pudo cargar la avería. Falta el ID en la URL.", true);
        return;
    }
    
    const db = window.db;
    const damageDocRef = window.doc(db, 'repairs', currentDamageId);

    try {
        const docSnap = await window.getDoc(damageDocRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // CLAVE: Almacenar los datos completos globalmente
            currentRepairData = { id: docSnap.id, ...data }; 
            
            fillDetailView(data);
            fillInputFields(data);
            
            // Asegurarse de que al cargar, siempre se inicie en modo NO edición.
            enableEditMode(false); 
        } else {
            const ubicacion = document.getElementById('detailUbicacion');
            if (ubicacion) ubicacion.textContent = `Error: No existe avería con ID ${currentDamageId}`;
            showMessageBox("Avería no encontrada en la base de datos.", true);
        }
    } catch (error) {
        console.error("Error al cargar detalles de la avería:", error);
        showMessageBox(`Error de conexión al cargar: ${error.message}`, true);
    }
}

/** Maneja el guardado de los campos principales de la avería. */
async function handleSavePrimaryDetails(event) {
    event.preventDefault();
    const repairId = currentDamageId;
    const submitBtn = document.getElementById('savePrimaryDetailsBtn');
    if (!submitBtn) return; // Validación defensiva
    submitBtn.disabled = true;

    if (!repairId) {
        showMessageBox("Error: ID de avería no encontrado.", true);
        submitBtn.disabled = false;
        return;
    }

    showMessageBox("Guardando cambios principales...", false);

    const updatedData = {
        ubicacion: document.getElementById('inputUbicacion')?.value || '',
        modelo: document.getElementById('inputModelo')?.value || '',
        llave: document.getElementById('inputLlave')?.value || '',
        contrato: document.getElementById('inputContrato')?.value || '',
        fecha: document.getElementById('inputFecha')?.value || '',
        averia: document.getElementById('inputAveria')?.value || '',
        updatedAt: new Date().toISOString()
    };
    
    const db = window.db;
    const repairDocRef = window.doc(db, 'repairs', repairId);

    try {
        await window.updateDoc(repairDocRef, updatedData);
        
        showMessageBox("Cambios guardados con éxito.", false);
        
        // IMPORTANTE: Actualizar la variable global
        currentRepairData = { ...currentRepairData, ...updatedData };
        
        enableEditMode(false);
        fillDetailView(updatedData);
        
    } catch (error) {
        console.error("Error al actualizar detalles:", error);
        showMessageBox(`Error al guardar: ${error.message}`, true);
    } finally {
        setTimeout(() => { submitBtn.disabled = false; }, 1000);
    }
}

/** Guarda las observaciones editadas de la reparación. */
async function handleSaveObservations(event) {
    event.preventDefault();
    const repairId = currentDamageId;
    const submitBtn = document.getElementById('saveObservationsBtn');
    if (!submitBtn) return; // Validación defensiva
    submitBtn.disabled = true;

    if (!repairId) {
        showMessageBox("Error: ID de avería no encontrado.", true);
        submitBtn.disabled = false;
        return;
    }

    showMessageBox("Guardando observaciones...", false);
    
    const observationsTextarea = document.getElementById('detailObservaciones');
    const newObservations = observationsTextarea ? observationsTextarea.value : '';
    
    const db = window.db;
    const repairDocRef = window.doc(db, 'repairs', repairId); 

    try {
        await window.updateDoc(repairDocRef, {
            observaciones: newObservations,
            updatedAt: new Date().toISOString()
        });
        
        showMessageBox("Observaciones guardadas con éxito.", false);
        document.getElementById('saveObservationsBtn')?.classList.add('hidden');
        currentInitialObservations = newObservations;
        
        // IMPORTANTE: Actualizar la variable global
        if (currentRepairData) {
            currentRepairData.observaciones = newObservations;
        }
        
    } catch (error) {
        console.error("Error al actualizar observaciones:", error);
        showMessageBox(`Error al guardar: ${error.message}`, true);
    } finally {
        setTimeout(() => { submitBtn.disabled = false; }, 1000);
    }
}

// --- Lógica de Completar Reparación ---

/** Calcula la nueva fecha de la próxima reparación/mantenimiento. */
function calculateNewDate(currentFecha, contrato) {
    if (!currentFecha || !contrato) return currentFecha;

    const [yearStr, monthStr] = currentFecha.split('-');
    const currentYear = parseInt(yearStr, 10);
    const currentMonth = parseInt(monthStr, 10); 

    let monthsToAdd = 0;
    switch (contrato.toLowerCase()) {
        case 'anual': monthsToAdd = 12; break;
        case 'semestral': monthsToAdd = 6; break;
        case 'trimestral': monthsToAdd = 3; break;
        default: monthsToAdd = 1; break;
    }

    let newMonth = currentMonth + monthsToAdd;
    let newYear = currentYear;

    while (newMonth > 12) {
        newMonth -= 12;
        newYear += 1;
    }

    const newMonthStr = String(newMonth).padStart(2, '0');
    return `${newYear}-${newMonthStr}`;
}

/** Maneja el proceso de completar o registrar la avería en el historial. */
async function completeRepair(isCompleted, currentRepairData) {
    const db = window.db;
    const repairId = currentRepairData.id;
    const currentFecha = currentRepairData.fecha;
    const contrato = currentRepairData.contrato;
    const currentUser = window.CURRENT_USER_ID || 'anonimo'; 

    showMessageBox("Procesando registro y actualización...", false);

    try {
        // --- 1. PREPARAR DATOS PARA EL REGISTRO DE HISTORIAL (/records) ---
        const recordData = {
            ...currentRepairData,
            completedAt: new Date().toISOString(), 
            isCompletedSuccessfully: isCompleted, 
            username: currentUser, 
        };
        delete recordData.id; // Eliminar ID original para que Firestore genere uno nuevo

        // --- 2. PREPARAR DATOS PARA LA ACTUALIZACIÓN DE LA REPARACIÓN (/repairs) ---
        const newFecha = calculateNewDate(currentFecha, contrato);

        let updateData = {
            fecha: newFecha,
            updatedAt: new Date().toISOString()
        };

        if (isCompleted) {
            // Si pulsa 'Sí', se borra el contenido de 'averia' y 'observaciones'
            updateData.averia = "";
            updateData.observaciones = "";
        }
        
        // --- 3. EJECUTAR LA TRANSACCIÓN DE FIREBASE ---
        const recordsCollectionRef = window.collection(db, 'records');
        await window.addDoc(recordsCollectionRef, recordData); 
        
        const repairDocRef = window.doc(db, 'repairs', repairId);
        await window.updateDoc(repairDocRef, updateData);
        
        // --- 4. FINALIZACIÓN ---
        const completionStatus = isCompleted ? "y la avería fue resuelta" : "sin modificar el estado de la avería";
        
        showMessageBox(`Registro completado con éxito. Fecha actualizada a ${newFecha}, ${completionStatus}.`, false);
        
        // Recargar la página para mostrar los datos actualizados
        setTimeout(() => {
            window.location.reload(); 
        }, 1500);

    } catch (error) {
        console.error("Error al completar la reparación:", error);
        showMessageBox(`Error al procesar: ${error.message}. Intenta de nuevo.`, true);
    }
}


// --- Inicialización (Nueva estructura para el script de Firebase) ---

/** * Función global que encapsula toda la lógica de inicialización y listeners. 
 * Esta función es llamada por el script de Firebase solo después de que 
 * la autenticación anónima se ha completado.
 */
window.initializePageLogic = function() {
    
    // 1. Inicialización de las referencias al DOM del modal (CLAVE)
    modal = document.getElementById('confirmationModal'); 
    modalTitle = document.getElementById('modalTitle');
    modalMessage = document.getElementById('modalMessage');
    btnYes = document.getElementById('btnYes');
    btnNo = document.getElementById('btnNo');
    btnCancel = document.getElementById('btnCancel');
    
    // Referencias a botones principales
    const backBtn = document.getElementById('backBtn');
    const editDetailsBtn = document.getElementById('editDetailsBtn'); 
    const deleteBtn = document.getElementById('deleteDamageBtn'); 
    const completeBtn = document.getElementById('completeDamageBtn');
    const saveObservationsForm = document.getElementById('saveObservationsForm');
    const editDamageForm = document.getElementById('editDamageForm');
    const observationsTextarea = document.getElementById('detailObservaciones');
    const saveObservationsBtn = document.getElementById('saveObservationsBtn');

    // --- 2. ASIGNACIÓN DE EVENT LISTENERS ---

    // Navegación
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '../Repairs/Repairs.html'; 
        });
    }

    // Toggle de Modo Edición
    if (editDetailsBtn) {
        editDetailsBtn.addEventListener('click', function() {
            const isActive = this.classList.contains('active');
            enableEditMode(!isActive);
        });
    } else {
        console.error("ERROR CRÍTICO: No se encontró el botón de Edición ('editDetailsBtn'). Verifica el HTML.");
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
        observationsTextarea.addEventListener('input', function() {
            const currentValue = this.value;
            if (currentValue !== currentInitialObservations) { 
                saveObservationsBtn.classList.remove('hidden');
            } else {
                saveObservationsBtn.classList.add('hidden');
            }
        });
    }

    // Botones de ACCIÓN PRINCIPALES (Abrir Modal)
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            showConfirmationModal('delete');
        });
    }

    if (completeBtn) {
        completeBtn.addEventListener('click', function() {
            showConfirmationModal('complete');
        });
    }

    // Botones dentro del MODAL (Manejar Confirmación)
    if (btnYes) {
        btnYes.addEventListener('click', function() {
            console.log("DEBUG: Botón SI pulsado. Lanzando handleConfirmation(true)");
            handleConfirmation(true); 
        });
    }
    if (btnNo) {
        btnNo.addEventListener('click', function() {
            console.log("DEBUG: Botón NO pulsado. Lanzando handleConfirmation(false)");
            handleConfirmation(false);
        });
    }
    if (btnCancel) {
        btnCancel.addEventListener('click', hideConfirmationModal);
    }
    
    // Cargar los detalles de la avería
    loadDamageDetails();
};
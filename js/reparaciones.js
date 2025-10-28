// Referencias del DOM para reparaciones.html
const reparacionesVolverBtn = document.getElementById('reparaciones-volver-btn');
const reparacionesAddBtn = document.getElementById('reparaciones-add-btn');
const listaReparacionesContainer = document.getElementById('lista-reparaciones-container');

// Referencias del Modal
const modal = document.getElementById('modal-reparaciones');
const modalUbicacion = document.getElementById('modal-ubicacion');
const modalModelo = document.getElementById('modal-modelo');
const modalFecha = document.getElementById('modal-fecha');
const modalContrato = document.getElementById('modal-contrato');
const modalProblemas = document.getElementById('modal-problemas'); 
const modalAgregarBtn = document.getElementById('modal-agregar-btn');
const modalCerrarBtn = document.getElementById('modal-cerrar-btn');

// Referencia a Firestore
const reparacionesRef = db.collection('reparaciones');

// =======================
// LÓGICA DEL MODAL (Fase 3)
// =======================

reparacionesAddBtn.addEventListener('click', () => {
    modal.classList.add('active');
});

modalCerrarBtn.addEventListener('click', () => {
    modal.classList.remove('active');
});

modalAgregarBtn.addEventListener('click', () => {
    const data = {
        ubicacion: modalUbicacion.value,
        modelo: modalModelo.value,
        contrato: modalContrato.value,
        problemas: modalProblemas.value, 
        fecha: firebase.firestore.Timestamp.fromDate(new Date(modalFecha.value))
    };

    if (!data.ubicacion || !data.modelo || !modalFecha.value) {
        alert("Por favor, completa ubicación, modelo y fecha.");
        return;
    }

    reparacionesRef.add(data)
        .then(() => {
            modalUbicacion.value = '';
            modalModelo.value = '';
            modalFecha.value = '';
            modalContrato.value = 'Mensual';
            modalProblemas.value = '';
            modal.classList.remove('active');
        })
        .catch(error => console.error("Error al añadir documento: ", error));
});


// =======================
// LÓGICA DE FIRESTORE Y ORDENAMIENTO (Fase 3 y 4)
// =======================

// Función de Ordenamiento (Fase 4)
function ordenarReparaciones(lista) {
    return lista.sort((a, b) => {
        const fechaA = a.fecha.toDate();
        const fechaB = b.fecha.toDate();
        const aTieneProblemas = a.problemas && a.problemas.trim() !== '';
        const bTieneProblemas = b.problemas && b.problemas.trim() !== '';

        if (aTieneProblemas && !bTieneProblemas) return -1;
        if (!aTieneProblemas && bTieneProblemas) return 1;

        // Descendente (más nuevas primero)
        return fechaB - fechaA;
    });
}

// Función para "pintar" la lista en el HTML (Fase 3)
function renderizarLista(lista) {
    listaReparacionesContainer.innerHTML = ''; 

    if (lista.length === 0) {
        listaReparacionesContainer.innerHTML = '<p>No hay reparaciones registradas.</p>';
        return;
    }

    lista.forEach(item => {
        const fechaFormateada = item.fecha.toDate().toLocaleDateString('es-ES');
        const clasePrioridad = (item.problemas && item.problemas.trim() !== '') ? 'prioridad' : '';

        const itemHTML = `
            <div class="reparacion-item ${clasePrioridad}">
                <h3>${item.ubicacion} - ${item.modelo}</h3>
                <p><strong>Fecha:</strong> ${fechaFormateada}</p>
                <p><strong>Contrato:</strong> ${item.contrato}</p>
                <p><strong>Problemas:</strong> ${item.problemas || 'Ninguno'}</p>
            </div>
        `;
        listaReparacionesContainer.innerHTML += itemHTML;
    });
}

// =======================
// INICIO: Escuchar datos de Firestore
// =======================

// Nos aseguramos de que el auth-guard.js se haya ejecutado
// y tengamos un usuario antes de suscribirnos a la base de datos.
auth.onAuthStateChanged(user => {
    if (user) {
        // Usuario logueado, ¡podemos cargar datos!
        reparacionesRef.onSnapshot(snapshot => {
            let reparaciones = [];
            snapshot.forEach(doc => {
                reparaciones.push({ id: doc.id, ...doc.data() });
            });

            const reparacionesOrdenadas = ordenarReparaciones(reparaciones);
            renderizarLista(reparacionesOrdenadas);
        }, error => {
            console.error("Error al escuchar reparaciones: ", error);
        });
    }
});
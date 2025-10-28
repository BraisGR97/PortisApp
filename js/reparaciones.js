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
// LÓGICA DEL MODAL Y GUARDADO DE DATOS CON UID
// =======================

reparacionesAddBtn.addEventListener('click', () => {
    modal.classList.add('active');
});

modalCerrarBtn.addEventListener('click', () => {
    modal.classList.remove('active');
});

modalAgregarBtn.addEventListener('click', () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Error: Debes iniciar sesión para añadir reparaciones.");
        return;
    }

    const data = {
        ubicacion: modalUbicacion.value,
        modelo: modalModelo.value,
        contrato: modalContrato.value,
        problemas: modalProblemas.value, 
        fecha: firebase.firestore.Timestamp.fromDate(new Date(modalFecha.value)),
        // 👈 CLAVE: Añadir el ID del usuario actual
        userId: user.uid 
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
// LÓGICA DE ORDENAMIENTO (Fase 4)
// =======================

function ordenarReparaciones(lista) {
    return lista.sort((a, b) => {
        const fechaA = a.fecha.toDate();
        const fechaB = b.fecha.toDate();
        const aTieneProblemas = a.problemas && a.problemas.trim() !== '';
        const bTieneProblemas = b.problemas && b.problemas.trim() !== '';

        // Prioridad: Problemas antes que No-Problemas
        if (aTieneProblemas && !bTieneProblemas) return -1;
        if (!aTieneProblemas && bTieneProblemas) return 1;

        // Ordenar por fecha (más nuevas primero)
        return fechaB - fechaA;
    });
}

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
// INICIO: Escuchar datos de Firestore FILTRANDO POR UID
// =======================

auth.onAuthStateChanged(user => {
    if (user) {
        // CLAVE: Usamos .where('userId', '==', user.uid) para el filtro
        reparacionesRef.where('userId', '==', user.uid).onSnapshot(snapshot => {
            let reparaciones = [];
            snapshot.forEach(doc => {
                reparaciones.push({ id: doc.id, ...doc.data() });
            });

            const reparacionesOrdenadas = ordenarReparaciones(reparaciones);
            renderizarLista(reparacionesOrdenadas);
        }, error => {
            console.error("Error al escuchar reparaciones: ", error);
        });
    } else {
        listaReparacionesContainer.innerHTML = '<p>Inicia sesión para ver tus reparaciones.</p>';
    }
});
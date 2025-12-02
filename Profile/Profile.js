/**
 * ====================================================================
 * Profile.js - Lógica del Perfil de Usuario y Estadísticas
 * ====================================================================
 */

// ====================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ====================================================================

const firebaseConfig = window.firebaseConfig;
const cloudinaryConfig = window.cloudinaryConfig;
const appId = firebaseConfig ? firebaseConfig.projectId : 'portis-app-id';

let app;
let db;
let auth;
let userId = sessionStorage.getItem('portis-user-identifier') || null;
let userDisplayName = sessionStorage.getItem('portis-user-display-name') || null;
let isAuthReady = false;
let initialUsername = '';
let userEmail = '';

// Instancias de gráficos
let workloadChartInstance = null;
let expensesChartInstance = null;
let sharedChartInstance = null;

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

window.addEventListener('load', () => {
    if (typeof window.applyColorMode === 'function') window.applyColorMode();

    initializeAppAndAuth();

    // Listeners
    const photoInput = document.getElementById('profile-image-input');
    if (photoInput) photoInput.addEventListener('change', handleProfilePhotoChange);

    const saveBtn = document.getElementById('save-changes-btn');
    if (saveBtn) saveBtn.addEventListener('click', handleProfileEdit);

    // Efectos visuales
    window.addEventListener('scroll', updateCardBorderOpacity);
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.addEventListener('scroll', updateCardBorderOpacity);
    window.addEventListener('resize', updateCardBorderOpacity);
    setTimeout(updateCardBorderOpacity, 100);

    // Exponer funciones globales
    window.openPasswordModal = openPasswordModal;
    window.closePasswordModal = closePasswordModal;
    window.sendPasswordReset = sendPasswordReset;
    window.openPhotoOptionsModal = openPhotoOptionsModal;
    window.closePhotoOptionsModal = closePhotoOptionsModal;
    window.triggerPhotoUpload = triggerPhotoUpload;
    window.deleteProfilePhoto = deleteProfilePhoto;
});

/**
 * Inicializa Firebase y Autenticación.
 */
async function initializeAppAndAuth() {
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        window.location.href = '../index.html';
        return;
    }

    if (displayElement) displayElement.textContent = userDisplayName;

    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error("Configuración incompleta.");

        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged(async (user) => {
            if (user && user.uid === userId) {
                userId = user.uid;
                isAuthReady = true;

                let firestorePhotoURL = undefined;
                try {
                    const metaDoc = await db.doc(`artifacts/${appId}/users/${userId}/profileData/userMetadata`).get();
                    if (metaDoc.exists) firestorePhotoURL = metaDoc.data().photoURL;
                } catch (e) {
                    console.warn("Error metadata:", e);
                }

                displayUserData(user, firestorePhotoURL);
                loadAndCalculateStats();
            } else {
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error init:", error);
        if (displayElement) displayElement.textContent = `Error`;
    }
}

// ====================================================================
// GESTIÓN DE DATOS DE USUARIO
// ====================================================================

function displayUserData(user, overridePhotoURL) {
    const usernameInput = document.getElementById('username');
    const registrationDateElement = document.getElementById('stat-registration-date');
    const photoElement = document.getElementById('profile-photo');

    if (photoElement) {
        let finalPhotoURL = user.photoURL;
        if (overridePhotoURL !== undefined) finalPhotoURL = overridePhotoURL;
        photoElement.src = finalPhotoURL || '../assets/logo.png';
    }

    const currentUsername = user.displayName || userDisplayName || 'Admin';
    usernameInput.value = currentUsername;
    initialUsername = currentUsername;

    userEmail = user.email || (user.isAnonymous ? 'Cuenta Anónima' : 'No disponible');
    document.getElementById('password').placeholder = user.email || 'Click para restablecer';

    usernameInput.removeEventListener('input', toggleSaveButton);
    usernameInput.addEventListener('input', toggleSaveButton);

    // Asegurar que el botón esté oculto al cargar
    const saveButton = document.getElementById('save-changes-btn');
    if (saveButton) saveButton.classList.add('hidden');

    if (user.metadata && user.metadata.creationTime) {
        const creationDate = new Date(user.metadata.creationTime);
        registrationDateElement.textContent = creationDate.toLocaleDateString('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    } else {
        registrationDateElement.textContent = '01/01/2024';
    }
}

function toggleSaveButton() {
    const usernameInput = document.getElementById('username');
    const saveButton = document.getElementById('save-changes-btn');
    const isModified = usernameInput.value.trim() !== initialUsername;

    if (isModified && usernameInput.value.trim() !== '') {
        saveButton.classList.remove('hidden');
    } else {
        saveButton.classList.add('hidden');
    }
}

async function handleProfileEdit() {
    const usernameInput = document.getElementById('username');
    const newUsername = usernameInput.value.trim();
    const saveButton = document.getElementById('save-changes-btn');

    if (newUsername === initialUsername || !newUsername) return;

    saveButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    saveButton.disabled = true;

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");

        await user.updateProfile({ displayName: newUsername });
        await db.doc(`artifacts/${appId}/users/${userId}/profileData/userMetadata`).set({
            displayName: newUsername,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        initialUsername = newUsername;
        sessionStorage.setItem('portis-user-display-name', newUsername);
        window.location.reload();

    } catch (error) {
        console.error("Error:", error);
        alert(`Error: ${error.message}`);
        saveButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Cambios';
        saveButton.disabled = false;
    }
}

// ====================================================================
// ESTADÍSTICAS Y GRÁFICOS
// ====================================================================

async function loadAndCalculateStats() {
    console.log('[PROFILE] Iniciando carga de estadísticas...');
    let repairs = [], bills = [], notes = [], history = [];
    let sharedSent = [], sharedReceived = [];

    try {
        // Fetch all collections in parallel
        const [repairsSnap, billsSnap, notesSnap, historySnap, sentSnap, receivedSnap] = await Promise.all([
            db.collection(`users/${userId}/repairs`).get(),
            db.collection(`users/${userId}/bills`).get(),
            db.collection(`users/${userId}/notes`).get(),
            db.collection(`users/${userId}/history`).get(),
            db.collection('shared_maintenance').where('senderId', '==', userId).get(),
            db.collection('shared_maintenance').where('receiverId', '==', userId).get()
        ]);

        repairsSnap.forEach(doc => repairs.push(doc.data()));
        billsSnap.forEach(doc => bills.push(doc.data()));
        notesSnap.forEach(doc => notes.push(doc.data()));
        historySnap.forEach(doc => history.push(doc.data()));
        sentSnap.forEach(doc => sharedSent.push(doc.data()));
        receivedSnap.forEach(doc => sharedReceived.push(doc.data()));

        console.log('[PROFILE] Datos cargados:', {
            repairs: repairs.length,
            bills: bills.length,
            notes: notes.length,
            history: history.length,
            sharedSent: sharedSent.length,
            sharedReceived: sharedReceived.length
        });

    } catch (error) {
        console.error("[PROFILE] Error cargando datos:", error);
        return;
    }

    // Cálculos
    const repairsCount = repairs.length;
    const billsCount = bills.length;
    const notesCount = notes.length;
    const historyCount = history.length;
    const sentCount = sharedSent.length;
    const receivedCount = sharedReceived.length;
    const totalShared = sentCount + receivedCount;

    let totalCost = 0;
    let totalPaid = 0;
    let highPriorityCount = 0;
    let currentMonthWorkload = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    bills.forEach(bill => {
        const cost = parseFloat(bill.cost || 0);
        if (!isNaN(cost)) {
            totalCost += cost;
            if (bill.status === 'Pagado') totalPaid += cost;
        }
    });

    repairs.forEach(repair => {
        if (repair.priority === 'Alta') highPriorityCount++;

        // Usar maintenance_month y maintenance_year en lugar de date
        if (repair.maintenance_month && repair.maintenance_year) {
            const repairMonth = parseInt(repair.maintenance_month) - 1; // Los meses en JS son 0-indexed
            const repairYear = parseInt(repair.maintenance_year);

            if (repairMonth === currentMonth && repairYear === currentYear) {
                currentMonthWorkload++;
            }
        }
    });

    // Renderizar Textos
    updateStat('stat-repairs-count', repairsCount);
    updateStat('stat-history-count', historyCount);
    updateStat('stat-notes-count', notesCount);
    updateStat('stat-high-priority', highPriorityCount);
    updateStat('stat-shared-total', totalShared);
    updateStat('stat-shared-split', `${sentCount} Env / ${receivedCount} Rec`);
    updateStat('stat-bills-count', billsCount);
    updateStat('stat-total-cost', `${totalCost.toFixed(2)} €`);
    updateStat('stat-paid-cost', `${totalPaid.toFixed(2)} €`);

    console.log('[PROFILE] Estadísticas calculadas:', {
        repairsCount,
        historyCount,
        notesCount,
        highPriorityCount,
        totalShared,
        billsCount,
        totalCost: totalCost.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        currentMonthWorkload
    });

    // Renderizar Gráficos
    console.log('[PROFILE] Renderizando gráficos...');
    renderWorkloadChart(currentMonthWorkload, repairsCount);
    renderSharedChart(sentCount, receivedCount);
    renderExpensesChart(totalPaid, totalCost - totalPaid);
    console.log('[PROFILE] Gráficos renderizados correctamente');
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// --- GRÁFICOS CHART.JS ---

function renderWorkloadChart(currentMonth, total) {
    try {
        const canvas = document.getElementById('workloadChart');
        if (!canvas) {
            console.error('[PROFILE] Canvas workloadChart no encontrado');
            return;
        }
        const ctx = canvas.getContext('2d');
        if (workloadChartInstance) workloadChartInstance.destroy();

        workloadChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Este Mes', 'Resto'],
                datasets: [{
                    data: [currentMonth, Math.max(0, total - currentMonth)],
                    backgroundColor: ['#E91E63', '#2a2a3e'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#9999aa', font: { family: 'Inter' } } }
                },
                cutout: '70%'
            }
        });
        console.log('[PROFILE] Gráfico de carga de trabajo renderizado');
    } catch (error) {
        console.error('[PROFILE] Error renderizando workloadChart:', error);
    }
}

function renderSharedChart(sent, received) {
    try {
        const canvas = document.getElementById('sharedChart');
        if (!canvas) {
            console.error('[PROFILE] Canvas sharedChart no encontrado');
            return;
        }
        const ctx = canvas.getContext('2d');
        if (sharedChartInstance) sharedChartInstance.destroy();

        sharedChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Enviados', 'Recibidos'],
                datasets: [{
                    data: [sent, received],
                    backgroundColor: ['#9C27B0', '#2196F3'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#9999aa', font: { family: 'Inter' } } }
                }
            }
        });
        console.log('[PROFILE] Gráfico de compartidos renderizado');
    } catch (error) {
        console.error('[PROFILE] Error renderizando sharedChart:', error);
    }
}

function renderExpensesChart(paid, pending) {
    try {
        const canvas = document.getElementById('expensesChart');
        if (!canvas) {
            console.error('[PROFILE] Canvas expensesChart no encontrado');
            return;
        }
        const ctx = canvas.getContext('2d');
        if (expensesChartInstance) expensesChartInstance.destroy();

        expensesChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Pagado', 'Pendiente'],
                datasets: [{
                    label: 'Importe (€)',
                    data: [paid, pending],
                    backgroundColor: ['#4CAF50', '#FF9800'],
                    borderRadius: 6,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: '#2a2a3e' }, ticks: { color: '#9999aa' } },
                    x: { grid: { display: false }, ticks: { color: '#9999aa' } }
                },
                plugins: { legend: { display: false } }
            }
        });
        console.log('[PROFILE] Gráfico de gastos renderizado');
    } catch (error) {
        console.error('[PROFILE] Error renderizando expensesChart:', error);
    }
}

// ====================================================================
// EFECTOS VISUALES
// ====================================================================

function updateCardBorderOpacity() {
    const elements = document.querySelectorAll('.card-container');
    const viewportHeight = window.innerHeight;

    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top;
        const elementHeight = rect.height;

        let opacity = 0;

        if (elementTop < viewportHeight && elementTop > -elementHeight) {
            const normalizedPosition = Math.max(0, Math.min(1, elementTop / (viewportHeight * 0.7)));
            opacity = 1 - normalizedPosition;
            opacity = 0.2 + (opacity * 0.8);
        }

        element.style.borderTopColor = `rgba(255, 255, 255, ${opacity})`;
    });
}

// ====================================================================
// MODALES Y FOTOS
// ====================================================================

function openPasswordModal() {
    const user = auth.currentUser;
    if (!user || !user.email) return alert('No hay email asociado.');

    document.getElementById('reset-email-display').textContent = user.email;
    document.getElementById('modal-message').classList.add('hidden');
    document.getElementById('password-modal').classList.remove('hidden');
    setTimeout(() => document.querySelector('#password-modal > div').classList.remove('scale-95'), 10);
}

function closePasswordModal() {
    document.querySelector('#password-modal > div').classList.add('scale-95');
    setTimeout(() => document.getElementById('password-modal').classList.add('hidden'), 300);
}

async function sendPasswordReset() {
    const msg = document.getElementById('modal-message');
    msg.textContent = 'Enviando...';
    msg.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-blue-900 text-white';
    msg.classList.remove('hidden');

    try {
        await auth.sendPasswordResetEmail(auth.currentUser.email);
        msg.textContent = 'Correo enviado.';
        msg.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-green-700 text-white';
        setTimeout(closePasswordModal, 2000);
    } catch (e) {
        msg.textContent = 'Error: ' + e.message;
        msg.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-red-800 text-white';
    }
}

function openPhotoOptionsModal() {
    document.getElementById('photo-options-modal').classList.remove('hidden');
    setTimeout(() => document.querySelector('#photo-options-modal > div').classList.remove('scale-95'), 10);
}

function closePhotoOptionsModal() {
    document.querySelector('#photo-options-modal > div').classList.add('scale-95');
    setTimeout(() => document.getElementById('photo-options-modal').classList.add('hidden'), 300);
}

function triggerPhotoUpload() {
    closePhotoOptionsModal();
    document.getElementById('profile-image-input').click();
}

async function handleProfilePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const photoElement = document.getElementById('profile-photo');
    const originalSrc = photoElement.src;
    photoElement.style.opacity = '0.5';

    try {
        const imageUrl = await uploadImageToCloudinary(file);
        if (!imageUrl) throw new Error("Error subida imagen");

        const user = auth.currentUser;
        await user.updateProfile({ photoURL: imageUrl });

        const updateData = { photoURL: imageUrl, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() };
        await db.doc(`artifacts/${appId}/users/${userId}/profileData/userMetadata`).set(updateData, { merge: true });
        await db.collection('users').doc(userId).set(updateData, { merge: true });

        photoElement.src = imageUrl;
    } catch (error) {
        console.error(error);
        alert('Error al actualizar foto.');
        photoElement.src = originalSrc;
    } finally {
        photoElement.style.opacity = '1';
    }
}

async function uploadImageToCloudinary(file) {
    if (!cloudinaryConfig) return null;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
            method: 'POST', body: formData
        });
        if (!res.ok) throw new Error('Error Cloudinary');
        const data = await res.json();
        return data.secure_url;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function deleteProfilePhoto() {
    if (!confirm('¿Eliminar foto?')) return;
    closePhotoOptionsModal();

    const photoElement = document.getElementById('profile-photo');
    photoElement.style.opacity = '0.5';

    try {
        const user = auth.currentUser;
        await user.updateProfile({ photoURL: null });

        const updateData = { photoURL: null, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() };
        await db.doc(`artifacts/${appId}/users/${userId}/profileData/userMetadata`).set(updateData, { merge: true });
        await db.collection('users').doc(userId).set(updateData, { merge: true });

        photoElement.src = '../assets/logo.png';
    } catch (error) {
        alert('Error al eliminar foto.');
    } finally {
        photoElement.style.opacity = '1';
    }
}

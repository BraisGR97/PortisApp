/**
 * ====================================================================
 * Materials.js - Gestión de Inventario, Consumo y Pedidos (V2)
 * ====================================================================
 */

(function () {
    let db = null;
    let userId = null;
    let currentTab = 'stock';
    let materialsData = [];
    let usageData = [];
    let ordersData = [];
    let tempOrderList = [];

    // --- LÓGICA DE ICONOS DINÁMICOS ---

    function normalizeText(text) {
        if (!text) return "";
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function getIconForMaterial(name) {
        const normName = normalizeText(name);
        const mapping = [
            { icon: 'ph-lightbulb', keywords: ['luz', 'led', 'fluorescente', 'bombilla', 'lampara', 'foco', 'iluminacion'] },
            { icon: 'ph-drop', keywords: ['agua', 'limpiador', 'limpieza', 'aceite', 'lubricante', 'grasa', 'anticongelante', 'liquido', 'fluido'] },
            { icon: 'ph-gear', keywords: ['engranaje', 'rueda', 'cadena', 'polea', 'motor', 'rodamiento', 'transmision', 'engranes'] },
            { icon: 'ph-lock', keywords: ['llave', 'cerradura', 'cerrojo', 'candado', 'cilindro', 'bombin'] },
            { icon: 'ph-cpu', keywords: ['chip', 'electronica', 'rele', 'magneto', 'diferencial', 'cable', 'circuito', 'contactor', 'interface', 'placa', 'modulo'] },
            { icon: 'ph-wrench', keywords: ['herramienta', 'destornillador', 'alicates', 'martillo', 'taladro'] }
        ];

        for (const entry of mapping) {
            if (entry.keywords.some(k => normName.includes(normalizeText(k)))) {
                return entry.icon;
            }
        }
        return 'ph-cube';
    }

    async function initMaterials() {
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            await window.firebaseReadyPromise;
        }

        db = window.db;
        userId = sessionStorage.getItem('portis-user-identifier');

        if (!db || !userId) return;

        // Cargar desde LocalStorage primero para rapidez
        loadFromLocal();

        // Cargar desde Firestore (esto actualizará la UI cuando lleguen los datos)
        fetchMaterials();
        fetchUsage();
        fetchOrders();

        setupListeners();
    }

    function setupListeners() {
        const searchInput = document.getElementById('materials-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                renderMaterialsList(e.target.value.toLowerCase());
            });
        }
    }

    // --- PERSISTENCIA LOCAL ---

    function loadFromLocal() {
        const localStock = localStorage.getItem(`portis-stock-${userId}`);
        const localOrders = localStorage.getItem(`portis-orders-${userId}`);
        const localUsage = localStorage.getItem(`portis-usage-${userId}`);

        if (localStock) materialsData = JSON.parse(localStock);
        if (localOrders) ordersData = JSON.parse(localOrders);
        if (localUsage) usageData = JSON.parse(localUsage);

        renderMaterialsList();
    }

    function saveToLocal() {
        localStorage.setItem(`portis-stock-${userId}`, JSON.stringify(materialsData));
        localStorage.setItem(`portis-orders-${userId}`, JSON.stringify(ordersData));
        localStorage.setItem(`portis-usage-${userId}`, JSON.stringify(usageData));
    }

    // --- CARGA DE FIRESTORE ---

    async function fetchMaterials() {
        try {
            const snapshot = await db.collection(`users/${userId}/inventory`).orderBy('name').get();
            materialsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saveToLocal();
            if (currentTab === 'stock') renderMaterialsList();
            return materialsData;
        } catch (error) { console.error("Error fetching materials:", error); return []; }
    }

    async function fetchUsage() {
        try {
            const snapshot = await db.collection(`users/${userId}/usage`).orderBy('date', 'desc').get();
            usageData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saveToLocal();
            if (currentTab === 'usage') renderMaterialsList();
            return usageData;
        } catch (error) { console.error("Error fetching usage:", error); return []; }
    }

    // Exponer para refresco externo
    window.refreshMaterialsData = fetchMaterials;
    window.refreshUsageData = fetchUsage;

    async function fetchOrders() {
        try {
            const snapshot = await db.collection(`users/${userId}/material_orders`).orderBy('createdAt', 'desc').get();
            ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // LIMITAR A 50 TARJETAS (Borrar excesos de Firestore y Local)
            if (ordersData.length > 50) {
                const excess = ordersData.slice(50);
                ordersData = ordersData.slice(0, 50);

                // Borrar en segundo plano
                excess.forEach(async (oldOrder) => {
                    try {
                        await db.collection(`users/${userId}/material_orders`).doc(oldOrder.id).delete();
                    } catch (e) { console.error("Error deleting old order:", e); }
                });
            }

            saveToLocal();
            if (currentTab === 'orders') renderMaterialsList();
        } catch (error) { console.error("Error fetching orders:", error); }
    }

    // --- RENDERIZADO ---

    function renderMaterialsList(filter = '') {
        const container = document.getElementById('materials-content-area');
        if (!container) return;

        container.innerHTML = '';

        if (currentTab === 'stock') {
            const filtered = materialsData.filter(m => m.name.toLowerCase().includes(filter));
            renderStockView(container, filtered);
        } else if (currentTab === 'usage') {
            const filtered = usageData.filter(u => u.materialName.toLowerCase().includes(filter));
            renderUsageView(container, filtered);
        } else if (currentTab === 'orders') {
            const filtered = ordersData.filter(o => o.items.some(i => i.name.toLowerCase().includes(filter)));
            renderOrdersView(container, filtered);
        }
    }

    function renderStockView(container, data) {
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-10 italic">No hay resultados.</p>';
            return;
        }

        data.forEach(item => {
            const stock = item.stock || 0;
            // NUEVO SEMÁFORO DE STOCK
            let stockColorClass = 'text-blue-400';
            let stockBgClass = 'bg-blue-500/20';
            let stockIndicatorClass = 'text-blue-500';

            if (stock <= 3) {
                stockColorClass = 'text-red-400';
                stockBgClass = 'bg-red-500/20';
                stockIndicatorClass = 'text-red-500';
            } else if (stock <= 9) {
                stockColorClass = 'text-green-400';
                stockBgClass = 'bg-green-500/20';
                stockIndicatorClass = 'text-green-500';
            }

            const card = `
                <div onclick="window.toggleStockControls('${item.id}')" class="p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center group hover:border-accent-magenta/30 transition-all cursor-pointer">
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-lg ${stockBgClass} ${stockColorClass}">
                            <i class="ph ${getIconForMaterial(item.name)} text-xl"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-white text-sm">${item.name}</h4>
                            <p class="text-[10px] text-gray-400 uppercase tracking-wider">${item.category || 'Varios'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div id="stock-ctrl-${item.id}" class="hidden flex flex-col items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-200">
                            <button onclick="event.stopPropagation(); window.adjustStock('${item.id}', 1)" class="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                                <i class="ph ph-caret-up font-bold"></i>
                            </button>
                            <button onclick="event.stopPropagation(); window.adjustStock('${item.id}', -1)" class="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                                <i class="ph ph-caret-down font-bold"></i>
                            </button>
                        </div>
                        <div class="text-right min-w-[40px]">
                            <span class="text-xl font-bold ${stockIndicatorClass}">${stock}</span>
                            <p class="text-[10px] text-gray-500">Stock</p>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });
    }

    function renderUsageView(container, data) {
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-10 italic">No hay registros de consumo.</p>';
            return;
        }

        data.forEach(log => {
            const dateStr = new Date(log.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const card = `
                <div class="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                             <div class="w-2 h-2 rounded-full bg-accent-magenta"></div>
                             <h4 class="font-bold text-white text-sm">${log.materialName}</h4>
                        </div>
                        <span class="text-xs font-bold text-accent-magenta">-${log.amount}</span>
                    </div>
                    <div class="flex justify-between items-end text-[11px] text-gray-400">
                        <div class="flex items-center gap-1">
                            <i class="ph ph-wrench"></i>
                            <span class="truncate max-w-[150px]">${log.location || log.maintenanceLocation || 'General'}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <i class="ph ph-calendar"></i>
                            <span>${dateStr}</span>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });
    }

    function renderOrdersView(container, data) {
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-10 italic">No hay pedidos registrados.</p>';
            return;
        }

        data.forEach(order => {
            const status = order.status || 'pending';
            const isPending = status === 'pending';
            const isShipped = status === 'shipped';
            const isReceived = status === 'received';

            let statusLabel = 'Pendiente';
            let statusClass = 'text-yellow-500';
            let icon = 'ph-clock-countdown';
            let btnHtml = '';

            if (isPending) {
                btnHtml = `<button onclick="window.markOrderShipped('${order.id}')" class="p-1 px-4 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-[10px] font-bold text-yellow-500 transition-all border border-yellow-500/40 shadow-lg shadow-yellow-500/5">ENVIAR</button>`;
            } else if (isShipped) {
                statusLabel = 'En camino';
                statusClass = 'text-blue-400';
                icon = 'ph-truck';
                btnHtml = `<button onclick="window.markOrderReceived('${order.id}')" class="p-1 px-4 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-[10px] font-bold text-blue-400 transition-all border border-blue-500/40 shadow-lg shadow-blue-500/5">RECIBIDO</button>`;
            } else if (isReceived) {
                statusLabel = 'Recibido';
                statusClass = 'text-green-500';
                icon = 'ph-check-circle';
            }

            const itemsHtml = order.items.map((i, idx) => {
                const itemReceived = i.received !== false; // Por defecto true si no existe el campo (compatibilidad)
                return `
                <div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                    <div class="flex items-center gap-2">
                        ${isShipped ? `
                            <button onclick="window.toggleOrderItem('${order.id}', ${idx})" class="p-1 rounded ${itemReceived ? 'text-green-500 bg-green-500/10' : 'text-gray-500 bg-white/5'}">
                                <i class="ph ${itemReceived ? 'ph-check-circle' : 'ph-circle'}"></i>
                            </button>
                        ` : ''}
                        <span class="text-xs ${(!itemReceived && isShipped) ? 'text-gray-500 line-through' : 'text-gray-300'}">${i.name}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-white text-xs">x${i.amount}</span>
                    </div>
                </div>
            `}).join('');

            const card = `
                <div class="p-4 rounded-xl bg-white/5 border ${isPending ? 'border-yellow-500/20' : isShipped ? 'border-blue-500/20' : 'border-green-500/20'} flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <i class="ph ${icon} ${statusClass} text-lg"></i>
                            <span class="text-[10px] font-bold uppercase tracking-widest ${statusClass}">
                                ${statusLabel}
                            </span>
                        </div>
                        ${btnHtml}
                    </div>
                    <div class="bg-black/20 rounded-lg px-3">
                        ${itemsHtml}
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });
    }

    // --- MODALES Y ACCIONES ---

    window.toggleMaterialsSearch = function () {
        const container = document.getElementById('materials-search-container');
        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            document.getElementById('materials-search-input').focus();
        } else {
            container.classList.add('hidden');
            document.getElementById('materials-search-input').value = '';
            renderMaterialsList();
        }
    };

    window.openAddMaterialModal = function () {
        tempOrderList = [];
        updateTempOrderUI();
        if (typeof window.showModal === 'function') {
            window.showModal('add-material-modal');
        } else {
            document.getElementById('add-material-modal').classList.remove('hidden');
            document.getElementById('add-material-modal').classList.add('flex');
        }
    };

    window.addItemToOrderList = function () {
        const nameInput = document.getElementById('order-material-name');
        const amountInput = document.getElementById('order-material-amount');
        const name = nameInput.value.trim();
        const amount = parseInt(amountInput.value);

        if (!name || isNaN(amount) || amount <= 0) return;

        tempOrderList.push({ name, amount });
        nameInput.value = '';
        amountInput.value = '1';
        nameInput.focus();

        updateTempOrderUI();
    };

    function updateTempOrderUI() {
        const listContainer = document.getElementById('temp-order-list');
        const submitBtn = document.getElementById('submit-order-btn');

        if (tempOrderList.length === 0) {
            listContainer.innerHTML = '<p class="text-xs text-center text-gray-500 py-4 italic">Añade productos a la lista...</p>';
            submitBtn.disabled = true;
            return;
        }

        submitBtn.disabled = false;
        listContainer.innerHTML = tempOrderList.map((item, index) => `
            <div class="flex justify-between items-center p-2 rounded-lg bg-white/5 border border-white/5">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded flex items-center justify-center bg-accent-magenta/20 text-accent-magenta text-[10px] font-bold">${item.amount}</span>
                    <span class="text-xs text-white font-medium">${item.name}</span>
                </div>
                <button onclick="window.removeItemFromTempList(${index})" class="text-red-400 p-1 hover:bg-red-500/10 rounded"><i class="ph ph-trash"></i></button>
            </div>
        `).join('');
    }

    window.removeItemFromTempList = function (index) {
        tempOrderList.splice(index, 1);
        updateTempOrderUI();
    };

    window.submitMaterialOrder = async function () {
        if (tempOrderList.length === 0) return;

        const newOrder = {
            userId,
            items: tempOrderList,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection(`users/${userId}/material_orders`).add(newOrder);
            if (typeof window.closeModal === 'function') {
                window.closeModal('add-material-modal');
            } else {
                document.getElementById('add-material-modal').classList.add('hidden');
            }
            fetchOrders();
            if (typeof window.showAppMessage === 'function') window.showAppMessage('success', 'Pedido enviado correctamente');
        } catch (error) {
            console.error("Error submitting order:", error);
        }
    };

    window.markOrderShipped = async function (orderId) {
        try {
            await db.collection(`users/${userId}/material_orders`).doc(orderId).update({
                status: 'shipped',
                shippedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            fetchOrders();
            if (typeof window.showAppMessage === 'function') window.showAppMessage('success', 'Pedido marcado como EN CAMINO');
        } catch (error) { console.error("Error shipping order:", error); }
    };

    window.toggleOrderItem = async function (orderId, index) {
        const order = ordersData.find(o => o.id === orderId);
        if (!order) return;

        const items = [...order.items];
        items[index].received = !items[index].received;

        try {
            await db.collection(`users/${userId}/material_orders`).doc(orderId).update({ items });
            fetchOrders();
        } catch (error) { console.error("Error toggling item:", error); }
    };

    window.removeOrderItem = async function (orderId, index) {
        if (!confirm("¿Eliminar este artículo del pedido?")) return;
        const order = ordersData.find(o => o.id === orderId);
        if (!order) return;

        const items = [...order.items];
        items.splice(index, 1);

        try {
            if (items.length === 0) {
                await db.collection(`users/${userId}/material_orders`).doc(orderId).delete();
            } else {
                await db.collection(`users/${userId}/material_orders`).doc(orderId).update({ items });
            }
            fetchOrders();
        } catch (error) { console.error("Error removing item:", error); }
    };

    window.markOrderReceived = async function (orderId) {
        const order = ordersData.find(o => o.id === orderId);
        if (!order) return;

        const itemsToProcess = order.items.filter(i => i.received !== false);
        if (itemsToProcess.length === 0) {
            if (!confirm("No has marcado ningún artículo como recibido. ¿Deseas marcar el pedido como finalizado sin añadir stock?")) return;
        }

        try {
            const batch = db.batch();

            // 1. Actualizar estado del pedido y limpiar lista de artículos (quitar no recibidos)
            const orderRef = db.collection(`users/${userId}/material_orders`).doc(orderId);
            batch.update(orderRef, {
                status: 'received',
                items: itemsToProcess,
                receivedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Actualizar inventario (solo artículos marcados)
            for (const item of itemsToProcess) {
                // Buscamos si el material ya existe
                const existing = materialsData.find(m => m.name.toLowerCase() === item.name.toLowerCase());
                if (existing) {
                    const materialRef = db.collection(`users/${userId}/inventory`).doc(existing.id);
                    batch.update(materialRef, {
                        stock: (existing.stock || 0) + item.amount
                    });
                } else {
                    const materialRef = db.collection(`users/${userId}/inventory`).doc();
                    batch.set(materialRef, {
                        name: item.name,
                        stock: item.amount,
                        minStock: 2,
                        category: 'Varios',
                        icon: getIconForMaterial(item.name)
                    });
                }
            }

            await batch.commit();
            fetchOrders();
            fetchMaterials();
            if (typeof window.showAppMessage === 'function') window.showAppMessage('success', 'Material recibido e inventario actualizado');
        } catch (error) {
            console.error("Error receiving order:", error);
        }
    };

    window.startQRScanner = function () {
        if (typeof window.showModal === 'function') {
            window.showModal('qr-scanner-modal');
        } else {
            const modal = document.getElementById('qr-scanner-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        // Simulación de escaneo para demo o vinculación
        console.log("QR Scanner Ready...");
    };

    window.handleQRScanResult = async function (qrData) {
        // Buscamos si el QR ya existe en el inventario
        const existingItem = materialsData.find(m => m.qr_code === qrData);

        if (existingItem) {
            // Si existe, mostramos info y permitimos descontar/sumar (En una app real aquí iría la lógica de consumo directo)
            if (typeof window.showAppMessage === 'function') {
                window.showAppMessage('success', `Escaneado: ${existingItem.name}`);
            }
        } else {
            // VINCULACIÓN DINÁMICA: Si no existe, preguntar a qué producto asociarlo
            const itemsList = materialsData.map(m => m.name).join('\n');
            const targetName = prompt(`Código QR desconocido (${qrData}).\n¿A qué producto del inventario quieres asignarlo?\n\nProductos disponibles:\n${itemsList}`);

            if (targetName) {
                const item = materialsData.find(m => m.name.toLowerCase() === targetName.toLowerCase());
                if (item) {
                    try {
                        await db.collection(`users/${userId}/inventory`).doc(item.id).update({
                            qr_code: qrData
                        });
                        fetchMaterials();
                        if (typeof window.showAppMessage === 'function') {
                            window.showAppMessage('success', `Código vinculado a: ${item.name}`);
                        }
                    } catch (e) { console.error("Error linking QR:", e); }
                } else {
                    alert("Producto no encontrado en el inventario.");
                }
            }
        }
    };

    window.setMaterialsTab = function (tab) {
        currentTab = tab;
        document.querySelectorAll('[id^="tab-"]').forEach(btn => {
            btn.classList.remove('active-tab');
            btn.classList.add('text-gray-400');
        });
        const activeBtn = document.getElementById(`tab-${tab}`);
        if (activeBtn) {
            activeBtn.classList.add('active-tab');
            activeBtn.classList.remove('text-gray-400');
        }
        renderMaterialsList();
    };

    window.toggleStockControls = function (itemId) {
        const ctrl = document.getElementById(`stock-ctrl-${itemId}`);
        if (!ctrl) return;

        // Cerrar otros controles abiertos primero
        document.querySelectorAll('[id^="stock-ctrl-"]').forEach(el => {
            if (el.id !== `stock-ctrl-${itemId}`) el.classList.add('hidden');
        });

        ctrl.classList.toggle('hidden');
    };

    window.adjustStock = async function (itemId, delta) {
        const item = materialsData.find(m => m.id === itemId);
        if (!item) return;

        const newStock = Math.max(0, (item.stock || 0) + delta);
        if (newStock === (item.stock || 0)) return;

        try {
            await db.collection(`users/${userId}/inventory`).doc(itemId).update({
                stock: newStock
            });
            fetchMaterials();
            if (typeof window.showAppMessage === 'function') {
                window.showAppMessage('success', `Stock actualizado: ${newStock}`);
            }
        } catch (error) { console.error("Error adjusting stock:", error); }
    };

    // --- INTEGRACIÓN CON MANTENIMIENTO ---
    // Estas funciones serán usadas por Maintenance.js

    // --- NUEVO SISTEMA DE FLUJO DE MATERIALES (STOCK <-> CONSUMO) ---

    window.addPendingUsage = async function (materialId, materialName, amount, location) {
        if (!db || !userId) return;
        try {
            const materialRef = db.collection(`users/${userId}/inventory`).doc(materialId);
            const matDoc = await materialRef.get();
            if (!matDoc.exists) return;

            const currentStock = matDoc.data().stock || 0;
            const newStock = Math.max(0, currentStock - amount);

            // 1. Descontar de Inventario
            await materialRef.update({ stock: newStock });

            // 2. Añadir a Consumo (En curso)
            await db.collection(`users/${userId}/usage`).add({
                materialId,
                materialName,
                amount,
                location,
                date: new Date().toISOString(),
                status: 'pending' // Material asignado pero no finalizado
            });

            // Esperar a que los datos se refresquen localmente antes de continuar
            await fetchMaterials();
            await fetchUsage();
        } catch (e) { console.error("Error adding pending usage:", e); }
    };

    window.removePendingUsage = async function (materialId, materialName, location) {
        if (!db || !userId) return;
        try {
            // 1. Buscar en consumos pendientes para esa ubicación y material
            const usageRef = db.collection(`users/${userId}/usage`);
            const q = await usageRef
                .where('location', '==', location)
                .where('materialId', '==', materialId)
                .where('status', '==', 'pending')
                .limit(1)
                .get();

            if (q.empty) return;

            const usageDoc = q.docs[0];
            const amount = usageDoc.data().amount;

            // 2. Devolver a Inventario
            const materialRef = db.collection(`users/${userId}/inventory`).doc(materialId);
            const matDoc = await materialRef.get();
            if (matDoc.exists) {
                const currentStock = matDoc.data().stock || 0;
                await materialRef.update({ stock: currentStock + amount });
            }

            // 3. Eliminar de Consumo
            await usageDoc.ref.delete();

            await fetchMaterials();
            await fetchUsage();
        } catch (e) { console.error("Error removing pending usage:", e); }
    };

    window.finalizeUsageForLocation = async function (location) {
        if (!db || !userId) return;
        try {
            // Al completar la tarea, el material desaparece de consumos "en curso"
            const usageRef = db.collection(`users/${userId}/usage`);
            const q = await usageRef.where('location', '==', location).get();

            const batch = db.batch();
            q.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            fetchUsage();
        } catch (e) { console.error("Error finalizing usage:", e); }
    };

    // Mantener retrocompatibilidad o simplificar
    window.getMaterialsForSelection = function () {
        return materialsData;
    };

    // Inicializar
    initMaterials();

})();

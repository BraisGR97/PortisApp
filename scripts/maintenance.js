// Asegúrate que este archivo se carga **después** de que existan los elementos en el DOM

// Redirigir
const backBtn = document.getElementById('backBtn');
if (backBtn) backBtn.addEventListener('click', () => window.location.href = 'main.html');

// Modal añadir
const addBtn = document.getElementById('addBtn');
const addModal = document.getElementById('addModal');
const closeAddModal = document.getElementById('closeAddModal');
const nameInput = document.getElementById('nameInput');
const confirmAdd = document.getElementById('confirmAdd');

// Modal detalle
const detailModal = document.getElementById('detailModal');
const closeDetailModal = document.getElementById('closeDetailModal');
const detailName = document.getElementById('detailName');
const tickButton = document.getElementById('tickButton');

// Lista DOM
const itemList = document.getElementById('itemList');

// KEY en localStorage por usuario (si usas Firebase adapta la parte de carga/guardado)
const currentUser = localStorage.getItem('currentUser') || 'guest';
const STORAGE_KEY = `maintenance_items_${currentUser}`;

// Cargar items desde localStorage
let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

// ---------- Helpers ----------
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function createListItem(name, index) {
  const li = document.createElement('li');
  li.className = 'list-item';
  li.setAttribute('data-index', String(index));
  li.tabIndex = 0; // permite foco para accesibilidad
  li.textContent = name;

  // Añadimos un pequeño margen interno para evitar que el click en la X (si la añades) choque
  li.style.userSelect = 'none';
  li.style.cursor = 'pointer';

  // Click / Enter abre el modal de detalle
  li.addEventListener('click', () => openDetail(index));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail(index);
    }
  });

  return li;
}

function renderList() {
  itemList.innerHTML = '';
  items.forEach((name, idx) => {
    const li = createListItem(name, idx);
    itemList.appendChild(li);
  });
}

// ---------- Modal añadir ----------
if (addBtn && addModal) {
  addBtn.addEventListener('click', () => {
    // limpiar campo y mostrar modal
    if (nameInput) nameInput.value = '';
    addModal.style.display = 'flex';
    if (nameInput) nameInput.focus();
  });
}
if (closeAddModal) {
  closeAddModal.addEventListener('click', () => addModal.style.display = 'none');
}
window.addEventListener('click', (e) => {
  if (e.target === addModal) addModal.style.display = 'none';
  if (e.target === detailModal) detailModal.style.display = 'none';
});

if (confirmAdd && nameInput) {
  confirmAdd.addEventListener('click', () => {
    const name = (nameInput.value || '').trim();
    if (!name) return;
    items.push(name);
    saveItems();
    renderList();
    addModal.style.display = 'none';
  });
}

// ---------- Modal detalle ----------
function openDetail(index) {
  const name = items[index];
  if (!name) return;
  if (detailName) detailName.textContent = name;
  detailModal.style.display = 'flex';
  // guarda el índice en el botón tick para usarlo luego si quieres
  tickButton.dataset.index = String(index);
}

if (closeDetailModal) closeDetailModal.addEventListener('click', () => detailModal.style.display = 'none');

if (tickButton) {
  tickButton.addEventListener('click', () => {
    const idx = Number(tickButton.dataset.index);
    console.log('Tick clicked for index', idx, 'name:', items[idx]);
    // aquí se añadirá la funcionalidad que quieras (marcar completado, enviar a Firebase, etc.)
    // ejemplo visual (marcar como completado): 
    // items[idx] = items[idx] + " ✅";
    // saveItems(); renderList(); detailModal.style.display='none';
  });
}

// Inicial render
renderList();

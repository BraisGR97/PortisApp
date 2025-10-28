// Botones principales
const backBtn = document.getElementById('backBtn');
const addBtn = document.getElementById('addBtn');
const itemList = document.getElementById('itemList');

// Modal añadir
const addModal = document.getElementById('addModal');
const closeAddModal = document.getElementById('closeAddModal');
const nameInput = document.getElementById('nameInput');
const confirmAdd = document.getElementById('confirmAdd');

// Modal detalle
const detailModal = document.getElementById('detailModal');
const closeDetailModal = document.getElementById('closeDetailModal');
const detailName = document.getElementById('detailName');
const tickButton = document.getElementById('tickButton');

// Cargar datos guardados
let items = JSON.parse(localStorage.getItem('mantenimientoItems')) || [];
renderList();

// --- BOTONES PRINCIPALES ---
backBtn.addEventListener('click', () => {
  window.location.href = 'main.html';
});

addBtn.addEventListener('click', () => {
  addModal.style.display = 'flex';
});

closeAddModal.addEventListener('click', () => {
  addModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if(e.target === addModal) addModal.style.display = 'none';
  if(e.target === detailModal) detailModal.style.display = 'none';
});

// --- CONFIRMAR NUEVO NOMBRE ---
confirmAdd.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if(name){
    items.push(name);
    localStorage.setItem('mantenimientoItems', JSON.stringify(items));
    renderList();
    nameInput.value = '';
    addModal.style.display = 'none';
  }
});

// --- RENDERIZAR LISTA ---
function renderList(){
  itemList.innerHTML = '';
  items.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    li.classList.add('list-item');

    li.addEventListener('click', () => openDetail(name));
    itemList.appendChild(li);
  });
}

// --- ABRIR DETALLE DE ELEMENTO ---
function openDetail(name){
  detailName.textContent = name;
  detailModal.style.display = 'flex';
}

// --- CERRAR DETALLE ---
closeDetailModal.addEventListener('click', () => {
  detailModal.style.display = 'none';
});

// --- CLICK EN TICK VERDE (a implementar después) ---
tickButton.addEventListener('click', () => {
  console.log('Tick pulsado para:', detailName.textContent);
});

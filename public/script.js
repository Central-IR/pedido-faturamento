// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3004/api'
    : `${window.location.origin}/api`;

let pedidos = [];
let isOnline = false;
let itemCounter = 0;
let editingId = null;
let sessionToken = null;
let currentUser = null;
let currentMonth = new Date();
let calendarYear = new Date().getFullYear();
let currentTabIndex = 0;
const tabs = ['tab-geral', 'tab-faturamento', 'tab-itens', 'tab-entrega', 'tab-transporte'];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
}

function formatarCNPJ(cnpj) {
    cnpj = cnpj.replace(/\D/g, '');
    if (cnpj.length <= 14) {
        return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
}

function formatarMoeda(valor) {
    if (typeof valor === 'string' && valor.startsWith('R$')) return valor;
    const num = parseFloat(valor) || 0;
    return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseMoeda(valor) {
    if (!valor) return 0;
    return parseFloat(valor.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

function showMessage(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `floating-message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => div.remove(), 300);
    }, 2000);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

// ============================================
// INICIALIZAÇÃO E AUTENTICAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('pedidosSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('pedidosSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    obterDadosUsuario();
}

async function obterDadosUsuario() {
    try {
        const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!response.ok) {
            mostrarTelaAcessoNegado('Sessão inválida');
            return;
        }

        const data = await response.json();
        if (data.valid && data.session) {
            currentUser = data.session;
            inicializarApp();
        } else {
            mostrarTelaAcessoNegado('Sessão inválida');
        }
    } catch (error) {
        console.error('Erro ao obter dados do usuário:', error);
        mostrarTelaAcessoNegado('Erro ao validar sessão');
    }
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    console.log('📱 Inicializando app...');
    console.log('👤 Usuário:', currentUser);
    
    checkServerStatus();
    loadPedidos();
    updateMonthDisplay();
    renderCalendar();
    
    setInterval(checkServerStatus, 30000);
    setInterval(loadPedidos, 60000);
    
    document.getElementById('pedidoForm').addEventListener('submit', savePedido);
    
    setTimeout(() => {
        document.getElementById('splashScreen').style.display = 'none';
    }, 800);
}

// ============================================
// NAVEGAÇÃO DE MESES
// ============================================
function changeMonth(direction) {
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    updateMonthDisplay();
    updateDisplay();
}

function updateMonthDisplay() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = months[currentMonth.getMonth()];
    const year = currentMonth.getFullYear();
    document.getElementById('currentMonth').textContent = `${monthName} ${year}`;
}

// ============================================
// CALENDÁRIO
// ============================================
function toggleCalendar() {
    const modal = document.getElementById('calendarModal');
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
        calendarYear = currentMonth.getFullYear();
        renderCalendar();
    } else {
        modal.style.display = 'none';
    }
}

function changeCalendarYear(direction) {
    calendarYear += direction;
    document.getElementById('calendarYear').textContent = calendarYear;
    renderCalendar();
}

function renderCalendar() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    document.getElementById('calendarYear').textContent = calendarYear;
    
    const container = document.getElementById('calendarMonths');
    container.innerHTML = months.map((month, index) => {
        const isCurrentMonth = index === currentMonth.getMonth() && 
                              calendarYear === currentMonth.getFullYear();
        return `
            <button class="month-btn ${isCurrentMonth ? 'active' : ''}" 
                    onclick="selectMonth(${index})">
                ${month}
            </button>
        `;
    }).join('');
}

function selectMonth(monthIndex) {
    currentMonth = new Date(calendarYear, monthIndex, 1);
    toggleCalendar();
    updateMonthDisplay();
    updateDisplay();
}

// ============================================
// SERVIDOR E DADOS
// ============================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/pedidos`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Session-Token': sessionToken
            }
        });

        isOnline = response.ok;
        updateConnectionStatus();
        
        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
        }
        
        return isOnline;
    } catch (error) {
        console.error('❌ Erro ao verificar servidor:', error);
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElem = document.getElementById('connectionStatus');
    if (!statusElem) return;
    
    if (isOnline) {
        statusElem.classList.remove('offline');
        statusElem.classList.add('online');
    } else {
        statusElem.classList.remove('online');
        statusElem.classList.add('offline');
    }
}

async function loadPedidos() {
    try {
        const response = await fetch(`${API_URL}/pedidos`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Session-Token': sessionToken
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        pedidos = data;
        isOnline = true;
        updateConnectionStatus();
        updateDisplay();
        
        console.log(`[${new Date().toLocaleTimeString()}] ${pedidos.length} pedidos carregados`);
    } catch (error) {
        console.error('❌ Erro ao carregar pedidos:', error);
        isOnline = false;
        updateConnectionStatus();
    }
}

function updateDisplay() {
    updateDashboard();
    renderPedidos();
}

function updateDashboard() {
    const mesSelecionado = currentMonth.getMonth();
    const anoSelecionado = currentMonth.getFullYear();
    
    // Filtrar pedidos do mês selecionado
    const pedidosDoMes = pedidos.filter(p => {
        if (!p.data_pedido) return false;
        const dataPedido = new Date(p.data_pedido);
        return dataPedido.getMonth() === mesSelecionado && 
               dataPedido.getFullYear() === anoSelecionado;
    });
    
    const total = pedidosDoMes.length;
    const emitidos = pedidosDoMes.filter(p => p.status === 'EMITIDO').length;
    const pendentes = pedidosDoMes.filter(p => p.status === 'PENDENTE').length;
    
    const valorTotal = pedidosDoMes.reduce((sum, p) => {
        const valor = parseFloat(p.valor_total) || 0;
        return sum + valor;
    }, 0);
    
    document.getElementById('totalPedidos').textContent = total;
    document.getElementById('totalEmitidos').textContent = emitidos;
    document.getElementById('totalPendentes').textContent = pendentes;
    document.getElementById('valorTotal').textContent = formatarMoeda(valorTotal);
}

function renderPedidos() {
    const tbody = document.getElementById('pedidosTable');
    if (!tbody) return;
    
    const mesSelecionado = currentMonth.getMonth();
    const anoSelecionado = currentMonth.getFullYear();
    
    // Filtrar e ordenar pedidos do mês
    let pedidosFiltrados = pedidos.filter(p => {
        if (!p.data_pedido) return false;
        const dataPedido = new Date(p.data_pedido);
        return dataPedido.getMonth() === mesSelecionado && 
               dataPedido.getFullYear() === anoSelecionado;
    });
    
    // Aplicar filtros de pesquisa
    const search = document.getElementById('search')?.value.toLowerCase() || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    
    if (search) {
        pedidosFiltrados = pedidosFiltrados.filter(p =>
            (p.codigo || '').toLowerCase().includes(search) ||
            (p.cliente || '').toLowerCase().includes(search) ||
            (p.cnpj || '').includes(search)
        );
    }
    
    if (filterStatus) {
        pedidosFiltrados = pedidosFiltrados.filter(p => p.status === filterStatus);
    }
    
    // Ordenar por número do pedido (crescente)
    pedidosFiltrados.sort((a, b) => {
        const codigoA = parseInt(a.codigo) || 0;
        const codigoB = parseInt(b.codigo) || 0;
        return codigoA - codigoB;
    });
    
    if (pedidosFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum pedido encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = pedidosFiltrados.map(pedido => `
        <tr>
            <td><strong>${pedido.codigo}</strong></td>
            <td>${pedido.cliente}</td>
            <td>
                <span class="badge badge-${pedido.status === 'EMITIDO' ? 'success' : 'warning'}">
                    ${pedido.status}
                </span>
            </td>
            <td><strong>${formatarMoeda(pedido.valor_total || 0)}</strong></td>
            <td>${pedido.responsavel || '-'}</td>
            <td>
                <button onclick="editPedido('${pedido.id}')" class="btn-action btn-edit" title="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function filterPedidos() {
    renderPedidos();
}

// ============================================
// FORMULÁRIO - NAVEGAÇÃO
// ============================================
function showFormulario() {
    document.getElementById('listView').style.display = 'none';
    document.getElementById('formView').style.display = 'block';
    
    resetForm();
    editingId = null;
    currentTabIndex = 0;
    switchTab(0);
    
    // Definir responsável automaticamente
    if (currentUser && currentUser.username) {
        document.getElementById('responsavel').value = currentUser.username;
    }
    
    // Definir data do pedido automaticamente
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('data_pedido').value = hoje;
    
    document.getElementById('formTitle').textContent = 'Novo Pedido';
    document.getElementById('btnConfirmarEmissao').style.display = 'none';
    document.getElementById('estoqueWarning').style.display = 'none';
}

function hideFormulario() {
    document.getElementById('listView').style.display = 'block';
    document.getElementById('formView').style.display = 'none';
    resetForm();
    editingId = null;
}

function switchTab(index) {
    currentTabIndex = index;
    
    // Atualizar botões
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        if (i === index) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Atualizar conteúdo
    document.querySelectorAll('.tab-content').forEach((content, i) => {
        if (i === index) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

function resetForm() {
    document.getElementById('pedidoForm').reset();
    document.getElementById('itensContainer').innerHTML = '';
    itemCounter = 0;
}

// ============================================
// ITENS DO PEDIDO
// ============================================
function addItem() {
    itemCounter++;
    const container = document.getElementById('itensContainer');
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item-row';
    itemDiv.id = `item-${itemCounter}`;
    itemDiv.innerHTML = `
        <div class="item-fields">
            <div class="form-group form-group-small">
                <label>Código *</label>
                <input type="text" name="item_codigo[]" required>
            </div>
            <div class="form-group">
                <label>Descrição *</label>
                <input type="text" name="item_descricao[]" required>
            </div>
            <div class="form-group form-group-small">
                <label>Quantidade *</label>
                <input type="number" name="item_quantidade[]" min="1" value="1" required onchange="calcularTotalItem(${itemCounter})">
            </div>
            <div class="form-group form-group-small">
                <label>Valor Unit. *</label>
                <input type="text" name="item_valor[]" required onchange="calcularTotalItem(${itemCounter})">
            </div>
            <div class="form-group form-group-small">
                <label>Total</label>
                <input type="text" name="item_total[]" readonly>
            </div>
        </div>
        <button type="button" onclick="removeItem(${itemCounter})" class="btn-remove-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    container.appendChild(itemDiv);
}

function removeItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (item) item.remove();
}

function calcularTotalItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (!item) return;
    
    const qtd = parseFloat(item.querySelector('[name="item_quantidade[]"]').value) || 0;
    const valor = parseMoeda(item.querySelector('[name="item_valor[]"]').value);
    const total = qtd * valor;
    
    item.querySelector('[name="item_total[]"]').value = formatarMoeda(total);
}

// ============================================
// SALVAR E EDITAR PEDIDO
// ============================================
async function savePedido(e) {
    e.preventDefault();
    
    // Coletar dados do formulário
    const formData = {
        codigo: document.getElementById('codigo').value,
        cnpj: document.getElementById('cnpj').value,
        cliente: document.getElementById('cliente').value.toUpperCase(),
        vendedor: document.getElementById('vendedor').value.toUpperCase(),
        responsavel: document.getElementById('responsavel').value,
        data_pedido: document.getElementById('data_pedido').value,
        documento: document.getElementById('documento').value,
        inscricao_estadual: document.getElementById('inscricao_estadual').value,
        email_nfe: document.getElementById('email_nfe').value,
        tipo_pagamento: document.getElementById('tipo_pagamento').value,
        condicao_pagamento: document.getElementById('condicao_pagamento').value,
        endereco_entrega: document.getElementById('endereco_entrega').value.toUpperCase(),
        cep_entrega: document.getElementById('cep_entrega').value,
        cidade_entrega: document.getElementById('cidade_entrega').value.toUpperCase(),
        uf_entrega: document.getElementById('uf_entrega').value.toUpperCase(),
        modalidade_frete: document.getElementById('modalidade_frete').value,
        transportadora: document.getElementById('transportadora').value.toUpperCase(),
        observacoes: document.getElementById('observacoes').value.toUpperCase(),
        status: 'PENDENTE'
    };
    
    // Coletar itens
    const itens = [];
    const itemRows = document.querySelectorAll('.item-row');
    let valorTotal = 0;
    
    itemRows.forEach(row => {
        const item = {
            codigo: row.querySelector('[name="item_codigo[]"]').value,
            descricao: row.querySelector('[name="item_descricao[]"]').value.toUpperCase(),
            quantidade: parseFloat(row.querySelector('[name="item_quantidade[]"]').value),
            valor_unitario: parseMoeda(row.querySelector('[name="item_valor[]"]').value),
            total: parseMoeda(row.querySelector('[name="item_total[]"]').value)
        };
        itens.push(item);
        valorTotal += item.total;
    });
    
    formData.itens = JSON.stringify(itens);
    formData.valor_total = valorTotal;
    
    try {
        const url = editingId ? `${API_URL}/pedidos/${editingId}` : `${API_URL}/pedidos`;
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            throw new Error('Erro ao salvar pedido');
        }
        
        showMessage(editingId ? 'Pedido atualizado!' : 'Pedido criado!', 'success');
        hideFormulario();
        loadPedidos();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao salvar pedido', 'error');
    }
}

async function editPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    editingId = id;
    showFormulario();
    
    document.getElementById('formTitle').textContent = 'Editar Pedido';
    
    // Preencher campos
    document.getElementById('codigo').value = pedido.codigo || '';
    document.getElementById('cnpj').value = pedido.cnpj || '';
    document.getElementById('cliente').value = pedido.cliente || '';
    document.getElementById('vendedor').value = pedido.vendedor || '';
    document.getElementById('responsavel').value = pedido.responsavel || '';
    document.getElementById('data_pedido').value = pedido.data_pedido || '';
    document.getElementById('documento').value = pedido.documento || '';
    document.getElementById('inscricao_estadual').value = pedido.inscricao_estadual || '';
    document.getElementById('email_nfe').value = pedido.email_nfe || '';
    document.getElementById('tipo_pagamento').value = pedido.tipo_pagamento || '';
    document.getElementById('condicao_pagamento').value = pedido.condicao_pagamento || '';
    document.getElementById('endereco_entrega').value = pedido.endereco_entrega || '';
    document.getElementById('cep_entrega').value = pedido.cep_entrega || '';
    document.getElementById('cidade_entrega').value = pedido.cidade_entrega || '';
    document.getElementById('uf_entrega').value = pedido.uf_entrega || '';
    document.getElementById('modalidade_frete').value = pedido.modalidade_frete || '';
    document.getElementById('transportadora').value = pedido.transportadora || '';
    document.getElementById('observacoes').value = pedido.observacoes || '';
    
    // Carregar itens
    if (pedido.itens) {
        const itens = JSON.parse(pedido.itens);
        itens.forEach(item => {
            addItem();
            const lastItem = document.querySelector('.item-row:last-child');
            if (lastItem) {
                lastItem.querySelector('[name="item_codigo[]"]').value = item.codigo || '';
                lastItem.querySelector('[name="item_descricao[]"]').value = item.descricao || '';
                lastItem.querySelector('[name="item_quantidade[]"]').value = item.quantidade || 1;
                lastItem.querySelector('[name="item_valor[]"]').value = formatarMoeda(item.valor_unitario || 0);
                lastItem.querySelector('[name="item_total[]"]').value = formatarMoeda(item.total || 0);
            }
        });
    }
    
    // Verificar se pode confirmar emissão
    verificarEstoque();
    
    // Mostrar botão de confirmar emissão se status for PENDENTE
    if (pedido.status === 'PENDENTE') {
        document.getElementById('btnConfirmarEmissao').style.display = 'inline-block';
    }
}

// ============================================
// CONFIRMAR EMISSÃO
// ============================================
function verificarEstoque() {
    const itemRows = document.querySelectorAll('.item-row');
    let todosPreenchidos = true;
    
    itemRows.forEach(row => {
        const codigo = row.querySelector('[name="item_codigo[]"]').value.trim();
        if (!codigo) {
            todosPreenchidos = false;
        }
    });
    
    const warning = document.getElementById('estoqueWarning');
    if (!todosPreenchidos) {
        warning.style.display = 'block';
        return false;
    } else {
        warning.style.display = 'none';
        return true;
    }
}

async function confirmarEmissao() {
    if (!editingId) {
        showMessage('Salve o pedido antes de confirmar a emissão', 'error');
        return;
    }
    
    if (!verificarEstoque()) {
        showMessage('Preencha todos os códigos do estoque antes de confirmar', 'error');
        return;
    }
    
    if (!confirm('Confirmar emissão deste pedido?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/pedidos/${editingId}/confirmar-emissao`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao confirmar emissão');
        }
        
        showMessage('Emissão confirmada com sucesso!', 'success');
        hideFormulario();
        loadPedidos();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao confirmar emissão', 'error');
    }
}

// Adicionar event listener para verificar estoque ao mudar de aba
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('pedidoForm');
    if (form) {
        form.addEventListener('change', verificarEstoque);
    }
});

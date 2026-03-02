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
let clientesCache = {};
let estoqueCache = {};
let editingId = null;
let sessionToken = null;
let currentTabIndex = 0;
let currentMonth = new Date(); // Mês atual para navegação
let lastDataHash = '';
let currentUser = null; // Usuário logado (para controle de permissões)
let currentFetchController = null;
let transportadorasCache = [];
const tabs = ['tab-geral', 'tab-faturamento', 'tab-itens', 'tab-entrega', 'tab-transporte'];


// ── Controle de permissões ──────────────────────────────────────────────────
const ROLES_CHECKBOX = ['administrador', 'financeiro'];
const NAMES_CHECKBOX = ['roberto', 'rosemeire', 'pollyanna'];

function detectResponsavelFromUser() {
    if (!currentUser) return '';
    const fullName = (currentUser.name || currentUser.nome || currentUser.username || '').trim();
    if (!fullName) return '';
    // Retorna o primeiro nome capitalizado para corresponder às options do select
    const firstName = fullName.split(' ')[0];
    // Mapeamento para os valores exatos do <select>
    const map = {
        'roberto': 'Roberto',
        'rosemeire': 'Rosemeire',
        'pollyanna': 'Pollyanna',
        'isaque': 'Isaque',
        'gustavo': 'Gustavo',
        'miguel': 'Miguel',
        'luiz': 'Luiz'
    };
    return map[firstName.toLowerCase()] || firstName;
}

function userCanToggleEmissao() {
    if (!currentUser) return false;
    // Verificar por cargo/role
    const role = (currentUser.role || currentUser.cargo || currentUser.setor || '').toLowerCase();
    if (ROLES_CHECKBOX.some(r => role.includes(r))) return true;
    // Verificar por nome (fallback garantido)
    const name = (currentUser.name || currentUser.nome || currentUser.username || '').toLowerCase();
    if (NAMES_CHECKBOX.some(n => name.includes(n))) return true;
    console.log('🔒 Usuário sem permissão para emissão:', JSON.stringify(currentUser));
    return false;
}
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

function formatarData(data) {
    if (!data) return '';
    const d = new Date(data);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
}

function getDataAtual() {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    return `${dia}/${mes}/${ano}`;
}

// ============================================
// INICIALIZAÇÃO E AUTENTICAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

async function verificarAutenticacao() {
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

    // Verificar sessão e capturar dados do usuário (cargo/role)
    try {
        const verifyRes = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });
        if (verifyRes.ok) {
            const sessionData = await verifyRes.json();
            if (sessionData.valid && sessionData.session) {
                currentUser = sessionData.session;
                sessionStorage.setItem('pedidosUserData', JSON.stringify(currentUser));
            } else {
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }
        }
    } catch(e) {
        // Fallback: tentar do cache local
        try {
            const userData = sessionStorage.getItem('pedidosUserData');
            if (userData) currentUser = JSON.parse(userData);
        } catch(e2) {}
    }
    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: var(--bg-primary);
            color: var(--text-primary);
            text-align: center;
            padding: 2rem;
        ">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">
                ${mensagem}
            </h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">
                Somente usuários autenticados podem acessar esta área.
            </p>
            <a href="${PORTAL_URL}" style="
                display: inline-block;
                background: var(--btn-register);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                text-transform: uppercase;
            ">IR PARA O PORTAL</a>
        </div>
    `;
}

function inicializarApp() {
    updateMonthDisplay();
    loadPedidosDirectly();
    loadEstoque();
    loadTransportadorasCache();
    loadAllClientesCache();
    // Setup event listeners
    document.addEventListener('input', (e) => {
        const upperIds = ['razaoSocial','inscricaoEstadual','endereco','telefone','contato','documento','localEntrega','setor','valorFrete'];
        if (upperIds.includes(e.target.id) ||
            (e.target.id && (e.target.id.startsWith('especificacao-') || e.target.id.startsWith('codigoEstoque-') || e.target.id.startsWith('ncm-')))) {
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            e.target.value = e.target.value.toUpperCase();
            try { e.target.setSelectionRange(start, end); } catch(e) {}
        }
        if (e.target.id === 'cnpj') {
            e.target.value = formatarCNPJ(e.target.value);
        }
    });
    setInterval(() => { if (isOnline) loadPedidosDirectly(); }, 30000);
}

// ============================================
// CONEXÃO COM A API
// ============================================
function updateConnectionStatus() {
    const status = document.getElementById('connectionStatus');
    if (status) {
        status.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

async function syncData() {
    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.classList.add('syncing');
        btnSync.disabled = true;
    }
    try {
        await loadPedidosDirectly();
        await loadEstoque();
        await loadTransportadorasCache();
        showMessage('Dados sincronizados', 'success');
    } catch (error) {
        showMessage('Erro ao sincronizar', 'error');
    } finally {
        if (btnSync) {
            btnSync.classList.remove('syncing');
            btnSync.disabled = false;
        }
    }
}

// ============================================
// CARREGAR PEDIDOS - AbortController pattern (como Cotações de Frete)
// ============================================
async function loadPedidosDirectly() {
    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;
    const mesFetch = currentMonth.getMonth();
    const anoFetch = currentMonth.getFullYear();
    try {
        const response = await fetch(`${API_URL}/pedidos?mes=${mesFetch}&ano=${anoFetch}`, {
            headers: { 'X-Session-Token': sessionToken },
            cache: 'no-cache',
            signal
        });
        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
            return;
        }
        if (!response.ok) {
            isOnline = false;
            updateConnectionStatus();
            setTimeout(() => loadPedidosDirectly(), 5000);
            return;
        }
        const data = await response.json();
        if (mesFetch !== currentMonth.getMonth() || anoFetch !== currentMonth.getFullYear()) return;
        pedidos = data;
        atualizarCacheClientes(pedidos);
        isOnline = true;
        updateConnectionStatus();
        lastDataHash = JSON.stringify(pedidos.map(p => p.id));
        currentFetchController = null;
        updateDisplay();
    } catch (error) {
        if (error.name === 'AbortError') return;
        isOnline = false;
        updateConnectionStatus();
        setTimeout(() => loadPedidosDirectly(), 5000);
    }
}

// Alias para compatibilidade interna
async function loadPedidos() {
    return loadPedidosDirectly();
}

// ============================================
// TRANSPORTADORAS — busca da app Transportadoras
// ============================================
async function loadTransportadorasCache() {
    try {
        const TRANSP_API = 'https://transportadoras.onrender.com/api';
        const headers = { 'Accept': 'application/json', 'X-Session-Token': sessionToken };
        const response = await fetch(`${TRANSP_API}/transportadoras?page=1&limit=200`, { headers, mode: 'cors' });
        if (!response.ok) return;
        const result = await response.json();
        const lista = Array.isArray(result) ? result : (result.data || []);
        transportadorasCache = lista.map(t => t.nome.trim().toUpperCase()).filter(Boolean).sort();
        console.log(`🚚 ${transportadorasCache.length} transportadoras carregadas`);
        updateTransportadoraSelects();
    } catch (e) {
        console.error('Erro ao carregar transportadoras:', e);
    }
}

function updateTransportadoraSelects() {
    // Atualiza o select no modal de formulário
    const sel = document.getElementById('transportadora');
    if (sel) {
        const current = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>' +
            transportadorasCache.map(n => `<option value="${n}">${n}</option>`).join('');
        if (current) sel.value = current;
    }
}

// ============================================
// CARREGAR ESTOQUE
// ============================================
async function loadEstoque() {
    try {
        const response = await fetch(`${API_URL}/estoque`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
            return;
        }

        if (response.ok) {
            const items = await response.json();
            estoqueCache = {};
            items.forEach(item => {
                estoqueCache[item.codigo.toString()] = item;
            });
            console.log(`📦 ${items.length} itens carregados do estoque`);
        }
    } catch (error) {
        console.error('Erro ao carregar estoque:', error);
    }
}

// ============================================
// CACHE DE CLIENTES — global, nunca zerado, sempre o mais recente por CNPJ
// ============================================
function atualizarCacheClientes(lista) {
    lista.forEach(pedido => {
        const cnpj = pedido.cnpj?.trim();
        if (!cnpj) return;
        const existing = clientesCache[cnpj];
        const existingDate = existing ? new Date(existing._created_at || 0) : new Date(0);
        const newDate = new Date(pedido.created_at || 0);
        if (!existing || newDate >= existingDate) {
            clientesCache[cnpj] = {
                razaoSocial: pedido.razao_social,
                inscricaoEstadual: pedido.inscricao_estadual,
                endereco: pedido.endereco,
                telefone: pedido.telefone,
                contato: pedido.contato,
                email: pedido.email || '',
                documento: pedido.documento,
                localEntrega: pedido.local_entrega,
                setor: pedido.setor,
                transportadora: pedido.transportadora,
                valorFrete: pedido.valor_frete,
                vendedor: pedido.vendedor,
                peso: pedido.peso,
                quantidade: pedido.quantidade,
                volumes: pedido.volumes,
                previsaoEntrega: pedido.previsao_entrega,
                items: Array.isArray(pedido.items) ? pedido.items : [],
                _created_at: pedido.created_at
            };
        }
    });
    console.log(`👥 ${Object.keys(clientesCache).length} clientes em cache global`);
}

// Carrega TODOS os pedidos do banco apenas para popular o cache de CNPJ
async function loadAllClientesCache() {
    try {
        const response = await fetch(`${API_URL}/pedidos`, {
            headers: { 'X-Session-Token': sessionToken },
            cache: 'no-cache'
        });
        if (!response.ok) return;
        const todos = await response.json();
        atualizarCacheClientes(todos);
        console.log(`📋 Cache global de clientes: ${Object.keys(clientesCache).length} CNPJs`);
    } catch (e) {
        console.error('Erro ao carregar cache global de clientes:', e);
    }
}

function buscarClientePorCNPJ(cnpj) {
    cnpj = cnpj.replace(/\D/g, '');
    
    const suggestionsDiv = document.getElementById('cnpjSuggestions');
    if (!suggestionsDiv) return;
    
    if (cnpj.length < 3) {
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.style.display = 'none';
        return;
    }
    
    const matches = Object.keys(clientesCache).filter(key => 
        key.replace(/\D/g, '').includes(cnpj)
    );
    
    if (matches.length === 0) {
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.style.display = 'none';
        return;
    }
    
    suggestionsDiv.innerHTML = '';
    matches.forEach(cnpjKey => {
        const cliente = clientesCache[cnpjKey];
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.innerHTML = `<strong>${formatarCNPJ(cnpjKey)}</strong><br>${cliente.razaoSocial}`;
        div.onclick = () => preencherDadosClienteCompleto(cnpjKey);
        suggestionsDiv.appendChild(div);
    });
    
    suggestionsDiv.style.display = 'block';
}

function preencherDadosClienteCompleto(cnpj) {
    // Usa sempre o cache global (dados mais recentes de qualquer mês)
    const cliente = clientesCache[cnpj];
    if (!cliente) {
        document.getElementById('cnpjSuggestions').style.display = 'none';
        return;
    }
    document.getElementById('cnpj').value = formatarCNPJ(cnpj);
    document.getElementById('razaoSocial').value = cliente.razaoSocial || '';
    document.getElementById('inscricaoEstadual').value = cliente.inscricaoEstadual || '';
    document.getElementById('endereco').value = cliente.endereco || '';
    document.getElementById('telefone').value = cliente.telefone || '';
    document.getElementById('contato').value = cliente.contato || '';
    document.getElementById('email').value = cliente.email || '';
    document.getElementById('documento').value = cliente.documento || '';
    if (cliente.peso) document.getElementById('peso').value = cliente.peso;
    if (cliente.quantidade) document.getElementById('quantidade').value = cliente.quantidade;
    if (cliente.volumes) document.getElementById('volumes').value = cliente.volumes;
    document.getElementById('localEntrega').value = cliente.localEntrega || '';
    document.getElementById('setor').value = cliente.setor || '';
    if (cliente.previsaoEntrega) document.getElementById('previsaoEntrega').value = cliente.previsaoEntrega;
    // Transportadora: preenche só se estiver no cache atual (não força valor antigo)
    const tSel = document.getElementById('transportadora');
    if (tSel && cliente.transportadora) {
        // Verificar se o valor existe nas opções atuais
        const opts = Array.from(tSel.options).map(o => o.value);
        if (opts.includes(cliente.transportadora)) tSel.value = cliente.transportadora;
    }
    document.getElementById('valorFrete').value = cliente.valorFrete || '';
    const vendedorSelect = document.getElementById('vendedor');
    if (vendedorSelect && cliente.vendedor) vendedorSelect.value = cliente.vendedor;
    // Restaurar itens do último pedido
    if (cliente.items && Array.isArray(cliente.items) && cliente.items.length > 0) {
        document.getElementById('itemsContainer').innerHTML = '';
        itemCounter = 0;
        cliente.items.forEach((item, index) => {
            itemCounter++;
            const container = document.getElementById('itemsContainer');
            const tr = document.createElement('tr');
            tr.id = `item-${itemCounter}`;
            tr.innerHTML = `
                <td><input type="text" value="${index + 1}" readonly style="text-align: center; width: 50px;"></td>
                <td>
                    <input type="text" 
                           id="codigoEstoque-${itemCounter}" 
                           value="${item.codigoEstoque || ''}"
                           class="codigo-estoque"
                           onblur="verificarEstoque(${itemCounter}); checkStockReferences()"
                           onchange="buscarDadosEstoque(${itemCounter})">
                </td>
                <td><textarea id="especificacao-${itemCounter}" rows="2">${item.especificacao || ''}</textarea></td>
                <td>
                    <select id="unidade-${itemCounter}">
                        <option value="">-</option>
                        <option value="UN" ${item.unidade === 'UN' ? 'selected' : ''}>UN</option>
                        <option value="MT" ${item.unidade === 'MT' ? 'selected' : ''}>MT</option>
                        <option value="KG" ${item.unidade === 'KG' ? 'selected' : ''}>KG</option>
                        <option value="PC" ${item.unidade === 'PC' ? 'selected' : ''}>PC</option>
                        <option value="CX" ${item.unidade === 'CX' ? 'selected' : ''}>CX</option>
                        <option value="LT" ${item.unidade === 'LT' ? 'selected' : ''}>LT</option>
                    </select>
                </td>
                <td>
                    <input type="number" 
                           id="quantidade-${itemCounter}" 
                           value="${item.quantidade || ''}"
                           min="0" step="1"
                           onchange="calcularValorItem(${itemCounter}); verificarEstoque(${itemCounter})">
                </td>
                <td>
                    <input type="number" 
                           id="valorUnitario-${itemCounter}" 
                           value="${item.valorUnitario || ''}"
                           min="0" step="0.01" placeholder="0.00"
                           onchange="calcularValorItem(${itemCounter})">
                </td>
                <td><input type="text" id="valorTotal-${itemCounter}" value="${item.valorTotal || ''}" readonly></td>
                <td><input type="text" id="ncm-${itemCounter}" value="${item.ncm || ''}"></td>
                <td>
                    <button type="button" onclick="removeItem(${itemCounter}); checkStockReferences()" class="danger small" style="padding: 6px 10px;">
                        ✕
                    </button>
                </td>
            `;
            container.appendChild(tr);
        });
        calcularTotais();
        checkStockReferences();
    }
    document.getElementById('cnpjSuggestions').style.display = 'none';
    showMessage('Dados do último pedido preenchidos automaticamente!', 'success');
}

function preencherDadosCliente(cnpj) {
    const cliente = clientesCache[cnpj];
    if (!cliente) return;
    
    document.getElementById('cnpj').value = formatarCNPJ(cnpj);
    document.getElementById('razaoSocial').value = cliente.razaoSocial;
    document.getElementById('inscricaoEstadual').value = cliente.inscricaoEstadual || '';
    document.getElementById('endereco').value = cliente.endereco;
    document.getElementById('telefone').value = cliente.telefone || '';
    document.getElementById('contato').value = cliente.contato || '';
    document.getElementById('email').value = cliente.email || '';
    document.getElementById('documento').value = cliente.documento || '';
    
    if (cliente.peso) {
        document.getElementById('peso').value = cliente.peso;
    }
    if (cliente.quantidade) {
        document.getElementById('quantidade').value = cliente.quantidade;
    }
    if (cliente.volumes) {
        document.getElementById('volumes').value = cliente.volumes;
    }
    
    document.getElementById('localEntrega').value = cliente.localEntrega || '';
    document.getElementById('setor').value = cliente.setor || '';
    if (cliente.previsaoEntrega) {
        document.getElementById('previsaoEntrega').value = cliente.previsaoEntrega;
    }
    
    document.getElementById('transportadora').value = cliente.transportadora || '';
    document.getElementById('valorFrete').value = cliente.valorFrete || '';
    
    const vendedorSelect = document.getElementById('vendedor');
    if (vendedorSelect && cliente.vendedor) {
        vendedorSelect.value = cliente.vendedor;
    }
    
    document.getElementById('cnpjSuggestions').style.display = 'none';
    showMessage('Dados do cliente preenchidos automaticamente!', 'success');
}

// ============================================
// NAVEGAÇÃO DE MESES
// ============================================
function changeMonth(direction) {
    if (currentFetchController) currentFetchController.abort();
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    pedidos = [];
    lastDataHash = '';
    updateMonthDisplay();
    updateTable();
    loadPedidosDirectly();
}

function updateMonthDisplay() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = months[currentMonth.getMonth()];
    const year = currentMonth.getFullYear();
    const element = document.getElementById('currentMonth');
    if (element) {
        element.textContent = `${monthName} ${year}`;
    }
}

function getPedidosForCurrentMonth() {
    return pedidos; // já filtrados pelo servidor
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

// ============================================
// ATUALIZAR DISPLAY
// ============================================
function updateDisplay() {
    updateMonthDisplay();
    updateDashboard();
    updateTable();
    updateVendedoresFilter();
}

// ============================================
// ATUALIZAR DASHBOARD (POR MÊS)
// ============================================
function updateDashboard() {
    const monthPedidos = getPedidosForCurrentMonth();
    const totalEmitidos = monthPedidos.filter(p => p.status === 'emitida').length;
    const totalPendentes = monthPedidos.filter(p => p.status === 'pendente').length;
    
    const ultimoCodigo = monthPedidos.length;
    
    const valorTotalMes = monthPedidos
        .filter(p => p.status === 'emitida')
        .reduce((acc, p) => {
            const valor = parseMoeda(p.valor_total);
            return acc + valor;
        }, 0);
    
    document.getElementById('totalPedidos').textContent = ultimoCodigo;
    document.getElementById('totalEmitidos').textContent = totalEmitidos;
    document.getElementById('totalPendentes').textContent = totalPendentes;
    document.getElementById('valorTotal').textContent = formatarMoeda(valorTotalMes);
}
function updateVendedoresFilter() {
    const vendedores = new Set();
    pedidos.forEach(p => {
        if (p.responsavel?.trim()) {
            vendedores.add(p.responsavel.trim());
        } else if (p.vendedor?.trim()) {
            vendedores.add(p.vendedor.trim());
        }
    });

    const select = document.getElementById('filterVendedor');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Responsável</option>';
        Array.from(vendedores).sort().forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.textContent = v;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

// ============================================
// FILTRAR PEDIDOS
// ============================================
function filterPedidos() {
    updateTable();
}

// ============================================
// ATUALIZAR TABELA
// ============================================
function updateTable() {
    const container = document.getElementById('pedidosContainer');
    let filtered = getPedidosForCurrentMonth();
    
    const search = document.getElementById('search').value.toLowerCase();
    const filterVendedor = document.getElementById('filterVendedor').value;
    const filterStatus = document.getElementById('filterStatus').value;
    
    if (search) {
        filtered = filtered.filter(p => 
            p.codigo?.toString().includes(search) ||
            (p.cnpj || '').toLowerCase().includes(search) ||
            (p.razao_social || '').toLowerCase().includes(search)
        );
    }
    
    if (filterVendedor) {
        filtered = filtered.filter(p => 
            (p.responsavel || '') === filterVendedor || 
            (p.vendedor || '') === filterVendedor
        );
    }
    
    if (filterStatus) {
        filtered = filtered.filter(p => p.status === filterStatus);
    }
    
    if (filtered.length === 0) {
        if (currentFetchController) return; // fetch em andamento — não mostrar vazio ainda
        container.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Nenhum registro encontrado</td></tr>';
        return;
    }
    
    // Ordenar por código (crescente)
    filtered.sort((a, b) => {
        const numA = parseInt(a.codigo);
        const numB = parseInt(b.codigo);
        return numA - numB;
    });
    
    const canToggle = userCanToggleEmissao();

    container.innerHTML = filtered.map(pedido => {
        const emitida = pedido.status === 'emitida';
        const dataEmissao = pedido.data_emissao
            ? new Date(pedido.data_emissao).toLocaleDateString('pt-BR')
            : '-';

        const checkboxCell = canToggle
            ? `<td style="text-align: center;">
                <div class="checkbox-wrapper">
                    <input type="checkbox"
                           class="styled-checkbox"
                           id="check-${pedido.id}"
                           ${emitida ? 'checked' : ''}
                           onchange="toggleEmissao('${pedido.id}', this.checked)">
                    <label for="check-${pedido.id}" class="checkbox-label-styled"></label>
                </div>
               </td>`
            : `<td style="text-align: center;">
                ${emitida
                    ? '<div style="width:40px;height:40px;border-radius:8px;background:rgba(34,197,94,0.15);border:2px solid #22C55E;display:inline-flex;align-items:center;justify-content:center;color:#22C55E;font-weight:700;">✓</div>'
                    : ''
                }
               </td>`;

        return `
        <tr class="${emitida ? 'row-fechada' : ''}">
            ${checkboxCell}
            <td><strong>${pedido.codigo}</strong></td>
            <td>${pedido.razao_social}</td>
            <td>${formatarCNPJ(pedido.cnpj)}</td>
            <td>${dataEmissao}</td>
            <td><strong>${pedido.valor_total || 'R$ 0,00'}</strong></td>
            <td>
                <span class="badge ${emitida ? 'fechada' : 'aberta'}">
                    ${emitida ? 'EMITIDO' : 'PENDENTE'}
                </span>
            </td>
            <td>
                <div class="actions">
                    <button onclick="viewPedido('${pedido.id}')" class="action-btn" style="background: #ff521d;">Ver</button>
                    <button onclick="editPedido('${pedido.id}')" class="action-btn" style="background: #6B7280;">Editar</button>
                    <button onclick="gerarEtiqueta('${pedido.id}')" class="action-btn" style="background: #22C55E;">Etiqueta</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ============================================
// MODAL DE FORMULÁRIO
// ============================================
function openFormModal() {
    editingId = null;
    currentTabIndex = 0;
    document.getElementById('formTitle').textContent = 'Novo Pedido de Faturamento';
    resetForm();
    
    const maxCodigo = pedidos.length > 0 ? Math.max(...pedidos.map(p => parseInt(p.codigo) || 0)) : 0;
    document.getElementById('codigo').value = (maxCodigo + 1).toString();
    
    // Set data atual
    document.getElementById('dataRegistro').value = getDataAtual();
    
    // Auto-detectar responsável pelo usuário logado
    const responsavelAuto = detectResponsavelFromUser();
    const responsavelSelect = document.getElementById('responsavel');
    if (responsavelSelect && responsavelAuto) {
        responsavelSelect.value = responsavelAuto;
        responsavelSelect.disabled = true;
    }
    
    activateTab(0);
    document.getElementById('formModal').classList.add('show');
    // Atualiza selects dinâmicos ao abrir modal
    updateTransportadoraSelects();
}

function closeFormModal() {
    const isEditing = editingId !== null;
    document.getElementById('formModal').classList.remove('show');
    resetForm();
    
    if (isEditing) {
        showMessage('Atualização cancelada', 'error');
    } else {
        showMessage('Pedido cancelado', 'error');
    }
}

function resetForm() {
    document.querySelectorAll('#formModal input:not([type="checkbox"]), #formModal textarea, #formModal select').forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = false;
        } else if (input.id !== 'codigo' && input.id !== 'dataRegistro') {
            input.value = '';
        }
    });
    
    // responsavel é sempre definido pelo usuário logado — não reabilitar manualmente
    
    document.getElementById('itemsContainer').innerHTML = '';
    itemCounter = 0;
    addItem();
    hideStockWarning();
}

// ============================================
// NAVEGAÇÃO ENTRE ABAS
// ============================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
    
    currentTabIndex = tabs.indexOf(tabId);
    updateNavigationButtons();
}

function nextTab() {
    if (currentTabIndex < tabs.length - 1) {
        currentTabIndex++;
        activateTab(currentTabIndex);
    }
}

function previousTab() {
    if (currentTabIndex > 0) {
        currentTabIndex--;
        activateTab(currentTabIndex);
    }
}

function activateTab(index) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabId = tabs[index];
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.tab-btn')[index].classList.add('active');
    
    updateNavigationButtons();
}

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    
    btnPrevious.style.display = currentTabIndex === 0 ? 'none' : 'inline-block';
    btnNext.style.display = currentTabIndex === tabs.length - 1 ? 'none' : 'inline-block';
    btnSave.style.display = currentTabIndex === tabs.length - 1 ? 'inline-block' : 'none';
}

// ============================================
// GERENCIAMENTO DE ITENS
// ============================================
function addItem() {
    itemCounter++;
    const container = document.getElementById('itemsContainer');
    const tr = document.createElement('tr');
    tr.id = `item-${itemCounter}`;
    tr.innerHTML = `
        <td><input type="text" value="${itemCounter}" readonly style="text-align: center; width: 50px;"></td>
        <td>
            <input type="text" 
                   id="codigoEstoque-${itemCounter}" 
                   class="codigo-estoque"
                   placeholder="CÓDIGO"
                   onblur="verificarEstoque(${itemCounter}); checkStockReferences()"
                   onchange="buscarDadosEstoque(${itemCounter})">
        </td>
        <td><textarea id="especificacao-${itemCounter}" rows="2"></textarea></td>
        <td>
            <select id="unidade-${itemCounter}">
                <option value="">-</option>
                <option value="UN">UN</option>
                <option value="MT">MT</option>
                <option value="KG">KG</option>
                <option value="PC">PC</option>
                <option value="CX">CX</option>
                <option value="LT">LT</option>
            </select>
        </td>
        <td>
            <input type="number" 
                   id="quantidade-${itemCounter}" 
                   min="0" 
                   step="1"
                   onchange="calcularValorItem(${itemCounter}); verificarEstoque(${itemCounter})">
        </td>
        <td>
            <input type="number" 
                   id="valorUnitario-${itemCounter}" 
                   min="0" 
                   step="0.01"
                   placeholder="0.00"
                   onchange="calcularValorItem(${itemCounter})">
        </td>
        <td><input type="text" id="valorTotal-${itemCounter}" readonly></td>
        <td><input type="text" id="ncm-${itemCounter}"></td>
        <td>
            <button type="button" onclick="removeItem(${itemCounter}); checkStockReferences()" class="danger small" style="padding: 6px 10px;">
                ✕
            </button>
        </td>
    `;
    container.appendChild(tr);
}

function removeItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (item) {
        item.remove();
        calcularTotais();
    }
}

function calcularValorItem(id) {
    const quantidade = parseFloat(document.getElementById(`quantidade-${id}`).value) || 0;
    const valorUnitario = parseFloat(document.getElementById(`valorUnitario-${id}`).value) || 0;
    const valorTotal = quantidade * valorUnitario;
    
    document.getElementById(`valorTotal-${id}`).value = formatarMoeda(valorTotal);
    calcularTotais();
}

function calcularTotais() {
    let valorTotal = 0;
    
    document.querySelectorAll('[id^="item-"]').forEach(item => {
        const id = item.id.replace('item-', '');
        const valor = parseMoeda(document.getElementById(`valorTotal-${id}`).value);
        
        valorTotal += valor;
    });
    
    document.getElementById('valorTotalPedido').value = formatarMoeda(valorTotal);
}

function buscarDadosEstoque(itemId) {
    const codigoInput = document.getElementById(`codigoEstoque-${itemId}`);
    const especificacaoInput = document.getElementById(`especificacao-${itemId}`);
    const ncmInput = document.getElementById(`ncm-${itemId}`);
    
    if (!codigoInput || !especificacaoInput || !ncmInput) return;
    
    const codigo = codigoInput.value.trim();
    
    if (!codigo) return;
    
    const itemEstoque = estoqueCache[codigo];
    
    if (itemEstoque) {
        especificacaoInput.value = itemEstoque.descricao;
        ncmInput.value = itemEstoque.ncm;
    } else {
        showMessage('O item não foi encontrado', 'error');
    }
}

function verificarEstoque(itemId) {
    const codigoInput = document.getElementById(`codigoEstoque-${itemId}`);
    const quantidadeInput = document.getElementById(`quantidade-${itemId}`);
    
    if (!codigoInput || !quantidadeInput) return;
    
    const codigo = codigoInput.value.trim();
    const quantidadeSolicitada = parseFloat(quantidadeInput.value) || 0;
    
    if (!codigo || quantidadeSolicitada === 0) {
        return;
    }
    
    const itemEstoque = estoqueCache[codigo];
    
    if (!itemEstoque) {
        return;
    }
    
    const quantidadeDisponivel = parseFloat(itemEstoque.quantidade) || 0;
    
    if (quantidadeSolicitada > quantidadeDisponivel) {
        showMessage(`Esta quantidade não corresponde ao estoque do item ${codigo}`, 'error');
    }
}

function checkStockReferences() {
    let allItemsHaveStockCode = true;
    let hasItems = false;
    
    document.querySelectorAll('[id^="item-"]').forEach(item => {
        const id = item.id.replace('item-', '');
        const codigoInput = document.getElementById(`codigoEstoque-${id}`);
        const unidadeSelect = document.getElementById(`unidade-${id}`);
        const quantidadeInput = document.getElementById(`quantidade-${id}`);
        
        if (unidadeSelect?.value && quantidadeInput?.value && parseFloat(quantidadeInput.value) > 0) {
            hasItems = true;
            if (!codigoInput?.value.trim()) {
                allItemsHaveStockCode = false;
            }
        }
    });
    
    if (hasItems && !allItemsHaveStockCode) {
        showStockWarning();
    } else {
        hideStockWarning();
    }
    
    return allItemsHaveStockCode || !hasItems;
}

function showStockWarning() {
    const warning = document.getElementById('stockWarning');
    if (warning) {
        warning.classList.remove('hidden');
    }
}

function hideStockWarning() {
    const warning = document.getElementById('stockWarning');
    if (warning) {
        warning.classList.add('hidden');
    }
}

function getItems() {
    const items = [];
    document.querySelectorAll('[id^="item-"]').forEach(item => {
        const id = item.id.replace('item-', '');
        const codigoEstoque = document.getElementById(`codigoEstoque-${id}`).value.trim();
        const especificacao = document.getElementById(`especificacao-${id}`).value.trim();
        const unidade = document.getElementById(`unidade-${id}`).value;
        const quantidade = parseFloat(document.getElementById(`quantidade-${id}`).value) || 0;
        const valorUnitario = parseFloat(document.getElementById(`valorUnitario-${id}`).value) || 0;
        const valorTotal = document.getElementById(`valorTotal-${id}`).value;
        const ncm = document.getElementById(`ncm-${id}`).value.trim();
        
        if (codigoEstoque && unidade && quantidade > 0) {
            items.push({
                item: items.length + 1,
                codigoEstoque,
                especificacao,
                unidade,
                quantidade,
                valorUnitario,
                valorTotal,
                ncm
            });
        }
    });
    return items;
}

// ============================================
// SALVAR PEDIDO
// ============================================
async function savePedido() {
    // Validação do responsável
    const responsavel = document.getElementById('responsavel').value.trim();
    if (!responsavel && !editingId) {
        showMessage('Por favor, selecione um responsável!', 'error');
        activateTab(0); // Volta para a aba Geral
        return;
    }
    
    const codigo = document.getElementById('codigo').value.trim();
    const cnpj = document.getElementById('cnpj').value.replace(/\D/g, '');
    const razaoSocial = document.getElementById('razaoSocial').value.trim();
    const endereco = document.getElementById('endereco').value.trim();
    const vendedor = document.getElementById('vendedor').value.trim();
    const items = getItems();
    
    // Validação de CNPJ para salvar
    if (!cnpj || !razaoSocial || !endereco) {
        showMessage('CNPJ, Razão Social e Endereço são obrigatórios!', 'error');
        return;
    }
    
    const pedido = {
        codigo,
        cnpj,
        razao_social: razaoSocial,
        inscricao_estadual: document.getElementById('inscricaoEstadual').value.trim(),
        endereco,
        bairro: document.getElementById('bairro')?.value.trim() || '',
        municipio: document.getElementById('municipio')?.value.trim() || '',
        uf: document.getElementById('uf')?.value.trim() || '',
        numero: document.getElementById('numero')?.value.trim() || '',
        telefone: document.getElementById('telefone').value.trim(),
        contato: document.getElementById('contato').value.trim(),
        email: document.getElementById('email').value.trim().toLowerCase(),
        documento: document.getElementById('documento').value.trim(),
        items,
        valor_total: document.getElementById('valorTotalPedido').value,
        peso: document.getElementById('peso').value,
        quantidade: document.getElementById('quantidade').value,
        volumes: document.getElementById('volumes').value,
        local_entrega: document.getElementById('localEntrega').value.trim(),
        setor: document.getElementById('setor').value.trim(),
        previsao_entrega: document.getElementById('previsaoEntrega').value || null,
        transportadora: document.getElementById('transportadora').value.trim(),
        valor_frete: document.getElementById('valorFrete').value,
        vendedor,
        responsavel: editingId ? undefined : responsavel, // Somente adiciona responsável em novos pedidos
        status: 'pendente'
    };
    
    // Só adiciona data_registro em novos pedidos
    if (!editingId) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        pedido.data_registro = hoje.toISOString();
    }
    
    try {
        const url = editingId ? `${API_URL}/pedidos/${editingId}` : `${API_URL}/pedidos`;
        const method = editingId ? 'PATCH' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify(pedido)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro do servidor:', errorText);
            throw new Error('Erro ao salvar pedido');
        }
        
        await loadPedidos();
        closeFormModal();
        
        if (editingId) {
            showMessage(`Pedido ${codigo} atualizado`, 'success');
        } else {
            showMessage(`Pedido ${codigo} registrado`, 'success');
        }
    } catch (error) {
        console.error('Erro ao salvar:', error);
        showMessage('Erro ao salvar pedido!', 'error');
    }
}

// ============================================
// EDITAR PEDIDO
// ============================================
async function editPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    editingId = id;
    currentTabIndex = 0;
    document.getElementById('formTitle').textContent = `Editar Pedido Nº ${pedido.codigo}`;
    updateTransportadoraSelects();
    
    document.getElementById('codigo').value = pedido.codigo;
    document.getElementById('documento').value = pedido.documento || '';
    
    // Preencher responsável (somente visualização, não editável)
    if (pedido.responsavel) {
        const responsavelSelect = document.getElementById('responsavel');
        responsavelSelect.value = pedido.responsavel;
        responsavelSelect.disabled = true; // Desabilita edição
    }
    
    // Preencher data de registro
    if (pedido.data_registro) {
        document.getElementById('dataRegistro').value = formatarData(pedido.data_registro);
    }
    
    document.getElementById('cnpj').value = formatarCNPJ(pedido.cnpj);
    document.getElementById('razaoSocial').value = pedido.razao_social;
    document.getElementById('inscricaoEstadual').value = pedido.inscricao_estadual || '';
    document.getElementById('endereco').value = pedido.endereco;
    document.getElementById('telefone').value = pedido.telefone || '';
    document.getElementById('contato').value = pedido.contato || '';
    document.getElementById('email').value = pedido.email || '';
    document.getElementById('valorTotalPedido').value = pedido.valor_total;
    document.getElementById('peso').value = pedido.peso || '';
    document.getElementById('quantidade').value = pedido.quantidade || '';
    document.getElementById('volumes').value = pedido.volumes || '';
    document.getElementById('localEntrega').value = pedido.local_entrega || '';
    document.getElementById('setor').value = pedido.setor || '';
    document.getElementById('previsaoEntrega').value = pedido.previsao_entrega || '';
    document.getElementById('transportadora').value = pedido.transportadora || '';
    document.getElementById('valorFrete').value = pedido.valor_frete || '';
    
    const vendedorSelect = document.getElementById('vendedor');
    if (vendedorSelect && pedido.vendedor) {
        vendedorSelect.value = pedido.vendedor;
    }
    
    document.getElementById('itemsContainer').innerHTML = '';
    itemCounter = 0;
    
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    if (items.length === 0) {
        addItem();
    } else {
        items.forEach((item, index) => {
            itemCounter++;
            const container = document.getElementById('itemsContainer');
            const tr = document.createElement('tr');
            tr.id = `item-${itemCounter}`;
            tr.innerHTML = `
                <td><input type="text" value="${index + 1}" readonly style="text-align: center; width: 50px;"></td>
                <td>
                    <input type="text" 
                           id="codigoEstoque-${itemCounter}" 
                           value="${item.codigoEstoque || ''}"
                           class="codigo-estoque"
                           onblur="verificarEstoque(${itemCounter}); checkStockReferences()"
                           onchange="buscarDadosEstoque(${itemCounter})">
                </td>
                <td><textarea id="especificacao-${itemCounter}" rows="2">${item.especificacao || ''}</textarea></td>
                <td>
                    <select id="unidade-${itemCounter}">
                        <option value="">-</option>
                        <option value="UN" ${item.unidade === 'UN' ? 'selected' : ''}>UN</option>
                        <option value="MT" ${item.unidade === 'MT' ? 'selected' : ''}>MT</option>
                        <option value="KG" ${item.unidade === 'KG' ? 'selected' : ''}>KG</option>
                        <option value="PC" ${item.unidade === 'PC' ? 'selected' : ''}>PC</option>
                        <option value="CX" ${item.unidade === 'CX' ? 'selected' : ''}>CX</option>
                        <option value="LT" ${item.unidade === 'LT' ? 'selected' : ''}>LT</option>
                    </select>
                </td>
                <td>
                    <input type="number" 
                           id="quantidade-${itemCounter}" 
                           value="${item.quantidade || 0}"
                           min="0" 
                           step="1"
                           onchange="calcularValorItem(${itemCounter}); verificarEstoque(${itemCounter})">
                </td>
                <td>
                    <input type="number" 
                           id="valorUnitario-${itemCounter}" 
                           value="${item.valorUnitario || 0}"
                           min="0" 
                           step="0.01"
                           onchange="calcularValorItem(${itemCounter})">
                </td>
                <td><input type="text" id="valorTotal-${itemCounter}" value="${item.valorTotal || 'R$ 0,00'}" readonly></td>
                <td><input type="text" id="ncm-${itemCounter}" value="${item.ncm || ''}"></td>
                <td>
                    <button type="button" onclick="removeItem(${itemCounter}); checkStockReferences()" class="danger small" style="padding: 6px 10px;">
                        ✕
                    </button>
                </td>
            `;
            container.appendChild(tr);
        });
    }
    
    activateTab(0);
    document.getElementById('formModal').classList.add('show');
    
    checkStockReferences();
}

// ============================================
// VISUALIZAR PEDIDO
// ============================================
function viewPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    document.getElementById('modalCodigo').textContent = pedido.codigo;
    
    // Formatar status badge
    const statusClass = pedido.status === 'emitida' ? 'fechada' : 'aberta';
    const statusText = pedido.status === 'emitida' ? 'FECHADA' : 'ABERTA';
    
    const dataEmissaoFormatada = pedido.data_emissao
        ? new Date(pedido.data_emissao).toLocaleDateString('pt-BR')
        : '-';

    document.getElementById('info-tab-geral').innerHTML = `
        <div class="info-section">
            <h4>Informações Gerais</h4>
            <div class="info-row">
                <span class="info-label">Responsável:</span>
                <span class="info-value">${pedido.responsavel || pedido.vendedor || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Data:</span>
                <span class="info-value">${pedido.data_registro ? formatarData(pedido.data_registro) : '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Data Emissão:</span>
                <span class="info-value">${dataEmissaoFormatada}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="badge ${statusClass}">${statusText}</span>
            </div>
        </div>
    `;
    
    document.getElementById('info-tab-faturamento').innerHTML = `
        <div class="info-section">
            <h4>Dados de Faturamento</h4>
            <div class="info-row">
                <span class="info-label">CNPJ:</span>
                <span class="info-value">${formatarCNPJ(pedido.cnpj)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Razão Social:</span>
                <span class="info-value">${pedido.razao_social}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Inscrição Estadual:</span>
                <span class="info-value">${pedido.inscricao_estadual || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Endereço:</span>
                <span class="info-value">${pedido.endereco}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Telefone:</span>
                <span class="info-value">${pedido.telefone || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Contato:</span>
                <span class="info-value">${pedido.contato || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">E-mail:</span>
                <span class="info-value">${pedido.email || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Documento:</span>
                <span class="info-value">${pedido.documento || '-'}</span>
            </div>
        </div>
    `;
    
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    document.getElementById('info-tab-itens').innerHTML = `
        <div class="info-section">
            <h4>Itens do Pedido</h4>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Cód. Estoque</th>
                        <th>Especificação</th>
                        <th>UN</th>
                        <th>Quantidade</th>
                        <th>Valor Unitário</th>
                        <th>Valor Total</th>
                        <th>NCM</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${item.codigoEstoque || '-'}</td>
                            <td>${item.especificacao || '-'}</td>
                            <td>${item.unidade || '-'}</td>
                            <td>${item.quantidade || 0}</td>
                            <td>${formatarMoeda(item.valorUnitario || 0)}</td>
                            <td>${item.valorTotal || 'R$ 0,00'}</td>
                            <td>${item.ncm || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4>Totais</h4>
            <div class="info-row">
                <span class="info-label">Valor Total:</span>
                <span class="info-value"><strong>${pedido.valor_total || 'R$ 0,00'}</strong></span>
            </div>
            <div class="info-row">
                <span class="info-label">Peso (kg):</span>
                <span class="info-value">${pedido.peso || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Quantidade Total:</span>
                <span class="info-value">${pedido.quantidade || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Volumes:</span>
                <span class="info-value">${pedido.volumes || '-'}</span>
            </div>
        </div>
    `;
    
    document.getElementById('info-tab-entrega').innerHTML = `
        <div class="info-section">
            <h4>Informações de Entrega</h4>
            <div class="info-row">
                <span class="info-label">Local de Entrega:</span>
                <span class="info-value">${pedido.local_entrega || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Setor:</span>
                <span class="info-value">${pedido.setor || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Previsão de Entrega:</span>
                <span class="info-value">${pedido.previsao_entrega ? new Date(pedido.previsao_entrega).toLocaleDateString('pt-BR') : '-'}</span>
            </div>
        </div>
    `;
    
    document.getElementById('info-tab-transporte').innerHTML = `
        <div class="info-section">
            <h4>Informações de Transporte</h4>
            <div class="info-row">
                <span class="info-label">Transportadora:</span>
                <span class="info-value">${pedido.transportadora || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Valor do Frete:</span>
                <span class="info-value">${pedido.valor_frete || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Vendedor:</span>
                <span class="info-value">${pedido.vendedor || '-'}</span>
            </div>
        </div>
    `;
    
    switchInfoTab('info-tab-geral');
    document.getElementById('infoModal').classList.add('show');
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('show');
}

function switchInfoTab(tabId) {
    document.querySelectorAll('#infoModal .tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#infoModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
}

// ============================================
// TOGGLE EMISSÃO (DEBITAR ESTOQUE)
// ============================================
async function toggleEmissao(id, checked) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    if (checked && pedido.status === 'pendente') {
        // Validação 1: Informações básicas
        if (!pedido.cnpj || !pedido.razao_social || !pedido.endereco) {
            showMessage(`Não existem informações suficientes para o pedido ${pedido.codigo}`, 'error');
            document.getElementById(`check-${id}`).checked = false;
            return;
        }
        
        const items = Array.isArray(pedido.items) ? pedido.items : [];
        
        // Verificar se algum item não tem código de estoque
        let hasItemWithoutStockCode = items.length === 0 || items.some(item => !item.codigoEstoque || item.codigoEstoque.trim() === '');

        if (hasItemWithoutStockCode) {
            // Mostrar modal de confirmação de emissão sem estoque
            document.getElementById(`check-${id}`).checked = false;
            confirmarEmissaoSemEstoque(id);
            return;
        }

        // Verificar se códigos existem no estoque e se há quantidade suficiente
        let estoqueInsuficiente = false;
        for (const item of items) {
            const itemEstoque = estoqueCache[item.codigoEstoque];
            if (!itemEstoque) {
                showMessage(`Código ${item.codigoEstoque} não encontrado no estoque`, 'error');
                document.getElementById(`check-${id}`).checked = false;
                return;
            }
            const quantidadeDisponivel = parseFloat(itemEstoque.quantidade) || 0;
            if (item.quantidade > quantidadeDisponivel) {
                showMessage(`A quantidade em estoque para o item ${item.codigoEstoque} é insuficiente para atender o pedido`, 'error');
                estoqueInsuficiente = true;
            }
        }
        if (estoqueInsuficiente) {
            document.getElementById(`check-${id}`).checked = false;
            return;
        }

        // Confirmação padrão
        showConfirmarEmissaoModal(id);
        return;
        
        // Emissão com estoque confirmada via modal
        showConfirmarEmissaoModal(id);
        return;
    } else if (!checked && pedido.status === 'emitida') {
        document.getElementById(`check-${id}`).checked = true;
        showReverterEmissaoModal(id);
        return;
        
    }
}

// ============================================
// MODAIS DE CONFIRMAÇÃO DE EMISSÃO
// ============================================
function showReverterEmissaoModal(id) {
    const existing = document.getElementById('modalReverterEmissao');
    if (existing) existing.remove();
    const pedido = pedidos.find(p => p.id === id);
    const modal = document.createElement('div');
    modal.id = 'modalReverterEmissao';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content modal-delete" style="max-width:440px;">
            <button class="close-modal" onclick="fecharModalReverterEmissao()">✕</button>
            <div class="modal-message-delete" style="margin-top:1rem;margin-bottom:1.5rem;">
                Reverter emissão do pedido ${pedido ? pedido.codigo : ''}?
            </div>
            <div class="modal-actions modal-actions-no-border">
                <button type="button" onclick="executarReverterEmissao('${id}')" style="background:#22C55E;min-width:80px;">Sim</button>
                <button type="button" onclick="fecharModalReverterEmissao()" style="background:#EF4444;min-width:80px;">Não</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharModalReverterEmissao() {
    const modal = document.getElementById('modalReverterEmissao');
    if (modal) modal.remove();
}

async function executarReverterEmissao(id) {
    fecharModalReverterEmissao();
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    try {
        const items = Array.isArray(pedido.items) ? pedido.items : [];
        const checkboxLabel = document.querySelector(`label[for="check-${id}"]`);
        if (checkboxLabel) { checkboxLabel.style.opacity = '0.5'; checkboxLabel.style.pointerEvents = 'none'; }
        for (const item of items) {
            if (!item.codigoEstoque) continue;
            const itemEstoque = estoqueCache[item.codigoEstoque];
            if (!itemEstoque) continue;
            const novaQuantidade = parseFloat(itemEstoque.quantidade) + item.quantidade;
            const resp = await fetch(`${API_URL}/estoque/${itemEstoque.codigo}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
                body: JSON.stringify({ quantidade: novaQuantidade })
            });
            if (!resp.ok) throw new Error('Erro ao atualizar estoque');
        }
        const response = await fetch(`${API_URL}/pedidos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ status: 'pendente', data_emissao: null })
        });
        if (!response.ok) throw new Error('Erro ao atualizar pedido');
        await Promise.all([loadPedidos(), loadEstoque()]);
        if (checkboxLabel) { checkboxLabel.style.opacity = '1'; checkboxLabel.style.pointerEvents = 'auto'; }
        showMessage(`Emissão do pedido ${pedido.codigo} revertida!`, 'success');
    } catch (error) {
        console.error('Erro ao reverter:', error);
        showMessage('Erro ao reverter emissão!', 'error');
        const cb = document.getElementById(`check-${id}`);
        if (cb) cb.checked = true;
    }
}

function confirmarEmissaoSemEstoque(pedidoId) {
    const existing = document.getElementById('modalSemEstoque');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modalSemEstoque';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content modal-delete" style="max-width:440px;">
            <button class="close-modal" onclick="fecharModalSemEstoque()">✕</button>
            <div class="modal-message-delete" style="margin-top:1rem;margin-bottom:1.5rem;">
                O estoque não foi incluído para este pedido. Deseja confirmar esta emissão?
            </div>
            <div class="modal-actions modal-actions-no-border">
                <button type="button" onclick="executarEmissaoSemEstoque('${pedidoId}')" style="background:#22C55E;min-width:80px;">Sim</button>
                <button type="button" onclick="fecharModalSemEstoque()" style="background:#EF4444;min-width:80px;">Não</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharModalSemEstoque() {
    const modal = document.getElementById('modalSemEstoque');
    if (modal) modal.remove();
}

function showConfirmarEmissaoModal(pedidoId) {
    const existing = document.getElementById('modalConfirmarEmissao');
    if (existing) existing.remove();

    const pedido = pedidos.find(p => p.id === pedidoId);
    const modal = document.createElement('div');
    modal.id = 'modalConfirmarEmissao';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content modal-delete" style="max-width:440px;">
            <button class="close-modal" onclick="fecharModalConfirmarEmissao()">✕</button>
            <div class="modal-message-delete" style="margin-top:1rem;margin-bottom:1.5rem;">
                Confirmar emissão para o pedido ${pedido ? pedido.codigo : ''}?
            </div>
            <div class="modal-actions modal-actions-no-border">
                <button type="button" onclick="executarEmissao('${pedidoId}')" style="background:#22C55E;min-width:80px;">Sim</button>
                <button type="button" onclick="fecharModalConfirmarEmissao()" style="background:#EF4444;min-width:80px;">Não</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharModalConfirmarEmissao() {
    const modal = document.getElementById('modalConfirmarEmissao');
    if (modal) modal.remove();
}

async function executarEmissaoSemEstoque(id) {
    fecharModalSemEstoque();
    // Emissão sem debitar estoque
    try {
        const checkboxLabel = document.querySelector(`label[for="check-${id}"]`);
        if (checkboxLabel) { checkboxLabel.style.opacity = '0.5'; checkboxLabel.style.pointerEvents = 'none'; }
        const response = await fetch(`${API_URL}/pedidos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ status: 'emitida', data_emissao: new Date().toISOString() })
        });
        if (!response.ok) throw new Error('Erro ao atualizar pedido');
        const pedido = pedidos.find(p => p.id === id);
        await Promise.all([loadPedidos(), loadEstoque()]);
        if (checkboxLabel) { checkboxLabel.style.opacity = '1'; checkboxLabel.style.pointerEvents = 'auto'; }
        showMessage(`Pedido de Faturamento ${pedido ? pedido.codigo : ''} Emitido`, 'success');
    } catch (error) {
        console.error('Erro ao emitir:', error);
        showMessage('Erro ao emitir pedido', 'error');
        const cb = document.getElementById(`check-${id}`);
        if (cb) cb.checked = false;
    }
}

async function executarEmissao(id) {
    fecharModalConfirmarEmissao();
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    try {
        const checkboxLabel = document.querySelector(`label[for="check-${id}"]`);
        if (checkboxLabel) { checkboxLabel.style.opacity = '0.5'; checkboxLabel.style.pointerEvents = 'none'; }
        // Debitar estoque
        for (const item of items) {
            if (!item.codigoEstoque) continue;
            const itemEstoque = estoqueCache[item.codigoEstoque];
            if (!itemEstoque) continue;
            const novaQuantidade = parseFloat(itemEstoque.quantidade) - item.quantidade;
            const resp = await fetch(`${API_URL}/estoque/${itemEstoque.codigo}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
                body: JSON.stringify({ quantidade: novaQuantidade })
            });
            if (!resp.ok) throw new Error('Erro ao atualizar estoque');
        }
        // Atualizar status
        const response = await fetch(`${API_URL}/pedidos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ status: 'emitida', data_emissao: new Date().toISOString() })
        });
        if (!response.ok) throw new Error('Erro ao atualizar pedido');
        await Promise.all([loadPedidos(), loadEstoque()]);
        if (checkboxLabel) { checkboxLabel.style.opacity = '1'; checkboxLabel.style.pointerEvents = 'auto'; }
        showMessage(`Pedido de Faturamento ${pedido.codigo} Emitido`, 'success');
    } catch (error) {
        console.error('Erro ao emitir:', error);
        showMessage('Erro ao emitir pedido', 'error');
        const cb = document.getElementById(`check-${id}`);
        if (cb) cb.checked = false;
    }
}

// ============================================
// GERAR ETIQUETA AUTOMÁTICA
// ============================================
function gerarEtiqueta(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) {
        showMessage('Pedido não encontrado!', 'error');
        return;
    }

    if (!pedido.quantidade || parseInt(pedido.quantidade) === 0) {
        showMessage('Este pedido não possui quantidade total informada!', 'error');
        return;
    }

    // Abrir modal de NF no lugar do prompt
    showNFModal(id);
}

function showNFModal(pedidoId) {
    // Remove modal anterior se existir
    const existing = document.getElementById('nfModal');
    if (existing) existing.remove();

    const modalHTML = `
        <div class="modal-overlay" id="nfModal" style="display:flex;">
            <div class="modal-content modal-delete" style="max-width:420px; min-height:260px;">
                <button class="close-modal" onclick="closeNFModal()">✕</button>
                <div style="margin-bottom:1.5rem; padding: 0 0.25rem; margin-top:1rem;">
                    <input type="text"
                           id="nfInput"
                           placeholder="Número da NF"
                           style="text-align:center; font-size:1.1rem; font-weight:600; letter-spacing:1px;"
                           onkeydown="if(event.key==='Enter') confirmarGerarEtiqueta('${pedidoId}')">
                </div>
                <div class="modal-actions modal-actions-no-border">
                    <button type="button" onclick="confirmarGerarEtiqueta('${pedidoId}')" style="background:#22C55E; min-width:140px;">Gerar Etiqueta</button>
                    <button type="button" onclick="closeNFModal()" class="cancel-close" style="min-width:100px;">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setTimeout(() => document.getElementById('nfInput')?.focus(), 100);
}

function closeNFModal() {
    const modal = document.getElementById('nfModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

function confirmarGerarEtiqueta(pedidoId) {
    const nf = document.getElementById('nfInput')?.value?.trim();
    if (!nf) {
        showMessage('Informe o número da NF!', 'error');
        return;
    }

    closeNFModal();

    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    let municipio = '';
    const enderecoPartes = pedido.endereco.split(',');
    municipio = enderecoPartes.length > 1
        ? enderecoPartes[enderecoPartes.length - 1].trim()
        : pedido.endereco;

    imprimirEtiquetasAutomatico(
        nf,
        parseInt(pedido.quantidade),
        pedido.razao_social,
        municipio,
        pedido.endereco,
        pedido.local_entrega || ''
    );
}

function imprimirEtiquetasAutomatico(nf, totalVolumes, destinatario, municipio, endereco, infoAdicional) {
    let labelsContent = '';
    
    for (let i = 1; i <= totalVolumes; i++) {
        labelsContent += `
            <div class='label-container'>
                <div class='logo-container'>
                    <img src='ETIQUETA.png' alt='Logo' style='max-width: 100px; max-height: 100px; margin-right: 15px;'>
                    <div>
                        <div class='header'>I.R COMÉRCIO E <br>MATERIAIS ELÉTRICOS LTDA</div>
                        <div class='cnpj'>CNPJ: 33.149.502/0001-38</div>
                    </div>
                </div>
                <div class='nf-volume-container'>
                    <div class='nf-volume'>NF: ${nf}</div>
                    <div class='volume'>VOLUME: ${i}/${totalVolumes}</div>
                </div>
                <hr>
                <div class='section-title'>DESTINATÁRIO:</div>
                <div class='section'>${destinatario}</div>
                <div class='section'>${municipio}</div>
                <div class='section'>${endereco}</div>
                ${infoAdicional ? `<div class='section-title additional-info'>LOCAL DE ENTREGA:</div><div class='section'>${infoAdicional}</div>` : ""}
            </div>
        `;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Etiquetas NF ${nf}</title>
            <style>
                @page {
                    size: 100mm 150mm;
                    margin: 2mm;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    font-size: 12px;
                    text-align: left;
                    margin: 0;
                    padding: 0;
                }
                .label-container {
                    width: 94mm;
                    height: 144mm;
                    padding: 2mm;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start;
                    overflow: hidden;
                    page-break-after: always;
                }
                .logo-container {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .logo-container img {
                    max-width: 100px;
                    max-height: 100px;
                    margin-right: 15px;
                }
                .header, .cnpj, .section-title {
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .header {
                    font-size: 14px;
                    line-height: 1.2;
                }
                .cnpj {
                    font-size: 12px;
                }
                .nf-volume-container {
                    text-align: center;
                    border: 1px solid black;
                    padding: 5px;
                    margin: 10px 0;
                }
                .nf-volume {
                    font-size: 30px;
                    font-weight: bold;
                    margin-bottom: 2px;
                }
                .volume {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .section {
                    line-height: 1.2;
                    word-wrap: break-word;
                    margin-top: 2px;
                }
                .additional-info {
                    margin-top: 10px;
                }
                hr {
                    border: none;
                    border-top: 1px solid #000;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            ${labelsContent}
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        window.onafterprint = function() { 
                            window.close(); 
                        };
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    
    showMessage(`${totalVolumes} etiqueta(s) gerada(s) para NF ${nf}`, 'success');
}

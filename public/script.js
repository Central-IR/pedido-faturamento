// ============================================
// CONFIGURAÇÃO - SEM CREDENCIAIS!
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

// Função auxiliar para converter texto para maiúsculas
function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
}

// Função para capitalizar apenas primeira letra
function capitalizeText(text) {
    return text.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
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

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'Não Autorizado') {
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
            ">Ir Para o Portal</a>
        </div>
    `;
}

async function inicializarApp() {
    await checkConnection();
    await loadPedidos();
    await loadEstoque();
    setInterval(checkConnection, 15000);
    setInterval(() => {
        if (isOnline) {
            loadPedidos();
            loadEstoque();
        }
    }, 10000);
}

// ============================================
// CONEXÃO COM A API
// ============================================
async function checkConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/pedidos`, {
            method: 'HEAD',
            headers: { 'X-Session-Token': sessionToken },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('Sua Sessão Expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ Servidor ONLINE');
            await loadPedidos();
        } else if (!wasOffline && !isOnline) {
            console.log('❌ Servidor OFFLINE');
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        if (isOnline) {
            console.log('❌ Erro de conexão:', error.message);
        }
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const status = document.getElementById('connectionStatus');
    if (status) {
        status.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

// ============================================
// CARREGAR PEDIDOS
// ============================================
async function loadPedidos() {
    if (!isOnline) return;
    try {
        const response = await fetch(`${API_URL}/pedidos`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('Sua Sessão Expirou');
            return;
        }

        if (response.ok) {
            pedidos = await response.json();
            atualizarCacheClientes(pedidos);
            updateDisplay();
        }
    } catch (error) {
        console.error('Erro ao carregar pedidos:', error);
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
            mostrarTelaAcessoNegado('Sua Sessão Expirou');
            return;
        }

        if (response.ok) {
            const items = await response.json();
            estoqueCache = {};
            items.forEach(item => {
                estoqueCache[toUpperCase(item.codigo)] = item;
            });
            console.log(`📦 ${Object.keys(estoqueCache).length} itens carregados do estoque`);
        }
    } catch (error) {
        console.error('Erro ao carregar estoque:', error);
    }
}

// ============================================
// CACHE DE CLIENTES
// ============================================
function atualizarCacheClientes(pedidos) {
    clientesCache = {};
    pedidos.forEach(pedido => {
        const cnpj = toUpperCase(pedido.cnpj?.trim());
        if (cnpj && !clientesCache[cnpj]) {
            clientesCache[cnpj] = {
                razaoSocial: toUpperCase(pedido.razao_social),
                inscricaoEstadual: toUpperCase(pedido.inscricao_estadual),
                endereco: toUpperCase(pedido.endereco),
                telefone: toUpperCase(pedido.telefone),
                contato: toUpperCase(pedido.contato),
                email: pedido.email ? pedido.email.toLowerCase() : '',
                documento: toUpperCase(pedido.documento),
                localEntrega: toUpperCase(pedido.local_entrega),
                setor: toUpperCase(pedido.setor),
                transportadora: toUpperCase(pedido.transportadora),
                valorFrete: pedido.valor_frete,
                vendedor: toUpperCase(pedido.vendedor),
                peso: pedido.peso,
                quantidade: pedido.quantidade,
                volumes: pedido.volumes,
                previsaoEntrega: pedido.previsao_entrega
            };
        }
    });
    console.log(`👥 ${Object.keys(clientesCache).length} clientes em cache`);
}

// ============================================
// ATUALIZAR DISPLAY
// ============================================
function updateDisplay() {
    const totalEmitidos = pedidos.filter(p => p.status === 'emitida').length;
    const totalPendentes = pedidos.filter(p => p.status === 'pendente').length;
    
    document.getElementById('totalPedidos').textContent = pedidos.length;
    document.getElementById('totalEmitidos').textContent = totalEmitidos;
    document.getElementById('totalPendentes').textContent = totalPendentes;
    
    updateVendedoresFilter();
    updateTable();
}

// ============================================
// ATUALIZAR FILTRO DE VENDEDORES
// ============================================
function updateVendedoresFilter() {
    const vendedores = new Set();
    pedidos.forEach(p => {
        if (p.vendedor?.trim()) {
            vendedores.add(toUpperCase(p.vendedor.trim()));
        }
    });

    const select = document.getElementById('filterVendedor');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos</option>';
        Array.from(vendedores).sort().forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.textContent = capitalizeText(v);
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

// ============================================
// ATUALIZAR TABELA
// ============================================
function updateTable() {
    const container = document.getElementById('pedidosContainer');
    let filtered = [...pedidos];
    
    const search = document.getElementById('search').value.toLowerCase();
    const filterVendedor = document.getElementById('filterVendedor').value;
    const filterStatus = document.getElementById('filterStatus').value;
    
    if (search) {
        filtered = filtered.filter(p => 
            p.codigo?.toString().includes(search) ||
            toUpperCase(p.cnpj || '').toLowerCase().includes(search) ||
            toUpperCase(p.razao_social || '').toLowerCase().includes(search)
        );
    }
    
    if (filterVendedor) {
        filtered = filtered.filter(p => toUpperCase(p.vendedor || '') === filterVendedor);
    }
    
    if (filterStatus) {
        filtered = filtered.filter(p => p.status === filterStatus);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Nenhum Pedido Encontrado</td></tr>';
        return;
    }
    
    container.innerHTML = filtered.map(pedido => `
        <tr class="${pedido.status === 'emitida' ? 'row-emitida' : ''}">
            <td style="text-align: center;">
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="check-${pedido.id}" ${pedido.status === 'emitida' ? 'checked' : ''} 
                        onchange="toggleStatus(${pedido.id})" class="styled-checkbox">
                    <label for="check-${pedido.id}" class="checkbox-label-styled"></label>
                </div>
            </td>
            <td><strong>${pedido.codigo}</strong></td>
            <td>${capitalizeText(pedido.razao_social)}</td>
            <td>${pedido.cnpj}</td>
            <td>${capitalizeText(pedido.vendedor || '-')}</td>
            <td><strong>${pedido.valor_total}</strong></td>
            <td><span class="badge ${pedido.status}">${pedido.status === 'emitida' ? 'Emitida' : 'Pendente'}</span></td>
            <td>
                <div class="actions">
                    <button onclick="viewPedido(${pedido.id})" class="action-btn" style="background: var(--btn-view);">Ver</button>
                    <button onclick="editPedido(${pedido.id})" class="action-btn" style="background: var(--btn-edit);">Editar</button>
                    <button onclick="emitirPedido(${pedido.id})" class="action-btn emit">Emitir</button>
                    <button onclick="deletePedido(${pedido.id})" class="action-btn danger">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterPedidos() {
    updateTable();
}

function clearFilters() {
    document.getElementById('search').value = '';
    document.getElementById('filterVendedor').value = '';
    document.getElementById('filterStatus').value = '';
    updateDisplay();
}

// ============================================
// ABRIR FORMULÁRIO MODAL
// ============================================
function openFormModal() {
    editingId = null;
    itemCounter = 0;
    const nextCodigo = pedidos.length > 0 ? Math.max(...pedidos.map(p => p.codigo || 0)) + 1 : 1;
    
    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content" style="max-width: 1400px;">
                <div class="modal-header">
                    <h3 class="modal-title">Novo Pedido de Faturamento</h3>
                    <button class="close-modal" onclick="closeFormModal()">✕</button>
                </div>
                
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchTab('tab-faturamento')">Faturamento</button>
                    <button class="tab-btn" onclick="switchTab('tab-pedido')">Pedido</button>
                    <button class="tab-btn" onclick="switchTab('tab-mercadoria')">Mercadoria</button>
                    <button class="tab-btn" onclick="switchTab('tab-entrega')">Entrega</button>
                </div>

                <form id="pedidoForm" onsubmit="handleSubmit(event)">
                    <input type="hidden" id="editId" value="">
                    <input type="hidden" id="codigoPedido" value="${nextCodigo}">
                    
                    <div class="tab-content active" id="tab-faturamento">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Código do Pedido</label>
                                <input type="text" value="${nextCodigo}" readonly class="input-editable">
                            </div>
                            <div class="form-group">
                                <label for="cnpj">CNPJ *</label>
                                <input type="text" id="cnpj" required onblur="buscarDadosCliente()">
                            </div>
                            <div class="form-group">
                                <label for="razaoSocial">Razão Social *</label>
                                <input type="text" id="razaoSocial" required>
                            </div>
                            <div class="form-group">
                                <label for="inscricaoEstadual">Inscrição Estadual</label>
                                <input type="text" id="inscricaoEstadual">
                            </div>
                            <div class="form-group">
                                <label for="endereco">Endereço</label>
                                <input type="text" id="endereco">
                            </div>
                            <div class="form-group">
                                <label for="telefone">Telefone</label>
                                <input type="text" id="telefone">
                            </div>
                            <div class="form-group">
                                <label for="contato">Contato</label>
                                <input type="text" id="contato">
                            </div>
                            <div class="form-group">
                                <label for="email">E-mail</label>
                                <input type="email" id="email" style="text-transform: lowercase !important;">
                            </div>
                            <div class="form-group">
                                <label for="documento">Documento</label>
                                <input type="text" id="documento">
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="tab-pedido">
                        <button type="button" onclick="addItem()" class="success small" style="margin-bottom: 1rem;">+ Adicionar Item</button>
                        <div style="overflow-x: auto;">
                            <table class="items-table">
                                <thead>
                                    <tr>
                                        <th style="width: 40px;">Item</th>
                                        <th style="width: 120px;">Cód. Estoque</th>
                                        <th style="min-width: 200px;">Especificação</th>
                                        <th style="width: 80px;">Qtd</th>
                                        <th style="width: 80px;">Unid</th>
                                        <th style="width: 100px;">NCM</th>
                                        <th style="width: 100px;">Valor Un</th>
                                        <th style="width: 120px;">Total</th>
                                        <th style="width: 80px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="itemsBody"></tbody>
                            </table>
                        </div>
                        <div class="form-group" style="margin-top: 1rem;">
                            <label>Valor Total do Pedido</label>
                            <input type="text" id="valorTotalPedido" readonly value="R$ 0,00" class="input-editable">
                        </div>
                    </div>

                    <div class="tab-content" id="tab-mercadoria">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="peso">Peso (Kg)</label>
                                <input type="number" id="peso" step="0.01" min="0">
                            </div>
                            <div class="form-group">
                                <label for="quantidade">Quantidade Total</label>
                                <input type="number" id="quantidade" min="0">
                            </div>
                            <div class="form-group">
                                <label for="volumes">Volume(s)</label>
                                <input type="number" id="volumes" min="0">
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="tab-entrega">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="localEntrega">Local de Entrega</label>
                                <input type="text" id="localEntrega">
                            </div>
                            <div class="form-group">
                                <label for="setor">Setor</label>
                                <input type="text" id="setor">
                            </div>
                            <div class="form-group">
                                <label for="previsaoEntrega">Previsão de Entrega</label>
                                <input type="date" id="previsaoEntrega">
                            </div>
                            <div class="form-group">
                                <label for="transportadora">Transportadora</label>
                                <input type="text" id="transportadora">
                            </div>
                            <div class="form-group">
                                <label for="valorFrete">Valor do Frete</label>
                                <input type="text" id="valorFrete">
                            </div>
                            <div class="form-group">
                                <label for="vendedor">Vendedor</label>
                                <input type="text" id="vendedor">
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button type="submit" style="background: var(--btn-save);">Salvar Pedido</button>
                        <button type="button" onclick="closeFormModal()" class="secondary">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    addItem();
    setTimeout(() => document.getElementById('cnpj').focus(), 100);
}

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// SISTEMA DE ABAS
function switchTab(tabId) {
    document.querySelectorAll('#formModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#formModal .tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// BUSCAR DADOS DO CLIENTE
function buscarDadosCliente() {
    const cnpj = toUpperCase(document.getElementById('cnpj').value.trim());
    if (cnpj && clientesCache[cnpj]) {
        const cliente = clientesCache[cnpj];
        document.getElementById('razaoSocial').value = cliente.razaoSocial || '';
        document.getElementById('inscricaoEstadual').value = cliente.inscricaoEstadual || '';
        document.getElementById('endereco').value = cliente.endereco || '';
        document.getElementById('telefone').value = cliente.telefone || '';
        document.getElementById('contato').value = cliente.contato || '';
        document.getElementById('email').value = cliente.email || '';
        document.getElementById('documento').value = cliente.documento || '';
        document.getElementById('localEntrega').value = cliente.localEntrega || '';
        document.getElementById('setor').value = cliente.setor || '';
        document.getElementById('transportadora').value = cliente.transportadora || '';
        document.getElementById('valorFrete').value = cliente.valorFrete || '';
        document.getElementById('vendedor').value = cliente.vendedor || '';
        
        if (cliente.peso) document.getElementById('peso').value = cliente.peso;
        if (cliente.quantidade) document.getElementById('quantidade').value = cliente.quantidade;
        if (cliente.volumes) document.getElementById('volumes').value = cliente.volumes;
        if (cliente.previsaoEntrega) document.getElementById('previsaoEntrega').value = cliente.previsaoEntrega;
        
        showToast('Dados do cliente carregados!', 'success');
    }
}

// ADICIONAR ITEM
function addItem() {
    itemCounter++;
    const tbody = document.getElementById('itemsBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td style="text-align: center;">${itemCounter}</td>
        <td style="position: relative;">
            <input type="text" class="item-codigo" placeholder="CÓDIGO" onblur="buscarDadosEstoque(this)" oninput="showEstoqueSuggestions(this)">
            <div class="suggestions-container"></div>
        </td>
        <td>
            <textarea class="item-especificacao" placeholder="ESPECIFICAÇÃO..." rows="2"></textarea>
        </td>
        <td>
            <input type="number" class="item-qtd" min="0" step="1" value="1" onchange="calculateItemTotal(this)">
        </td>
        <td>
            <input type="text" class="item-unid" value="UN">
        </td>
        <td>
            <input type="text" class="item-ncm" placeholder="NCM">
        </td>
        <td>
            <input type="number" class="item-valor" min="0" step="0.01" value="0" onchange="calculateItemTotal(this)">
        </td>
        <td>
            <input type="text" class="item-total" readonly value="R$ 0,00">
        </td>
        <td style="text-align: center;">
            <button type="button" class="danger small" onclick="removeItem(this)">X</button>
        </td>
    `;
    tbody.appendChild(row);
}

function removeItem(btn) {
    btn.closest('tr').remove();
    recalculateTotal();
    renumberItems();
}

function renumberItems() {
    const rows = document.querySelectorAll('#itemsBody tr');
    rows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });
    itemCounter = rows.length;
}

// BUSCAR DADOS DO ESTOQUE
function buscarDadosEstoque(input) {
    const codigo = toUpperCase(input.value.trim());
    if (codigo && estoqueCache[codigo]) {
        const item = estoqueCache[codigo];
        const row = input.closest('tr');
        row.querySelector('.item-especificacao').value = toUpperCase(item.descricao || '');
        row.querySelector('.item-ncm').value = item.ncm || '';
        row.querySelector('.item-valor').value = item.preco_venda || 0;
        calculateItemTotal(row.querySelector('.item-qtd'));
        showToast('Dados do estoque carregados!', 'success');
        
        const container = row.querySelector('.suggestions-container');
        if (container) container.innerHTML = '';
    }
}

// MOSTRAR SUGESTÕES DE ESTOQUE
function showEstoqueSuggestions(input) {
    const termo = toUpperCase(input.value.trim());
    const container = input.parentElement.querySelector('.suggestions-container');
    
    if (termo.length < 2) {
        container.innerHTML = '';
        return;
    }
    
    const matches = Object.keys(estoqueCache)
        .filter(codigo => codigo.includes(termo))
        .slice(0, 5);
    
    if (matches.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = matches.map(codigo => {
        const item = estoqueCache[codigo];
        return `
            <div class="autocomplete-item" onclick="selecionarItemEstoque('${codigo}', this)">
                <strong>${codigo}</strong> - ${toUpperCase(item.descricao || '')}
            </div>
        `;
    }).join('');
    
    container.style.cssText = `
        position: absolute;
        z-index: 1000;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-height: 200px;
        overflow-y: auto;
        width: 100%;
        margin-top: 4px;
    `;
}

window.selecionarItemEstoque = function(codigo, element) {
    const row = element.closest('tr');
    const input = row.querySelector('.item-codigo');
    input.value = codigo;
    buscarDadosEstoque(input);
};

// CALCULAR TOTAIS
function calculateItemTotal(input) {
    const row = input.closest('tr');
    const qtd = parseFloat(row.querySelector('.item-qtd').value) || 0;
    const valor = parseFloat(row.querySelector('.item-valor').value) || 0;
    const total = qtd * valor;
    row.querySelector('.item-total').value = formatCurrency(total);
    recalculateTotal();
}

function recalculateTotal() {
    const totals = document.querySelectorAll('.item-total');
    let sum = 0;
    totals.forEach(input => {
        const value = input.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        sum += parseFloat(value) || 0;
    });
    const totalInput = document.getElementById('valorTotalPedido');
    if (totalInput) totalInput.value = formatCurrency(sum);
}

function formatCurrency(value) {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

// ============================================
// SUBMIT DO FORMULÁRIO
// ============================================
async function handleSubmit(event) {
    event.preventDefault();
    
    const items = [];
    const rows = document.querySelectorAll('#itemsBody tr');
    rows.forEach((row, index) => {
        items.push({
            item: index + 1,
            codigoEstoque: toUpperCase(row.querySelector('.item-codigo').value),
            especificacao: toUpperCase(row.querySelector('.item-especificacao').value),
            quantidade: parseInt(row.querySelector('.item-qtd').value) || 0,
            unidade: toUpperCase(row.querySelector('.item-unid').value),
            ncm: row.querySelector('.item-ncm').value,
            valorUnitario: parseFloat(row.querySelector('.item-valor').value) || 0,
            valorTotal: row.querySelector('.item-total').value
        });
    });
    
    const emailValue = document.getElementById('email').value.trim();
    
    const formData = {
        codigo: parseInt(document.getElementById('codigoPedido').value),
        cnpj: document.getElementById('cnpj').value,
        razao_social: toUpperCase(document.getElementById('razaoSocial').value),
        inscricao_estadual: toUpperCase(document.getElementById('inscricaoEstadual').value),
        endereco: toUpperCase(document.getElementById('endereco').value),
        telefone: toUpperCase(document.getElementById('telefone').value),
        contato: toUpperCase(document.getElementById('contato').value),
        email: emailValue ? emailValue.toLowerCase() : null,
        documento: toUpperCase(document.getElementById('documento').value),
        items: items,
        valor_total: document.getElementById('valorTotalPedido').value,
        peso: parseFloat(document.getElementById('peso').value) || 0,
        quantidade: parseInt(document.getElementById('quantidade').value) || 0,
        volumes: parseInt(document.getElementById('volumes').value) || 0,
        local_entrega: toUpperCase(document.getElementById('localEntrega').value),
        setor: toUpperCase(document.getElementById('setor').value),
        previsao_entrega: document.getElementById('previsaoEntrega').value || null,
        transportadora: toUpperCase(document.getElementById('transportadora').value),
        valor_frete: document.getElementById('valorFrete').value,
        vendedor: toUpperCase(document.getElementById('vendedor').value),
        status: 'pendente',
        data_emissao: null
    };
    
    try {
        const isEditing = editingId !== null;
        const url = isEditing 
            ? `${API_URL}/pedidos/${editingId}`
            : `${API_URL}/pedidos`;
        const method = isEditing ? 'PATCH' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'X-Session-Token': sessionToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('Sua Sessão Expirou');
            return;
        }
        
        if (!response.ok) throw new Error('Erro ao salvar');
        
        showToast(isEditing ? 'Pedido atualizado com sucesso!' : 'Pedido criado com sucesso!', 'success');
        closeFormModal();
        await loadPedidos();
    } catch (error) {
        showToast('Erro ao salvar pedido: ' + error.message, 'error');
    }
}

// ============================================
// TOGGLE STATUS (EMITIR/REABRIR)
// ============================================
async function toggleStatus(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    const novoStatus = pedido.status === 'pendente' ? 'emitida' : 'pendente';
    
    if (novoStatus === 'emitida') {
        const verificacao = await verificarEstoque(pedido);
        if (!verificacao.sucesso) {
            showToast(verificacao.mensagem, 'error');
            document.getElementById(`check-${id}`).checked = false;
            return;
        }
        
        if (!confirm(`Confirmar emissão do pedido ${pedido.codigo}?\n\nO estoque será atualizado automaticamente.`)) {
            document.getElementById(`check-${id}`).checked = false;
            return;
        }
        
        await atualizarEstoque(pedido, 'descontar');
    } else {
        if (!confirm(`Reabrir o pedido ${pedido.codigo}?\n\nO estoque será revertido automaticamente.`)) {
            document.getElementById(`check-${id}`).checked = true;
            return;
        }
        
        await atualizarEstoque(pedido, 'reverter');
    }
    
    try {
        const updates = {
            status: novoStatus,
            data_emissao: novoStatus === 'emitida' ? new Date().toISOString() : null
        };
        
        const response = await fetch(`${API_URL}/pedidos/${id}`, {
            method: 'PATCH',
            headers: {
                'X-Session-Token': sessionToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });

        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('Sua Sessão Expirou');
            return;
        }
        
        if (!response.ok) throw new Error('Erro ao atualizar');
        
        showToast(`Pedido ${novoStatus === 'emitida' ? 'emitido' : 'reaberto'}!`, 'success');
        await loadPedidos();
    } catch (error) {
        showToast('Erro ao atualizar status', 'error');
        document.getElementById(`check-${id}`).checked = pedido.status === 'emitida';
    }
}

// ============================================
// VERIFICAR ESTOQUE
// ============================================
async function verificarEstoque(pedido) {
    for (const item of pedido.items) {
        if (!item.codigoEstoque) continue;
        
        const codigoUpper = toUpperCase(item.codigoEstoque);
        const estoqueItem = estoqueCache[codigoUpper];
        
        if (!estoqueItem) {
            return {
                sucesso: false,
                mensagem: `Item ${item.codigoEstoque} não encontrado no estoque`
            };
        }
        
        if (estoqueItem.quantidade < item.quantidade) {
            return {
                sucesso: false,
                mensagem: `Estoque insuficiente para ${item.codigoEstoque}.\nDisponível: ${estoqueItem.quantidade}\nNecessário: ${item.quantidade}`
            };
        }
    }
    return { sucesso: true };
}

// ============================================
// ATUALIZAR ESTOQUE
// ============================================
async function atualizarEstoque(pedido, operacao) {
    for (const item of pedido.items) {
        if (!item.codigoEstoque) continue;
        
        const codigoUpper = toUpperCase(item.codigoEstoque);
        const estoqueItem = estoqueCache[codigoUpper];
        
        const novaQuantidade = operacao === 'descontar' 
            ? estoqueItem.quantidade - item.quantidade 
            : estoqueItem.quantidade + item.quantidade;
        
        await fetch(`${API_URL}/estoque/${estoqueItem.codigo}`, {
            method: 'PATCH',
            headers: {
                'X-Session-Token': sessionToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ quantidade: novaQuantidade })
        });
    }
    await loadEstoque();
}

// ============================================
// VISUALIZAR PEDIDO
// ============================================
function viewPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    const modalHTML = `
        <div class="modal-overlay show" id="infoModal">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h3 class="modal-title">Visualizar Pedido #${pedido.codigo}</h3>
                    <button class="close-modal" onclick="closeInfoModal()">✕</button>
                </div>
                
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchViewTab('view-faturamento')">Faturamento</button>
                    <button class="tab-btn" onclick="switchViewTab('view-pedido')">Pedido</button>
                    <button class="tab-btn" onclick="switchViewTab('view-mercadoria')">Mercadoria</button>
                    <button class="tab-btn" onclick="switchViewTab('view-entrega')">Entrega</button>
                </div>

                <div class="tab-content active" id="view-faturamento">
                    <div class="info-grid">
                        <div class="info-item">
                            <strong>CNPJ:</strong>
                            <p>${pedido.cnpj}</p>
                        </div>
                        <div class="info-item">
                            <strong>Razão Social:</strong>
                            <p>${capitalizeText(pedido.razao_social)}</p>
                        </div>
                        ${pedido.inscricao_estadual ? `
                        <div class="info-item">
                            <strong>Inscrição Estadual:</strong>
                            <p>${capitalizeText(pedido.inscricao_estadual)}</p>
                        </div>` : ''}
                        ${pedido.endereco ? `
                        <div class="info-item">
                            <strong>Endereço:</strong>
                            <p>${capitalizeText(pedido.endereco)}</p>
                        </div>` : ''}
                        ${pedido.telefone ? `
                        <div class="info-item">
                            <strong>Telefone:</strong>
                            <p>${capitalizeText(pedido.telefone)}</p>
                        </div>` : ''}
                        ${pedido.email ? `
                        <div class="info-item">
                            <strong>E-mail:</strong>
                            <p>${pedido.email}</p>
                        </div>` : ''}
                        ${pedido.contato ? `
                        <div class="info-item">
                            <strong>Contato:</strong>
                            <p>${capitalizeText(pedido.contato)}</p>
                        </div>` : ''}
                        ${pedido.documento ? `
                        <div class="info-item">
                            <strong>Documento:</strong>
                            <p>${capitalizeText(pedido.documento)}</p>
                        </div>` : ''}
                    </div>
                </div>

                <div class="tab-content" id="view-pedido">
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; margin-top: 0.5rem;">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Código</th>
                                    <th>Especificação</th>
                                    <th>Qtd</th>
                                    <th>Valor Un</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pedido.items.map(item => `
                                    <tr>
                                        <td>${item.item}</td>
                                        <td>${capitalizeText(item.codigoEstoque || '-')}</td>
                                        <td>${capitalizeText(item.especificacao)}</td>
                                        <td>${item.quantidade}</td>
                                        <td>R$ ${item.valorUnitario.toFixed(2)}</td>
                                        <td>${item.valorTotal}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="info-item" style="margin-top: 1.5rem; font-size: 1.1rem;">
                        <strong>Valor Total:</strong>
                        <p>${pedido.valor_total}</p>
                    </div>
                </div>

                <div class="tab-content" id="view-mercadoria">
                    <div class="info-grid">
                        ${pedido.peso ? `
                        <div class="info-item">
                            <strong>Peso:</strong>
                            <p>${pedido.peso} Kg</p>
                        </div>` : ''}
                        ${pedido.quantidade ? `
                        <div class="info-item">
                            <strong>Quantidade:</strong>
                            <p>${pedido.quantidade}</p>
                        </div>` : ''}
                        ${pedido.volumes ? `
                        <div class="info-item">
                            <strong>Volumes:</strong>
                            <p>${pedido.volumes}</p>
                        </div>` : ''}
                    </div>
                    ${!pedido.peso && !pedido.quantidade && !pedido.volumes ? '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma informação de mercadoria disponível</p>' : ''}
                </div>

                <div class="tab-content" id="view-entrega">
                    <div class="info-grid">
                        ${pedido.local_entrega ? `
                        <div class="info-item">
                            <strong>Local:</strong>
                            <p>${capitalizeText(pedido.local_entrega)}</p>
                        </div>` : ''}
                        ${pedido.setor ? `
                        <div class="info-item">
                            <strong>Setor:</strong>
                            <p>${capitalizeText(pedido.setor)}</p>
                        </div>` : ''}
                        ${pedido.previsao_entrega ? `
                        <div class="info-item">
                            <strong>Previsão de Entrega:</strong>
                            <p>${new Date(pedido.previsao_entrega).toLocaleDateString('pt-BR')}</p>
                        </div>` : ''}
                        ${pedido.transportadora ? `
                        <div class="info-item">
                            <strong>Transportadora:</strong>
                            <p>${capitalizeText(pedido.transportadora)}</p>
                        </div>` : ''}
                        ${pedido.valor_frete ? `
                        <div class="info-item">
                            <strong>Valor do Frete:</strong>
                            <p>${pedido.valor_frete}</p>
                        </div>` : ''}
                        ${pedido.vendedor ? `
                        <div class="info-item">
                            <strong>Vendedor:</strong>
                            <p>${capitalizeText(pedido.vendedor)}</p>
                        </div>` : ''}
                        ${pedido.status === 'emitida' && pedido.data_emissao ? `
                        <div class="info-item">
                            <strong>Data de Emissão:</strong>
                            <p>${new Date(pedido.data_emissao).toLocaleDateString('pt-BR')}</p>
                        </div>` : ''}
                    </div>
                    ${!pedido.local_entrega && !pedido.setor && !pedido.transportadora && !pedido.vendedor ? '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma informação de entrega disponível</p>' : ''}
                </div>

                <div class="modal-actions">
                    <button type="button" onclick="closeInfoModal()" class="secondary">Fechar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function switchViewTab(tabId) {
    document.querySelectorAll('#infoModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#infoModal .tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

function closeInfoModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// EDITAR PEDIDO
// ============================================
async function editPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) {
        showToast('Pedido não encontrado!', 'error');
        return;
    }
    
    editingId = id;
    itemCounter = 0;
    
    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content" style="max-width: 1400px;">
                <div class="modal-header">
                    <h3 class="modal-title">Editar Pedido de Faturamento</h3>
                    <button class="close-modal" onclick="closeFormModal()">✕</button>
                </div>
                
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchTab('tab-faturamento')">Faturamento</button>
                    <button class="tab-btn" onclick="switchTab('tab-pedido')">Pedido</button>
                    <button class="tab-btn" onclick="switchTab('tab-mercadoria')">Mercadoria</button>
                    <button class="tab-btn" onclick="switchTab('tab-entrega')">Entrega</button>
                </div>

                <form id="pedidoForm" onsubmit="handleSubmit(event)">
                    <input type="hidden" id="editId" value="${id}">
                    <input type="hidden" id="codigoPedido" value="${pedido.codigo}">
                    
                    <div class="tab-content active" id="tab-faturamento">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="codigoEdit">Código do Pedido</label>
                                <input type="number" id="codigoEdit" value="${pedido.codigo}" onchange="document.getElementById('codigoPedido').value = this.value" class="input-editable">
                            </div>
                            <div class="form-group">
                                <label for="cnpj">CNPJ *</label>
                                <input type="text" id="cnpj" value="${pedido.cnpj}" required onblur="buscarDadosCliente()">
                            </div>
                            <div class="form-group">
                                <label for="razaoSocial">Razão Social *</label>
                                <input type="text" id="razaoSocial" value="${toUpperCase(pedido.razao_social)}" required>
                            </div>
                            <div class="form-group">
                                <label for="inscricaoEstadual">Inscrição Estadual</label>
                                <input type="text" id="inscricaoEstadual" value="${toUpperCase(pedido.inscricao_estadual || '')}">
                            </div>
                            <div class="form-group">
                                <label for="endereco">Endereço</label>
                                <input type="text" id="endereco" value="${toUpperCase(pedido.endereco || '')}">
                            </div>
                            <div class="form-group">
                                <label for="telefone">Telefone</label>
                                <input type="text" id="telefone" value="${toUpperCase(pedido.telefone || '')}">
                            </div>
                            <div class="form-group">
                                <label for="contato">Contato</label>
                                <input type="text" id="contato" value="${toUpperCase(pedido.contato || '')}">
                            </div>
                            <div class="form-group">
                                <label for="email">E-mail</label>
                                <input type="email" id="email" value="${pedido.email || ''}" style="text-transform: lowercase !important;">
                            </div>
                            <div class="form-group">
                                <label for="documento">Documento</label>
                                <input type="text" id="documento" value="${toUpperCase(pedido.documento || '')}">
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="tab-pedido">
                        <button type="button" onclick="addItem()" class="success small" style="margin-bottom: 1rem;">+ Adicionar Item</button>
                        <div style="overflow-x: auto;">
                            <table class="items-table">
                                <thead>
                                    <tr>
                                        <th style="width: 40px;">Item</th>
                                        <th style="width: 120px;">Cód. Estoque</th>
                                        <th style="min-width: 200px;">Especificação</th>
                                        <th style="width: 80px;">Qtd</th>
                                        <th style="width: 80px;">Unid</th>
                                        <th style="width: 100px;">NCM</th>
                                        <th style="width: 100px;">Valor Un</th>
                                        <th style="width: 120px;">Total</th>
                                        <th style="width: 80px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="itemsBody"></tbody>
                            </table>
                        </div>
                        <div class="form-group" style="margin-top: 1rem;">
                            <label>Valor Total do Pedido</label>
                            <input type="text" id="valorTotalPedido" readonly value="${pedido.valor_total}" class="input-editable">
                        </div>
                    </div>

                    <div class="tab-content" id="tab-mercadoria">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="peso">Peso (Kg)</label>
                                <input type="number" id="peso" step="0.01" min="0" value="${pedido.peso || 0}">
                            </div>
                            <div class="form-group">
                                <label for="quantidade">Quantidade Total</label>
                                <input type="number" id="quantidade" min="0" value="${pedido.quantidade || 0}">
                            </div>
                            <div class="form-group">
                                <label for="volumes">Volume(s)</label>
                                <input type="number" id="volumes" min="0" value="${pedido.volumes || 0}">
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="tab-entrega">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="localEntrega">Local de Entrega</label>
                                <input type="text" id="localEntrega" value="${toUpperCase(pedido.local_entrega || '')}">
                            </div>
                            <div class="form-group">
                                <label for="setor">Setor</label>
                                <input type="text" id="setor" value="${toUpperCase(pedido.setor || '')}">
                            </div>
                            <div class="form-group">
                                <label for="previsaoEntrega">Previsão de Entrega</label>
                                <input type="date" id="previsaoEntrega" value="${pedido.previsao_entrega || ''}">
                            </div>
                            <div class="form-group">
                                <label for="transportadora">Transportadora</label>
                                <input type="text" id="transportadora" value="${toUpperCase(pedido.transportadora || '')}">
                            </div>
                            <div class="form-group">
                                <label for="valorFrete">Valor do Frete</label>
                                <input type="text" id="valorFrete" value="${pedido.valor_frete || ''}">
                            </div>
                            <div class="form-group">
                                <label for="vendedor">Vendedor</label>
                                <input type="text" id="vendedor" value="${toUpperCase(pedido.vendedor || '')}">
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button type="submit" style="background: var(--btn-save);">Atualizar Pedido</button>
                        <button type="button" onclick="closeFormModal()" class="secondary">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    if (pedido.items && pedido.items.length > 0) {
        pedido.items.forEach(item => {
            addItem();
            const row = document.querySelector('#itemsBody tr:last-child');
            if (row) {
                row.querySelector('.item-codigo').value = toUpperCase(item.codigoEstoque || '');
                row.querySelector('.item-especificacao').value = toUpperCase(item.especificacao || '');
                row.querySelector('.item-qtd').value = item.quantidade || 1;
                row.querySelector('.item-unid').value = toUpperCase(item.unidade || 'UN');
                row.querySelector('.item-ncm').value = item.ncm || '';
                row.querySelector('.item-valor').value = item.valorUnitario || 0;
                row.querySelector('.item-total').value = item.valorTotal || 'R$ 0,00';
            }
        });
    } else {
        addItem();
    }
    
    setTimeout(() => document.getElementById('razaoSocial').focus(), 100);
}

// EMITIR PEDIDO (Botão verde sem ação)
function emitirPedido(id) {
    // Botão verde sem funcionalidade por enquanto
}

// EXCLUIR PEDIDO
async function deletePedido(id) {
    if (!confirm('Tem certeza que deseja excluir este pedido?')) return;
    
    try {
        const response = await fetch(`${API_URL}/pedidos/${id}`, {
            method: 'DELETE',
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('pedidosSession');
            mostrarTelaAcessoNegado('Sua Sessão Expirou');
            return;
        }
        
        if (!response.ok) throw new Error('Erro ao excluir');
        
        showToast('Pedido excluído com sucesso!', 'success');
        await loadPedidos();
    } catch (error) {
        showToast('Erro ao excluir pedido', 'error');
    }
}

// TOAST
function showToast(message, type = 'success') {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// Fechar sugestões ao clicar fora
document.addEventListener('click', function(e) {
    if (!e.target.closest('.item-codigo')) {
        document.querySelectorAll('.suggestions-container').forEach(container => {
            container.innerHTML = '';
        });
    }
});

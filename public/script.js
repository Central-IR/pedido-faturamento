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
const tabs = ['tab-faturamento', 'tab-itens', 'tab-entrega', 'tab-transporte'];

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
    }, 3000);
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

async function inicializarApp() {
    await checkConnection();
    await loadPedidos();
    await loadEstoque();
    
    // Auto-completar inputs para uppercase
    document.querySelectorAll('input:not([type="checkbox"]):not([type="date"]):not([type="email"]):not([readonly]), textarea:not([readonly])').forEach(input => {
        input.addEventListener('input', (e) => {
            if (e.target.id !== 'email' && e.target.id !== 'valorUnitario' && !e.target.id.includes('valor')) {
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, end);
            }
        });
    });
    
    // Formatar CNPJ
    document.getElementById('cnpj')?.addEventListener('input', (e) => {
        e.target.value = formatarCNPJ(e.target.value);
    });
    
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
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
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

async function syncData() {
    if (!isOnline) {
        showMessage('Você está offline. Não é possível sincronizar.', 'error');
        return;
    }
    
    await loadPedidos();
    await loadEstoque();
    showMessage('Dados sincronizados com sucesso!', 'success');
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
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
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
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
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
        div.onclick = () => preencherDadosCliente(cnpjKey);
        suggestionsDiv.appendChild(div);
    });
    
    suggestionsDiv.style.display = 'block';
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
    document.getElementById('localEntrega').value = cliente.localEntrega || '';
    document.getElementById('setor').value = cliente.setor || '';
    document.getElementById('transportadora').value = cliente.transportadora || '';
    document.getElementById('valorFrete').value = cliente.valorFrete || '';
    document.getElementById('vendedor').value = cliente.vendedor || '';
    document.getElementById('peso').value = cliente.peso || '';
    document.getElementById('volumes').value = cliente.volumes || '';
    if (cliente.previsaoEntrega) {
        document.getElementById('previsaoEntrega').value = cliente.previsaoEntrega;
    }
    
    document.getElementById('cnpjSuggestions').style.display = 'none';
    showMessage('Dados do cliente preenchidos automaticamente!', 'success');
}

// ============================================
// ATUALIZAR DISPLAY
// ============================================
function updateDisplay() {
    const totalEmitidos = pedidos.filter(p => p.status === 'emitida').length;
    const totalPendentes = pedidos.filter(p => p.status === 'pendente').length;
    
    // Calcular valor total
    const valorTotalGeral = pedidos.reduce((acc, p) => {
        const valor = parseMoeda(p.valor_total);
        return acc + valor;
    }, 0);
    
    document.getElementById('totalPedidos').textContent = pedidos.length;
    document.getElementById('totalEmitidos').textContent = totalEmitidos;
    document.getElementById('totalPendentes').textContent = totalPendentes;
    document.getElementById('valorTotal').textContent = formatarMoeda(valorTotalGeral);
    
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
        select.innerHTML = '<option value="">TODOS</option>';
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
        container.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">NENHUM PEDIDO ENCONTRADO</td></tr>';
        return;
    }
    
    container.innerHTML = filtered.map(pedido => `
        <tr class="${pedido.status === 'emitida' ? 'row-emitida' : ''}">
            <td style="text-align: center;">
                <div class="checkbox-wrapper">
                    <input type="checkbox" 
                           class="styled-checkbox" 
                           id="check-${pedido.id}"
                           ${pedido.status === 'emitida' ? 'checked' : ''}
                           onchange="toggleEmissao(${pedido.id}, this.checked)">
                    <label for="check-${pedido.id}" class="checkbox-label-styled"></label>
                </div>
            </td>
            <td><strong>${pedido.codigo}</strong></td>
            <td>${toUpperCase(pedido.razao_social)}</td>
            <td>${formatarCNPJ(pedido.cnpj)}</td>
            <td>${toUpperCase(pedido.vendedor || '-')}</td>
            <td><strong>${pedido.valor_total || 'R$ 0,00'}</strong></td>
            <td>
                <span class="badge ${pedido.status}">
                    ${pedido.status === 'emitida' ? 'EMITIDA' : 'PENDENTE'}
                </span>
            </td>
            <td>
                <div class="actions">
                    <button onclick="viewPedido(${pedido.id})" class="action-btn" style="background: var(--btn-view);">
                        Ver
                    </button>
                    <button onclick="editPedido(${pedido.id})" class="action-btn" style="background: var(--btn-edit);">
                        Editar
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
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
                   onblur="verificarEstoque(${itemCounter})"
                   required>
            <div id="estoque-warning-${itemCounter}" style="color: var(--alert-color); font-size: 0.75rem; margin-top: 4px; display: none;"></div>
        </td>
        <td><textarea id="especificacao-${itemCounter}" rows="2"></textarea></td>
        <td>
            <select id="unidade-${itemCounter}" required>
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
                   onchange="calcularValorItem(${itemCounter}); verificarEstoque(${itemCounter})"
                   required>
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
            <button type="button" onclick="removeItem(${itemCounter})" class="danger small" style="padding: 6px 10px;">
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
    let quantidadeTotal = 0;
    
    document.querySelectorAll('[id^="item-"]').forEach(item => {
        const id = item.id.replace('item-', '');
        const valor = parseMoeda(document.getElementById(`valorTotal-${id}`).value);
        const qtd = parseFloat(document.getElementById(`quantidade-${id}`).value) || 0;
        
        valorTotal += valor;
        quantidadeTotal += qtd;
    });
    
    document.getElementById('valorTotalPedido').value = formatarMoeda(valorTotal);
    document.getElementById('quantidade').value = quantidadeTotal;
}

function verificarEstoque(itemId) {
    const codigoInput = document.getElementById(`codigoEstoque-${itemId}`);
    const quantidadeInput = document.getElementById(`quantidade-${itemId}`);
    const warningDiv = document.getElementById(`estoque-warning-${itemId}`);
    
    if (!codigoInput || !quantidadeInput || !warningDiv) return;
    
    const codigo = toUpperCase(codigoInput.value.trim());
    const quantidadeSolicitada = parseFloat(quantidadeInput.value) || 0;
    
    if (!codigo || quantidadeSolicitada === 0) {
        warningDiv.style.display = 'none';
        return;
    }
    
    const itemEstoque = estoqueCache[codigo];
    
    if (!itemEstoque) {
        warningDiv.textContent = `⚠️ CÓDIGO ${codigo} NÃO ENCONTRADO NO ESTOQUE`;
        warningDiv.style.display = 'block';
        return;
    }
    
    const quantidadeDisponivel = parseFloat(itemEstoque.quantidade_disponivel) || 0;
    
    if (quantidadeSolicitada > quantidadeDisponivel) {
        warningDiv.textContent = `⚠️ ITEM [${codigo}] É INSUFICIENTE (Disponível: ${quantidadeDisponivel})`;
        warningDiv.style.display = 'block';
    } else {
        warningDiv.style.display = 'none';
    }
}

function getItems() {
    const items = [];
    document.querySelectorAll('[id^="item-"]').forEach(item => {
        const id = item.id.replace('item-', '');
        const codigoEstoque = toUpperCase(document.getElementById(`codigoEstoque-${id}`).value.trim());
        const especificacao = toUpperCase(document.getElementById(`especificacao-${id}`).value.trim());
        const unidade = document.getElementById(`unidade-${id}`).value;
        const quantidade = parseFloat(document.getElementById(`quantidade-${id}`).value) || 0;
        const valorUnitario = parseFloat(document.getElementById(`valorUnitario-${id}`).value) || 0;
        const valorTotal = document.getElementById(`valorTotal-${id}`).value;
        const ncm = toUpperCase(document.getElementById(`ncm-${id}`).value.trim());
        
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
// MODAL DE FORMULÁRIO
// ============================================
function openFormModal() {
    editingId = null;
    currentTabIndex = 0;
    document.getElementById('formTitle').textContent = 'Novo Pedido de Faturamento';
    resetForm();
    
    // Gerar próximo código
    const maxCodigo = pedidos.length > 0 ? Math.max(...pedidos.map(p => parseInt(p.codigo) || 0)) : 0;
    document.getElementById('codigo').value = (maxCodigo + 1).toString();
    
    activateTab(0);
    document.getElementById('formModal').classList.add('show');
}

function closeFormModal() {
    document.getElementById('formModal').classList.remove('show');
    resetForm();
}

function resetForm() {
    document.querySelectorAll('#formModal input:not([type="checkbox"]), #formModal textarea, #formModal select').forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = false;
        } else {
            input.value = '';
        }
    });
    
    document.getElementById('itemsContainer').innerHTML = '';
    itemCounter = 0;
    addItem();
}

// ============================================
// SALVAR PEDIDO
// ============================================
async function savePedido() {
    // Validações básicas
    const codigo = document.getElementById('codigo').value.trim();
    const cnpj = document.getElementById('cnpj').value.replace(/\D/g, '');
    const razaoSocial = toUpperCase(document.getElementById('razaoSocial').value.trim());
    const endereco = toUpperCase(document.getElementById('endereco').value.trim());
    const vendedor = toUpperCase(document.getElementById('vendedor').value.trim());
    
    if (!codigo || !cnpj || !razaoSocial || !endereco || !vendedor) {
        showMessage('Preencha todos os campos obrigatórios!', 'error');
        return;
    }
    
    const items = getItems();
    if (items.length === 0) {
        showMessage('Adicione pelo menos um item ao pedido!', 'error');
        return;
    }
    
    // Verificar estoque
    let estoqueInsuficiente = false;
    items.forEach(item => {
        const itemEstoque = estoqueCache[item.codigoEstoque];
        if (!itemEstoque) {
            showMessage(`Código ${item.codigoEstoque} não encontrado no estoque!`, 'error');
            estoqueInsuficiente = true;
            return;
        }
        
        const quantidadeDisponivel = parseFloat(itemEstoque.quantidade_disponivel) || 0;
        if (item.quantidade > quantidadeDisponivel) {
            showMessage(`Item [${item.codigoEstoque}] é insuficiente!`, 'error');
            estoqueInsuficiente = true;
        }
    });
    
    if (estoqueInsuficiente) return;
    
    const pedido = {
        codigo,
        cnpj,
        razao_social: razaoSocial,
        inscricao_estadual: toUpperCase(document.getElementById('inscricaoEstadual').value.trim()),
        endereco,
        telefone: toUpperCase(document.getElementById('telefone').value.trim()),
        contato: toUpperCase(document.getElementById('contato').value.trim()),
        email: document.getElementById('email').value.trim().toLowerCase(),
        documento: toUpperCase(document.getElementById('documento').value.trim()),
        items,
        valor_total: document.getElementById('valorTotalPedido').value,
        peso: document.getElementById('peso').value,
        quantidade: document.getElementById('quantidade').value,
        volumes: document.getElementById('volumes').value,
        local_entrega: toUpperCase(document.getElementById('localEntrega').value.trim()),
        setor: toUpperCase(document.getElementById('setor').value.trim()),
        previsao_entrega: document.getElementById('previsaoEntrega').value,
        transportadora: toUpperCase(document.getElementById('transportadora').value.trim()),
        valor_frete: document.getElementById('valorFrete').value,
        vendedor,
        status: 'pendente'
    };
    
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
        
        if (!response.ok) throw new Error('Erro ao salvar pedido');
        
        await loadPedidos();
        closeFormModal();
        
        if (editingId) {
            showMessage(`Pedido ${codigo} atualizado com sucesso!`, 'success');
        } else {
            showMessage(`Pedido ${codigo} registrado!`, 'success');
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
    
    // Preencher campos
    document.getElementById('codigo').value = pedido.codigo;
    document.getElementById('cnpj').value = formatarCNPJ(pedido.cnpj);
    document.getElementById('razaoSocial').value = toUpperCase(pedido.razao_social);
    document.getElementById('inscricaoEstadual').value = toUpperCase(pedido.inscricao_estadual || '');
    document.getElementById('endereco').value = toUpperCase(pedido.endereco);
    document.getElementById('telefone').value = toUpperCase(pedido.telefone || '');
    document.getElementById('contato').value = toUpperCase(pedido.contato || '');
    document.getElementById('email').value = pedido.email || '';
    document.getElementById('documento').value = toUpperCase(pedido.documento || '');
    document.getElementById('valorTotalPedido').value = pedido.valor_total;
    document.getElementById('peso').value = pedido.peso || '';
    document.getElementById('quantidade').value = pedido.quantidade || '';
    document.getElementById('volumes').value = pedido.volumes || '';
    document.getElementById('localEntrega').value = toUpperCase(pedido.local_entrega || '');
    document.getElementById('setor').value = toUpperCase(pedido.setor || '');
    document.getElementById('previsaoEntrega').value = pedido.previsao_entrega || '';
    document.getElementById('transportadora').value = toUpperCase(pedido.transportadora || '');
    document.getElementById('valorFrete').value = pedido.valor_frete || '';
    document.getElementById('vendedor').value = toUpperCase(pedido.vendedor || '');
    
    // Preencher itens
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
                           onblur="verificarEstoque(${itemCounter})"
                           required>
                    <div id="estoque-warning-${itemCounter}" style="color: var(--alert-color); font-size: 0.75rem; margin-top: 4px; display: none;"></div>
                </td>
                <td><textarea id="especificacao-${itemCounter}" rows="2">${item.especificacao || ''}</textarea></td>
                <td>
                    <select id="unidade-${itemCounter}" required>
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
                           onchange="calcularValorItem(${itemCounter}); verificarEstoque(${itemCounter})"
                           required>
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
                    <button type="button" onclick="removeItem(${itemCounter})" class="danger small" style="padding: 6px 10px;">
                        ✕
                    </button>
                </td>
            `;
            container.appendChild(tr);
        });
    }
    
    activateTab(0);
    document.getElementById('formModal').classList.add('show');
}

// ============================================
// VISUALIZAR PEDIDO
// ============================================
function viewPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    document.getElementById('modalCodigo').textContent = pedido.codigo;
    
    // Tab Faturamento
    document.getElementById('info-tab-faturamento').innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Código</label>
                <input type="text" value="${pedido.codigo}" readonly>
            </div>
            <div class="form-group">
                <label>CNPJ</label>
                <input type="text" value="${formatarCNPJ(pedido.cnpj)}" readonly>
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
                <label>Razão Social</label>
                <input type="text" value="${toUpperCase(pedido.razao_social)}" readonly>
            </div>
            <div class="form-group">
                <label>Inscrição Estadual</label>
                <input type="text" value="${toUpperCase(pedido.inscricao_estadual || '-')}" readonly>
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
                <label>Endereço</label>
                <input type="text" value="${toUpperCase(pedido.endereco)}" readonly>
            </div>
            <div class="form-group">
                <label>Telefone</label>
                <input type="text" value="${toUpperCase(pedido.telefone || '-')}" readonly>
            </div>
            <div class="form-group">
                <label>Contato</label>
                <input type="text" value="${toUpperCase(pedido.contato || '-')}" readonly>
            </div>
            <div class="form-group">
                <label>E-mail</label>
                <input type="text" value="${pedido.email || '-'}" readonly>
            </div>
            <div class="form-group">
                <label>Documento</label>
                <input type="text" value="${toUpperCase(pedido.documento || '-')}" readonly>
            </div>
        </div>
    `;
    
    // Tab Itens
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    document.getElementById('info-tab-itens').innerHTML = `
        <div style="overflow-x: auto;">
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
        <div class="form-grid" style="margin-top: 1.5rem;">
            <div class="form-group">
                <label>Valor Total</label>
                <input type="text" value="${pedido.valor_total || 'R$ 0,00'}" readonly>
            </div>
            <div class="form-group">
                <label>Peso (kg)</label>
                <input type="text" value="${pedido.peso || '-'}" readonly>
            </div>
            <div class="form-group">
                <label>Quantidade Total</label>
                <input type="text" value="${pedido.quantidade || '-'}" readonly>
            </div>
            <div class="form-group">
                <label>Volumes</label>
                <input type="text" value="${pedido.volumes || '-'}" readonly>
            </div>
        </div>
    `;
    
    // Tab Entrega
    document.getElementById('info-tab-entrega').innerHTML = `
        <div class="form-grid">
            <div class="form-group" style="grid-column: 1 / -1;">
                <label>Local de Entrega</label>
                <textarea readonly rows="3">${toUpperCase(pedido.local_entrega || '-')}</textarea>
            </div>
            <div class="form-group">
                <label>Setor</label>
                <input type="text" value="${toUpperCase(pedido.setor || '-')}" readonly>
            </div>
            <div class="form-group">
                <label>Previsão de Entrega</label>
                <input type="text" value="${pedido.previsao_entrega ? new Date(pedido.previsao_entrega).toLocaleDateString('pt-BR') : '-'}" readonly>
            </div>
        </div>
    `;
    
    // Tab Transporte
    document.getElementById('info-tab-transporte').innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Transportadora</label>
                <input type="text" value="${toUpperCase(pedido.transportadora || '-')}" readonly>
            </div>
            <div class="form-group">
                <label>Valor do Frete</label>
                <input type="text" value="${pedido.valor_frete || '-'}" readonly>
            </div>
            <div class="form-group">
                <label>Vendedor</label>
                <input type="text" value="${toUpperCase(pedido.vendedor || '-')}" readonly>
            </div>
            <div class="form-group">
                <label>Status</label>
                <input type="text" value="${pedido.status === 'emitida' ? 'EMITIDA' : 'PENDENTE'}" readonly>
            </div>
        </div>
    `;
    
    switchInfoTab('info-tab-faturamento');
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
        // Confirmar emissão
        const items = Array.isArray(pedido.items) ? pedido.items : [];
        let mensagem = `Confirmar emissão do pedido ${pedido.codigo}?\n\n`;
        mensagem += 'Os seguintes itens serão debitados do estoque:\n\n';
        items.forEach(item => {
            mensagem += `- ${item.codigoEstoque}: ${item.quantidade} ${item.unidade}\n`;
        });
        
        if (!confirm(mensagem)) {
            document.getElementById(`check-${id}`).checked = false;
            return;
        }
        
        // Verificar disponibilidade
        let estoqueInsuficiente = false;
        for (const item of items) {
            const itemEstoque = estoqueCache[item.codigoEstoque];
            if (!itemEstoque) {
                showMessage(`Código ${item.codigoEstoque} não encontrado no estoque!`, 'error');
                document.getElementById(`check-${id}`).checked = false;
                return;
            }
            
            const quantidadeDisponivel = parseFloat(itemEstoque.quantidade_disponivel) || 0;
            if (item.quantidade > quantidadeDisponivel) {
                showMessage(`Item [${item.codigoEstoque}] é insuficiente!`, 'error');
                estoqueInsuficiente = true;
            }
        }
        
        if (estoqueInsuficiente) {
            document.getElementById(`check-${id}`).checked = false;
            return;
        }
        
        // Debitar estoque
        try {
            for (const item of items) {
                const itemEstoque = estoqueCache[item.codigoEstoque];
                const novaQuantidade = parseFloat(itemEstoque.quantidade_disponivel) - item.quantidade;
                
                const response = await fetch(`${API_URL}/estoque/${item.codigoEstoque}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Token': sessionToken
                    },
                    body: JSON.stringify({
                        quantidade_disponivel: novaQuantidade
                    })
                });
                
                if (!response.ok) throw new Error('Erro ao atualizar estoque');
            }
            
            // Atualizar status do pedido
            const response = await fetch(`${API_URL}/pedidos/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify({
                    status: 'emitida',
                    data_emissao: new Date().toISOString()
                })
            });
            
            if (!response.ok) throw new Error('Erro ao atualizar pedido');
            
            await loadPedidos();
            await loadEstoque();
            showMessage(`O pedido ${pedido.codigo} foi emitido!`, 'success');
        } catch (error) {
            console.error('Erro ao emitir:', error);
            showMessage('Erro ao emitir pedido!', 'error');
            document.getElementById(`check-${id}`).checked = false;
        }
    } else if (!checked && pedido.status === 'emitida') {
        // Reverter emissão
        if (!confirm(`Reverter emissão do pedido ${pedido.codigo}?\n\nAs quantidades retornarão ao estoque.`)) {
            document.getElementById(`check-${id}`).checked = true;
            return;
        }
        
        try {
            const items = Array.isArray(pedido.items) ? pedido.items : [];
            
            // Creditar estoque
            for (const item of items) {
                const itemEstoque = estoqueCache[item.codigoEstoque];
                if (!itemEstoque) continue;
                
                const novaQuantidade = parseFloat(itemEstoque.quantidade_disponivel) + item.quantidade;
                
                const response = await fetch(`${API_URL}/estoque/${item.codigoEstoque}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Token': sessionToken
                    },
                    body: JSON.stringify({
                        quantidade_disponivel: novaQuantidade
                    })
                });
                
                if (!response.ok) throw new Error('Erro ao atualizar estoque');
            }
            
            // Atualizar status do pedido
            const response = await fetch(`${API_URL}/pedidos/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify({
                    status: 'pendente',
                    data_emissao: null
                })
            });
            
            if (!response.ok) throw new Error('Erro ao atualizar pedido');
            
            await loadPedidos();
            await loadEstoque();
            showMessage(`Emissão do pedido ${pedido.codigo} revertida!`, 'success');
        } catch (error) {
            console.error('Erro ao reverter:', error);
            showMessage('Erro ao reverter emissão!', 'error');
            document.getElementById(`check-${id}`).checked = true;
        }
    }
}

// ============================================
// EXPORTAR PDF (PLACEHOLDER)
// ============================================
function exportarPDF() {
    showMessage('Funcionalidade de exportação em desenvolvimento', 'success');
}

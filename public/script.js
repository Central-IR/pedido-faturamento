// ============================================
// CONFIGURAÇÃO
// ============================================
const SUPABASE_URL = 'SUA_URL_SUPABASE';
const SUPABASE_KEY = 'SUA_CHAVE_SUPABASE';

let pedidos = [];
let estoque = [];
let isOnline = false;
let itemCounter = 0;
let clientesCache = {};
let editingId = null;
let currentTabIndex = 0;
let selectedMonth = new Date().getMonth();
let selectedYear = new Date().getFullYear();
let etiquetaPedidoId = null;

const tabs = ['tab-geral', 'tab-faturamento', 'tab-contato', 'tab-itens', 'tab-entrega', 'tab-transporte'];
const infoTabs = ['info-tab-geral', 'info-tab-faturamento', 'info-tab-contato', 'info-tab-itens', 'info-tab-entrega', 'info-tab-transporte'];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
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

function formatMoedaInput(input) {
    let valor = input.value.replace(/\D/g, '');
    if (valor) {
        valor = (parseInt(valor) / 100).toFixed(2);
        input.value = formatarMoeda(valor);
    }
}

function showMessage(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `floating-message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.animation = 'slideOutBottom 0.3s ease forwards';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await inicializarApp();
    
    // Event listener para formulário
    const form = document.getElementById('pedidoForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await savePedido();
        });
    }
});

async function inicializarApp() {
    await checkConnection();
    await loadPedidos();
    await loadEstoque();
    updateMonthDisplay();
    renderCalendar();
    
    setInterval(checkConnection, 15000);
    setInterval(() => {
        if (isOnline) {
            loadPedidos();
            loadEstoque();
        }
    }, 10000);
}

// ============================================
// CONEXÃO
// ============================================
async function checkConnection() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedido_faturamento`, {
            method: 'HEAD',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ Servidor ONLINE');
            await loadPedidos();
            await loadEstoque();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
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
    
    try {
        await loadPedidos();
        await loadEstoque();
        showMessage('Dados sincronizados', 'success');
    } catch (error) {
        showMessage('Erro ao sincronizar', 'error');
    }
}

// ============================================
// CARREGAR DADOS
// ============================================
async function loadPedidos() {
    if (!isOnline) return;
    
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedido_faturamento?select=*&order=codigo.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            pedidos = await response.json();
            atualizarCacheClientes();
            updateDisplay();
        }
    } catch (error) {
        console.error('Erro ao carregar pedidos:', error);
    }
}

async function loadEstoque() {
    if (!isOnline) return;
    
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/estoque?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (response.ok) {
            estoque = await response.json();
            console.log(`📦 ${estoque.length} itens carregados do estoque`);
        }
    } catch (error) {
        console.error('Erro ao carregar estoque:', error);
    }
}

// ============================================
// CACHE DE CLIENTES
// ============================================
function atualizarCacheClientes() {
    clientesCache = {};
    pedidos.forEach(pedido => {
        const cnpj = pedido.cnpj?.trim();
        if (cnpj && !clientesCache[cnpj]) {
            clientesCache[cnpj] = {
                razaoSocial: pedido.razao_social,
                inscricaoEstadual: pedido.inscricao_estadual,
                endereco: pedido.endereco,
                bairro: pedido.bairro,
                municipio: pedido.municipio,
                uf: pedido.uf,
                numero: pedido.numero,
                telefone: pedido.telefone,
                contato: pedido.contato,
                email: pedido.email,
                localEntrega: pedido.local_entrega,
                setor: pedido.setor,
                transportadora: pedido.transportadora,
                frete: pedido.frete,
                vendedor: pedido.vendedor
            };
        }
    });
    console.log(`👥 ${Object.keys(clientesCache).length} clientes em cache`);
}

function handleCNPJInput(cnpj) {
    const cnpjFormatado = formatarCNPJ(cnpj);
    document.getElementById('cnpj').value = cnpjFormatado;
    
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const datalist = document.getElementById('cnpjSuggestions');
    datalist.innerHTML = '';
    
    // Buscar CNPJs similares
    const cnpjsSimilares = Object.keys(clientesCache).filter(c => 
        c.includes(cnpjLimpo)
    );
    
    cnpjsSimilares.forEach(cnpjCache => {
        const option = document.createElement('option');
        option.value = formatarCNPJ(cnpjCache);
        option.textContent = `${formatarCNPJ(cnpjCache)} - ${clientesCache[cnpjCache].razaoSocial}`;
        datalist.appendChild(option);
    });
    
    // Se CNPJ existe no cache, preencher dados
    if (clientesCache[cnpjLimpo]) {
        preencherDadosCliente(cnpjLimpo);
    }
}

function preencherDadosCliente(cnpj) {
    const cliente = clientesCache[cnpj];
    if (!cliente) return;
    
    document.getElementById('razao_social').value = cliente.razaoSocial || '';
    document.getElementById('inscricao_estadual').value = cliente.inscricaoEstadual || '';
    document.getElementById('endereco').value = cliente.endereco || '';
    document.getElementById('bairro').value = cliente.bairro || '';
    document.getElementById('municipio').value = cliente.municipio || '';
    document.getElementById('uf').value = cliente.uf || '';
    document.getElementById('numero').value = cliente.numero || '';
    document.getElementById('telefone').value = cliente.telefone || '';
    document.getElementById('contato').value = cliente.contato || '';
    document.getElementById('email').value = cliente.email || '';
    document.getElementById('local_entrega').value = cliente.localEntrega || '';
    document.getElementById('setor').value = cliente.setor || '';
    document.getElementById('transportadora').value = cliente.transportadora || '';
    document.getElementById('frete').value = cliente.frete || '';
    document.getElementById('vendedor').value = cliente.vendedor || '';
}

// ============================================
// ATUALIZAR DISPLAY
// ============================================
function updateDisplay() {
    updateDashboard();
    renderPedidos();
}

function updateDashboard() {
    const filteredPedidos = getFilteredPedidos();
    
    const totalPedidos = filteredPedidos.length;
    const totalEmitidos = filteredPedidos.filter(p => p.status === 'emitido').length;
    const totalPendentes = filteredPedidos.filter(p => p.status === 'pendente' || !p.status).length;
    
    const valorTotal = filteredPedidos.reduce((sum, p) => {
        const itens = typeof p.itens === 'string' ? JSON.parse(p.itens || '[]') : (p.itens || []);
        const total = itens.reduce((s, item) => s + (parseFloat(item.valor_total) || 0), 0);
        return sum + total;
    }, 0);
    
    document.getElementById('totalPedidos').textContent = totalPedidos;
    document.getElementById('totalEmitidos').textContent = totalEmitidos;
    document.getElementById('totalPendentes').textContent = totalPendentes;
    document.getElementById('valorTotal').textContent = formatarMoeda(valorTotal);
}

function getFilteredPedidos() {
    return pedidos.filter(pedido => {
        const data = new Date(pedido.created_at || pedido.timestamp);
        const month = data.getMonth();
        const year = data.getFullYear();
        return month === selectedMonth && year === selectedYear;
    });
}

function renderPedidos() {
    const container = document.getElementById('pedidosContainer');
    if (!container) return;
    
    let filteredPedidos = getFilteredPedidos();
    
    // Aplicar filtros
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    
    if (searchTerm) {
        filteredPedidos = filteredPedidos.filter(p =>
            p.codigo?.toString().includes(searchTerm) ||
            p.cnpj?.toLowerCase().includes(searchTerm) ||
            p.razao_social?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (statusFilter) {
        filteredPedidos = filteredPedidos.filter(p => 
            (p.status || 'pendente') === statusFilter
        );
    }
    
    if (filteredPedidos.length === 0) {
        container.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">Nenhum pedido encontrado</td></tr>';
        return;
    }
    
    container.innerHTML = filteredPedidos.map(pedido => {
        const itens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens || '[]') : (pedido.itens || []);
        const valorTotal = itens.reduce((sum, item) => sum + (parseFloat(item.valor_total) || 0), 0);
        const data = new Date(pedido.created_at || pedido.timestamp);
        const status = pedido.status || 'pendente';
        
        return `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" data-id="${pedido.id}">
                </td>
                <td>${pedido.codigo || '-'}</td>
                <td>${pedido.cnpj ? formatarCNPJ(pedido.cnpj) : '-'}</td>
                <td>${pedido.razao_social || '-'}</td>
                <td>${data.toLocaleDateString('pt-BR')}</td>
                <td>${formatarMoeda(valorTotal)}</td>
                <td>
                    <span class="status-badge status-${status}">
                        ${status === 'emitido' ? 'Emitido' : 'Pendente'}
                    </span>
                </td>
                <td class="actions-cell" style="text-align: center;">
                    <button onclick="viewPedido('${pedido.id}')" class="action-btn view" title="Visualizar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <button onclick="editPedido('${pedido.id}')" class="action-btn edit" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button onclick="openEtiquetaModal('${pedido.id}')" class="action-btn success" title="Imprimir Etiqueta">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                            <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                            <line x1="12" y1="22" x2="12" y2="12"></line>
                        </svg>
                    </button>
                    <button onclick="deletePedido('${pedido.id}')" class="action-btn delete" title="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="m19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterPedidos() {
    renderPedidos();
}

// ============================================
// MODAL DE FORMULÁRIO
// ============================================
function openFormModal() {
    editingId = null;
    currentTabIndex = 0;
    itemCounter = 0;
    
    document.getElementById('modalTitle').textContent = 'Novo Pedido';
    document.getElementById('pedidoForm').reset();
    document.getElementById('codigo').value = 'Gerado automaticamente';
    document.getElementById('itensTableBody').innerHTML = '';
    
    // Resetar abas
    tabs.forEach((tabId, index) => {
        document.getElementById(tabId).classList.toggle('active', index === 0);
        document.querySelectorAll('.tab-btn')[index].classList.toggle('active', index === 0);
    });
    
    updateNavigationButtons();
    document.getElementById('formModal').classList.add('show');
}

function closeFormModal() {
    if (confirm('Deseja cancelar? Os dados não salvos serão perdidos.')) {
        document.getElementById('formModal').classList.remove('show');
        showMessage('Pedido cancelado', 'error');
    }
}

function editPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    editingId = id;
    currentTabIndex = 0;
    
    document.getElementById('modalTitle').textContent = `Editar Pedido Nº ${pedido.codigo}`;
    document.getElementById('codigo').value = pedido.codigo || 'Gerado automaticamente';
    document.getElementById('documento').value = pedido.documento || '';
    document.getElementById('cnpj').value = pedido.cnpj ? formatarCNPJ(pedido.cnpj) : '';
    document.getElementById('razao_social').value = pedido.razao_social || '';
    document.getElementById('inscricao_estadual').value = pedido.inscricao_estadual || '';
    document.getElementById('endereco').value = pedido.endereco || '';
    document.getElementById('bairro').value = pedido.bairro || '';
    document.getElementById('municipio').value = pedido.municipio || '';
    document.getElementById('uf').value = pedido.uf || '';
    document.getElementById('numero').value = pedido.numero || '';
    document.getElementById('telefone').value = pedido.telefone || '';
    document.getElementById('contato').value = pedido.contato || '';
    document.getElementById('email').value = pedido.email || '';
    document.getElementById('peso').value = pedido.peso || '';
    document.getElementById('quantidade_total').value = pedido.quantidade_total || '';
    document.getElementById('volumes').value = pedido.volumes || '';
    document.getElementById('local_entrega').value = pedido.local_entrega || '';
    document.getElementById('setor').value = pedido.setor || '';
    document.getElementById('previsao_entrega').value = pedido.previsao_entrega || '';
    document.getElementById('transportadora').value = pedido.transportadora || '';
    document.getElementById('frete').value = pedido.frete ? formatarMoeda(pedido.frete) : '';
    document.getElementById('vendedor').value = pedido.vendedor || '';
    
    // Carregar itens
    const itens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens || '[]') : (pedido.itens || []);
    document.getElementById('itensTableBody').innerHTML = '';
    itemCounter = 0;
    
    itens.forEach(item => {
        adicionarItem(item);
    });
    
    // Resetar abas
    tabs.forEach((tabId, index) => {
        document.getElementById(tabId).classList.toggle('active', index === 0);
        document.querySelectorAll('.tab-btn')[index].classList.toggle('active', index === 0);
    });
    
    updateNavigationButtons();
    document.getElementById('formModal').classList.add('show');
}

async function savePedido() {
    // Coletar dados do formulário
    const itensTableBody = document.getElementById('itensTableBody');
    const itens = [];
    
    itensTableBody.querySelectorAll('tr').forEach(row => {
        const item = {
            item: row.querySelector('[data-field="item"]').value,
            estoque: row.querySelector('[data-field="estoque"]').value,
            descricao: row.querySelector('[data-field="descricao"]').value,
            ncm: row.querySelector('[data-field="ncm"]').value,
            un: row.querySelector('[data-field="un"]').value,
            qtd: row.querySelector('[data-field="qtd"]').value,
            valor_unitario: row.querySelector('[data-field="valor_unitario"]').value,
            valor_total: row.querySelector('[data-field="valor_total"]').value
        };
        itens.push(item);
    });
    
    const pedidoData = {
        documento: document.getElementById('documento').value,
        cnpj: document.getElementById('cnpj').value.replace(/\D/g, ''),
        razao_social: document.getElementById('razao_social').value,
        inscricao_estadual: document.getElementById('inscricao_estadual').value,
        endereco: document.getElementById('endereco').value,
        bairro: document.getElementById('bairro').value,
        municipio: document.getElementById('municipio').value,
        uf: document.getElementById('uf').value,
        numero: document.getElementById('numero').value,
        telefone: document.getElementById('telefone').value,
        contato: document.getElementById('contato').value,
        email: document.getElementById('email').value,
        itens: JSON.stringify(itens),
        peso: parseFloat(document.getElementById('peso').value) || 0,
        quantidade_total: parseInt(document.getElementById('quantidade_total').value) || 0,
        volumes: parseInt(document.getElementById('volumes').value) || 0,
        local_entrega: document.getElementById('local_entrega').value,
        setor: document.getElementById('setor').value,
        previsao_entrega: document.getElementById('previsao_entrega').value,
        transportadora: document.getElementById('transportadora').value,
        frete: parseMoeda(document.getElementById('frete').value),
        vendedor: document.getElementById('vendedor').value,
        status: 'pendente'
    };
    
    try {
        let response;
        
        if (editingId) {
            // Atualizar pedido existente
            response = await fetch(`${SUPABASE_URL}/rest/v1/pedido_faturamento?id=eq.${editingId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(pedidoData)
            });
            
            if (response.ok) {
                const updatedPedido = await response.json();
                showMessage(`Pedido ${updatedPedido[0].codigo} atualizado`, 'success');
            }
        } else {
            // Criar novo pedido
            // Gerar código
            const maxCodigo = pedidos.length > 0 ? Math.max(...pedidos.map(p => p.codigo || 0)) : 0;
            pedidoData.codigo = maxCodigo + 1;
            
            response = await fetch(`${SUPABASE_URL}/rest/v1/pedido_faturamento`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(pedidoData)
            });
            
            if (response.ok) {
                const newPedido = await response.json();
                showMessage(`Pedido ${newPedido[0].codigo} registrado`, 'success');
            }
        }
        
        if (response.ok) {
            await loadPedidos();
            document.getElementById('formModal').classList.remove('show');
        } else {
            showMessage('Erro ao salvar pedido', 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar pedido:', error);
        showMessage('Erro ao salvar pedido', 'error');
    }
}

async function deletePedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    if (!confirm(`Deseja realmente excluir o pedido ${pedido.codigo}?`)) return;
    
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedido_faturamento?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (response.ok) {
            showMessage(`Pedido ${pedido.codigo} excluído`, 'error');
            await loadPedidos();
        } else {
            showMessage('Erro ao excluir pedido', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir pedido:', error);
        showMessage('Erro ao excluir pedido', 'error');
    }
}

// ============================================
// GESTÃO DE ITENS
// ============================================
function adicionarItem(itemData = null) {
    itemCounter++;
    const tbody = document.getElementById('itensTableBody');
    const row = tbody.insertRow();
    
    row.innerHTML = `
        <td><input type="text" data-field="item" value="${itemData?.item || itemCounter}" readonly style="width: 40px; text-align: center; background: #f5f5f5;"></td>
        <td><input type="text" data-field="estoque" value="${itemData?.estoque || ''}" onchange="buscarEstoque(this)" placeholder="Código"></td>
        <td><input type="text" data-field="descricao" value="${itemData?.descricao || ''}" style="min-width: 180px;"></td>
        <td><input type="text" data-field="ncm" value="${itemData?.ncm || ''}" readonly style="background: #f5f5f5;"></td>
        <td><input type="text" data-field="un" value="${itemData?.un || ''}" style="width: 50px;"></td>
        <td><input type="number" data-field="qtd" value="${itemData?.qtd || ''}" onchange="calcularValorTotal(this)" step="1" min="0"></td>
        <td><input type="number" data-field="valor_unitario" value="${itemData?.valor_unitario || ''}" onchange="calcularValorTotal(this)" step="0.0001" min="0"></td>
        <td><input type="text" data-field="valor_total" value="${itemData?.valor_total || '0.00'}" readonly style="background: #f5f5f5;"></td>
        <td style="text-align: center;">
            <button type="button" onclick="removerItem(this)" class="btn-remove-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="m19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </td>
    `;
    
    calcularSomaTotal();
}

function removerItem(button) {
    const row = button.closest('tr');
    row.remove();
    calcularSomaTotal();
}

function buscarEstoque(input) {
    const codigo = input.value.trim().toUpperCase();
    if (!codigo) return;
    
    const item = estoque.find(e => 
        String(e.codigo).toUpperCase() === codigo ||
        String(e.codigo_fornecedor).toUpperCase() === codigo
    );
    
    if (item) {
        const row = input.closest('tr');
        row.querySelector('[data-field="descricao"]').value = item.descricao || '';
        row.querySelector('[data-field="ncm"]').value = item.ncm || '';
        row.querySelector('[data-field="valor_unitario"]').value = item.valor_unitario || '';
        
        // Verificar quantidade em estoque
        const qtdInput = row.querySelector('[data-field="qtd"]');
        if (qtdInput.value) {
            const qtdSolicitada = parseFloat(qtdInput.value);
            if (qtdSolicitada > item.quantidade) {
                showMessage(`A quantidade em estoque para o item ${codigo} é insuficiente para atender o pedido`, 'error');
            }
        }
        
        calcularValorTotal(row.querySelector('[data-field="qtd"]'));
    } else {
        showMessage(`Item ${codigo} não encontrado no estoque`, 'error');
    }
}

function calcularValorTotal(input) {
    const row = input.closest('tr');
    const qtd = parseFloat(row.querySelector('[data-field="qtd"]').value) || 0;
    const valorUnitario = parseFloat(row.querySelector('[data-field="valor_unitario"]').value) || 0;
    const valorTotal = qtd * valorUnitario;
    
    row.querySelector('[data-field="valor_total"]').value = valorTotal.toFixed(4);
    calcularSomaTotal();
}

function calcularSomaTotal() {
    const tbody = document.getElementById('itensTableBody');
    let soma = 0;
    
    tbody.querySelectorAll('tr').forEach(row => {
        const valorTotal = parseFloat(row.querySelector('[data-field="valor_total"]').value) || 0;
        soma += valorTotal;
    });
    
    document.getElementById('somaValorTotal').textContent = formatarMoeda(soma);
}

// ============================================
// NAVEGAÇÃO DE ABAS
// ============================================
function switchTab(tabId) {
    currentTabIndex = tabs.indexOf(tabId);
    
    tabs.forEach(id => {
        document.getElementById(id).classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.tab-btn')[currentTabIndex].classList.add('active');
    
    updateNavigationButtons();
}

function nextTab() {
    if (currentTabIndex < tabs.length - 1) {
        currentTabIndex++;
        switchTab(tabs[currentTabIndex]);
    }
}

function previousTab() {
    if (currentTabIndex > 0) {
        currentTabIndex--;
        switchTab(tabs[currentTabIndex]);
    }
}

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    
    if (btnPrevious) {
        btnPrevious.style.display = currentTabIndex > 0 ? 'inline-flex' : 'none';
    }
    
    if (btnNext) {
        btnNext.style.display = currentTabIndex < tabs.length - 1 ? 'inline-flex' : 'none';
    }
    
    if (btnSave) {
        btnSave.style.display = currentTabIndex === tabs.length - 1 ? 'inline-flex' : 'none';
    }
}

// ============================================
// MODAL DE VISUALIZAÇÃO
// ============================================
function viewPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    
    document.getElementById('modalNumero').textContent = pedido.codigo || '-';
    
    // Aba Geral
    document.getElementById('info-tab-geral').innerHTML = `
        <div class="info-section">
            <p><strong>Código:</strong> ${pedido.codigo || '-'}</p>
            <p><strong>Documento:</strong> ${pedido.documento || '-'}</p>
            <p><strong>Status:</strong> <span class="status-badge status-${pedido.status || 'pendente'}">${pedido.status === 'emitido' ? 'Emitido' : 'Pendente'}</span></p>
        </div>
    `;
    
    // Aba Faturamento
    document.getElementById('info-tab-faturamento').innerHTML = `
        <div class="info-section">
            <p><strong>CNPJ:</strong> ${pedido.cnpj ? formatarCNPJ(pedido.cnpj) : '-'}</p>
            <p><strong>Razão Social:</strong> ${pedido.razao_social || '-'}</p>
            <p><strong>Inscrição Estadual:</strong> ${pedido.inscricao_estadual || '-'}</p>
            <p><strong>Endereço:</strong> ${pedido.endereco || '-'}</p>
            <p><strong>Bairro:</strong> ${pedido.bairro || '-'}</p>
            <p><strong>Município:</strong> ${pedido.municipio || '-'}</p>
            <p><strong>UF:</strong> ${pedido.uf || '-'}</p>
            <p><strong>Número:</strong> ${pedido.numero || '-'}</p>
        </div>
    `;
    
    // Aba Contato
    document.getElementById('info-tab-contato').innerHTML = `
        <div class="info-section">
            <p><strong>Telefone:</strong> ${pedido.telefone || '-'}</p>
            <p><strong>Contato:</strong> ${pedido.contato || '-'}</p>
            <p><strong>E-mail:</strong> ${pedido.email || '-'}</p>
        </div>
    `;
    
    // Aba Itens
    const itens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens || '[]') : (pedido.itens || []);
    const itensHtml = itens.map(item => `
        <tr>
            <td>${item.item}</td>
            <td>${item.estoque}</td>
            <td>${item.descricao}</td>
            <td>${item.ncm}</td>
            <td>${item.un}</td>
            <td>${item.qtd}</td>
            <td>${item.valor_unitario}</td>
            <td>${item.valor_total}</td>
        </tr>
    `).join('');
    
    const valorTotalItens = itens.reduce((sum, item) => sum + (parseFloat(item.valor_total) || 0), 0);
    
    document.getElementById('info-tab-itens').innerHTML = `
        <div class="info-section">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Estoque</th>
                        <th>Descrição</th>
                        <th>NCM</th>
                        <th>UN</th>
                        <th>QTD</th>
                        <th>Valor Unit.</th>
                        <th>Valor Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itensHtml}
                </tbody>
            </table>
            <div style="margin-top: 1rem;">
                <p><strong>Valor Total:</strong> ${formatarMoeda(valorTotalItens)}</p>
                <p><strong>Peso (Kg):</strong> ${pedido.peso || '-'}</p>
                <p><strong>Quantidade Total:</strong> ${pedido.quantidade_total || '-'}</p>
                <p><strong>Volumes:</strong> ${pedido.volumes || '-'}</p>
            </div>
        </div>
    `;
    
    // Aba Entrega
    document.getElementById('info-tab-entrega').innerHTML = `
        <div class="info-section">
            <p><strong>Local de Entrega:</strong> ${pedido.local_entrega || '-'}</p>
            <p><strong>Setor:</strong> ${pedido.setor || '-'}</p>
            <p><strong>Previsão de Entrega:</strong> ${pedido.previsao_entrega ? new Date(pedido.previsao_entrega).toLocaleDateString('pt-BR') : '-'}</p>
        </div>
    `;
    
    // Aba Transporte
    document.getElementById('info-tab-transporte').innerHTML = `
        <div class="info-section">
            <p><strong>Transportadora:</strong> ${pedido.transportadora || '-'}</p>
            <p><strong>Frete:</strong> ${pedido.frete ? formatarMoeda(pedido.frete) : '-'}</p>
            <p><strong>Vendedor:</strong> ${pedido.vendedor || '-'}</p>
        </div>
    `;
    
    // Resetar abas
    infoTabs.forEach((tabId, index) => {
        document.getElementById(tabId).classList.toggle('active', index === 0);
    });
    
    document.getElementById('infoModal').classList.add('show');
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('show');
}

function switchInfoTab(tabId) {
    const currentIndex = infoTabs.indexOf(tabId);
    
    infoTabs.forEach(id => {
        document.getElementById(id).classList.remove('active');
    });
    
    const tabButtons = document.querySelectorAll('#infoModal .tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    tabButtons[currentIndex].classList.add('active');
    
    // Atualizar botões de navegação
    const btnPrevious = document.getElementById('btnInfoPrevious');
    const btnNext = document.getElementById('btnInfoNext');
    
    if (btnPrevious) {
        btnPrevious.style.display = currentIndex > 0 ? 'inline-flex' : 'none';
    }
    
    if (btnNext) {
        btnNext.style.display = currentIndex < infoTabs.length - 1 ? 'inline-flex' : 'none';
    }
}

function nextInfoTab() {
    const currentActive = document.querySelector('#infoModal .tab-content.active');
    const currentIndex = infoTabs.indexOf(currentActive.id);
    
    if (currentIndex < infoTabs.length - 1) {
        switchInfoTab(infoTabs[currentIndex + 1]);
    }
}

function previousInfoTab() {
    const currentActive = document.querySelector('#infoModal .tab-content.active');
    const currentIndex = infoTabs.indexOf(currentActive.id);
    
    if (currentIndex > 0) {
        switchInfoTab(infoTabs[currentIndex - 1]);
    }
}

// ============================================
// ETIQUETA
// ============================================
function openEtiquetaModal(id) {
    etiquetaPedidoId = id;
    document.getElementById('numeroNotaFiscal').value = '';
    document.getElementById('etiquetaModal').classList.add('show');
}

function closeEtiquetaModal() {
    document.getElementById('etiquetaModal').classList.remove('show');
    etiquetaPedidoId = null;
}

function imprimirEtiqueta() {
    const numeroNF = document.getElementById('numeroNotaFiscal').value.trim();
    
    if (!numeroNF) {
        showMessage('Por favor, informe o número da nota fiscal', 'error');
        return;
    }
    
    const pedido = pedidos.find(p => p.id === etiquetaPedidoId);
    if (!pedido) return;
    
    // Criar conteúdo da etiqueta
    const etiquetaHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Etiqueta - Pedido ${pedido.codigo}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                }
                .etiqueta {
                    border: 2px solid #000;
                    padding: 20px;
                    max-width: 600px;
                }
                .etiqueta h2 {
                    text-align: center;
                    margin: 0 0 20px 0;
                }
                .etiqueta p {
                    margin: 8px 0;
                    line-height: 1.4;
                }
                .etiqueta strong {
                    display: inline-block;
                    width: 180px;
                }
                @media print {
                    body { margin: 0; }
                    .etiqueta { border: 1px solid #000; }
                }
            </style>
        </head>
        <body>
            <div class="etiqueta">
                <h2>ETIQUETA DE ENVIO</h2>
                <p><strong>Nota Fiscal:</strong> ${numeroNF}</p>
                <p><strong>Pedido Nº:</strong> ${pedido.codigo}</p>
                <p><strong>Total de Volumes:</strong> ${pedido.quantidade_total || pedido.volumes || '-'}</p>
                <p><strong>Destinatário:</strong> ${pedido.razao_social || '-'}</p>
                <p><strong>Município:</strong> ${pedido.municipio || '-'}</p>
                <p><strong>Endereço:</strong> ${pedido.endereco || '-'}, ${pedido.numero || ''} - ${pedido.bairro || '-'}</p>
                <p><strong>Informações Adicionais:</strong> ${pedido.local_entrega || ''} ${pedido.setor ? '- ' + pedido.setor : ''}</p>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => window.close(), 100);
                };
            </script>
        </body>
        </html>
    `;
    
    // Abrir em nova janela e imprimir
    const printWindow = window.open('', '_blank');
    printWindow.document.write(etiquetaHtml);
    printWindow.document.close();
    
    closeEtiquetaModal();
    showMessage('Etiqueta enviada para impressão', 'success');
}

// ============================================
// CALENDÁRIO
// ============================================
function updateMonthDisplay() {
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const display = document.getElementById('currentMonth');
    if (display) {
        display.textContent = `${monthNames[selectedMonth]} ${selectedYear}`;
    }
}

function changeMonth(delta) {
    selectedMonth += delta;
    
    if (selectedMonth > 11) {
        selectedMonth = 0;
        selectedYear++;
    } else if (selectedMonth < 0) {
        selectedMonth = 11;
        selectedYear--;
    }
    
    updateMonthDisplay();
    updateDisplay();
}

function toggleCalendar() {
    const modal = document.getElementById('calendarModal');
    const isVisible = modal.style.display === 'flex';
    modal.style.display = isVisible ? 'none' : 'flex';
    
    if (!isVisible) {
        renderCalendar();
    }
}

function renderCalendar() {
    const container = document.getElementById('calendarMonths');
    const yearDisplay = document.getElementById('calendarYear');
    
    if (yearDisplay) {
        yearDisplay.textContent = selectedYear;
    }
    
    if (!container) return;
    
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    container.innerHTML = monthNames.map((month, index) => {
        const isSelected = index === selectedMonth && selectedYear === parseInt(yearDisplay?.textContent || selectedYear);
        return `
            <button class="calendar-month ${isSelected ? 'selected' : ''}" 
                    onclick="selectMonth(${index})">
                ${month}
            </button>
        `;
    }).join('');
}

function selectMonth(month) {
    selectedMonth = month;
    updateMonthDisplay();
    updateDisplay();
    toggleCalendar();
}

function changeCalendarYear(delta) {
    selectedYear += delta;
    renderCalendar();
}

// Fechar calendário ao clicar fora
document.addEventListener('click', (e) => {
    const calendarModal = document.getElementById('calendarModal');
    if (e.target === calendarModal) {
        toggleCalendar();
    }
});

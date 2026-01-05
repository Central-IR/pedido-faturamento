// ============================================
// CONFIGURAÇÃO - SEM CREDENCIAIS!
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3004/api'
        : `${window.location.origin}/api`;

let pedidos = [];
let isOnline = false;
let itemCounter = 0;
let clientesCache = {};
let estoqueCache = {};
let editingId = null;
let sessionToken = null;

// ============================================
// FUNÇÃO PADRÃO PARA MAIÚSCULAS
// ============================================
function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
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
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            height:100vh;
            text-align:center;
        ">
            <h1>${mensagem}</h1>
            <a href="${PORTAL_URL}">Ir para o Portal</a>
        </div>
    `;
}

async function inicializarApp() {
    await checkConnection();
    await loadPedidos();
    await loadEstoque();
    setInterval(checkConnection, 15000);
}

// ============================================
// CONEXÃO
// ============================================
async function checkConnection() {
    try {
        const response = await fetch(`${API_URL}/pedidos`, {
            method: 'HEAD',
            headers: { 'X-Session-Token': sessionToken }
        });
        isOnline = response.ok;
        return isOnline;
    } catch {
        isOnline = false;
        return false;
    }
}

// ============================================
// CARREGAR PEDIDOS
// ============================================
async function loadPedidos() {
    if (!isOnline) return;

    const response = await fetch(`${API_URL}/pedidos`, {
        headers: { 'X-Session-Token': sessionToken }
    });

    if (response.ok) {
        pedidos = await response.json();
        atualizarCacheClientes(pedidos);
        updateTable();
    }
}

// ============================================
// CARREGAR ESTOQUE
// ============================================
async function loadEstoque() {
    const response = await fetch(`${API_URL}/estoque`, {
        headers: { 'X-Session-Token': sessionToken }
    });

    if (response.ok) {
        const items = await response.json();
        estoqueCache = {};
        items.forEach(item => {
            estoqueCache[toUpperCase(item.codigo)] = item;
        });
    }
}

// ============================================
// CACHE CLIENTES
// ============================================
function atualizarCacheClientes(pedidos) {
    clientesCache = {};
    pedidos.forEach(p => {
        const cnpj = toUpperCase(p.cnpj);
        if (cnpj && !clientesCache[cnpj]) {
            clientesCache[cnpj] = {
                razaoSocial: toUpperCase(p.razao_social),
                inscricaoEstadual: toUpperCase(p.inscricao_estadual),
                endereco: toUpperCase(p.endereco),
                telefone: toUpperCase(p.telefone),
                contato: toUpperCase(p.contato),
                email: p.email || '',
                documento: toUpperCase(p.documento),
                localEntrega: toUpperCase(p.local_entrega),
                setor: toUpperCase(p.setor),
                transportadora: toUpperCase(p.transportadora),
                valorFrete: p.valor_frete,
                vendedor: toUpperCase(p.vendedor)
            };
        }
    });
}

// ============================================
// TABELA
// ============================================
function updateTable() {
    const container = document.getElementById('pedidosContainer');
    container.innerHTML = pedidos.map(p => `
        <tr>
            <td>${p.codigo}</td>
            <td>${toUpperCase(p.razao_social)}</td>
            <td>${toUpperCase(p.cnpj)}</td>
            <td>${toUpperCase(p.vendedor || '-')}</td>
            <td>${p.valor_total}</td>
            <td>${toUpperCase(p.status)}</td>
            <td>
                <button onclick="viewPedido(${p.id})">VER</button>
                <button onclick="editPedido(${p.id})">EDITAR</button>
            </td>
        </tr>
    `).join('');
}

// ============================================
// VISUALIZAR PEDIDO
// ============================================
function viewPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;

    const modal = `
        <div class="modal-overlay" id="infoModal">
            <div class="modal-content">
                <h3>PEDIDO ${pedido.codigo}</h3>
                <p><strong>RAZÃO SOCIAL:</strong> ${toUpperCase(pedido.razao_social)}</p>
                <p><strong>ENDEREÇO:</strong> ${toUpperCase(pedido.endereco)}</p>
                <p><strong>VENDEDOR:</strong> ${toUpperCase(pedido.vendedor)}</p>

                <table>
                    <thead>
                        <tr>
                            <th>ITEM</th>
                            <th>CÓDIGO</th>
                            <th>ESPECIFICAÇÃO</th>
                            <th>QTD</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pedido.items.map(i => `
                            <tr>
                                <td>${i.item}</td>
                                <td>${toUpperCase(i.codigoEstoque)}</td>
                                <td>${toUpperCase(i.especificacao)}</td>
                                <td>${i.quantidade}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <button onclick="closeInfoModal()">FECHAR</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modal);
}

function closeInfoModal() {
    document.getElementById('infoModal')?.remove();
}

// ============================================
// FORÇAR MAIÚSCULAS AO DIGITAR
// ============================================
document.addEventListener('input', e => {
    const el = e.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (!['email', 'number', 'date'].includes(el.type)) {
            const s = el.selectionStart;
            const ePos = el.selectionEnd;
            el.value = el.value.toUpperCase();
            if (s !== null) el.setSelectionRange(s, ePos);
        }
    }
});

const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// ==============================
// CONFIGURAÇÃO INICIAL
// ==============================
const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

// ==============================
// VARIÁVEIS DE AMBIENTE
// ==============================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    process.exit(1);
}

// ==============================
// MIDDLEWARE DE AUTENTICAÇÃO
// ==============================
async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/api/health'];

    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'];

    if (!sessionToken) {
        return res.status(401).json({ error: 'Token de sessão não fornecido' });
    }

    try {
        const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!response.ok) {
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        const data = await response.json();

        if (!data.valid) {
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        req.user = data.session;
        req.sessionToken = sessionToken;

        next();
    } catch (error) {
        console.error('Erro ao validar sessão:', error);
        res.status(500).json({ error: 'Erro interno de autenticação' });
    }
}

// ==============================
// ROTAS PÚBLICAS
// ==============================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// ==============================
// ROTAS PROTEGIDAS – PEDIDOS
// ==============================
app.get('/api/pedidos', verificarAutenticacao, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        let supabaseUrl;

        if (mes !== undefined && ano !== undefined) {
            const month = parseInt(mes); // 0-based (Janeiro = 0)
            const year = parseInt(ano);

            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            console.log(`📥 GET /api/pedidos - Buscando de ${startStr} a ${endStr}...`);

            // Filtrar por data_registro no intervalo do mês
            supabaseUrl = `${SUPABASE_URL}/rest/v1/pedidos_faturamento?select=*&data_registro=gte.${startStr}T00:00:00&data_registro=lte.${endStr}T23:59:59&order=codigo.asc`;
        } else {
            console.log('📥 GET /api/pedidos - Buscando todos...');
            supabaseUrl = `${SUPABASE_URL}/rest/v1/pedidos_faturamento?select=*&order=codigo.desc`;
        }

        const response = await fetch(supabaseUrl, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        });

        console.log('📊 Supabase response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro Supabase:', errorText);
            throw new Error(`Supabase erro ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ ${data.length} pedidos carregados`);
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar pedidos:', error.message);
        res.status(500).json({ error: 'Erro ao buscar pedidos', details: error.message });
    }
});

app.post('/api/pedidos', verificarAutenticacao, async (req, res) => {
    try {
        console.log('📝 POST /api/pedidos - Criando pedido:', req.body.codigo);
        
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos_faturamento`,
            {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify(req.body)
            }
        );

        if (!response.ok) {
            const err = await response.text();
            console.error('❌ Erro ao criar pedido:', err);
            throw new Error(err);
        }

        const data = await response.json();
        console.log('✅ Pedido criado:', data[0]?.codigo);
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error.message);
        res.status(500).json({ error: 'Erro ao criar pedido', details: error.message });
    }
});

app.patch('/api/pedidos/:id', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos_faturamento?id=eq.${req.params.id}`,
            {
                method: 'PATCH',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify(req.body)
            }
        );

        if (!response.ok) {
            throw new Error('Erro ao atualizar pedido');
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar pedido' });
    }
});

app.delete('/api/pedidos/:id', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos_faturamento?id=eq.${req.params.id}`,
            {
                method: 'DELETE',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Erro ao excluir pedido');
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao excluir pedido' });
    }
});

// ==============================
// ROTAS PROTEGIDAS – ESTOQUE
// ==============================
app.get('/api/estoque', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/estoque?select=*`,
            {
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Erro ao buscar estoque');
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar estoque' });
    }
});

app.patch('/api/estoque/:codigo', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`Atualizando estoque código ${req.params.codigo}:`, req.body);
        
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/estoque?codigo=eq.${req.params.codigo}`,
            {
                method: 'PATCH',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify(req.body)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro Supabase:', errorText);
            throw new Error('Erro ao atualizar estoque');
        }

        const data = await response.json();
        console.log('Estoque atualizado:', data);
        res.json(data);
    } catch (error) {
        console.error('Erro na rota de estoque:', error);
        res.status(500).json({ error: 'Erro ao atualizar estoque' });
    }
});

// ==============================
// SERVIR FRONTEND
// ==============================
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==============================
// INICIAR SERVIDOR
// ==============================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log('🔒 Autenticação centralizada no Portal');
    console.log('📦 Supabase conectado com Service Role');
    console.log('💾 Tabela: pedidos_faturamento');
    console.log('📊 Estoque: Atualização por código');
    console.log('✨ Novas colunas: responsavel, data_registro');
});

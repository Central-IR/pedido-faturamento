const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Configuração do Supabase (BACKEND ONLY)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tokens válidos (em produção, isso deveria estar em banco de dados)
const VALID_SESSIONS = new Map();

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não configuradas!');
    process.exit(1);
}

const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) return next();

    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) {
        console.log('❌ Token não fornecido');
        return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            console.log('❌ Sessão inválida - Status:', verifyResponse.status);
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        const sessionData = await verifyResponse.json();
        if (!sessionData.valid) {
            console.log('❌ Sessão não válida');
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        console.log('✅ Autenticação OK');
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error.message);
        return res.status(500).json({ error: 'Erro ao verificar autenticação', details: error.message });
    }
}
// ============================================
// ROTAS PÚBLICAS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Validar e registrar sessão
app.post('/api/auth/validate', (req, res) => {
    const { sessionToken } = req.body;
    
    if (!sessionToken) {
        return res.status(400).json({ error: 'Token não fornecido' });
    }
    
    // Adicionar token à lista de sessões válidas
    VALID_SESSIONS.set(sessionToken, {
        token: sessionToken,
        created: Date.now(),
        expires: Date.now() + (24 * 60 * 60 * 1000) // 24 horas
    });
    
    res.json({ success: true, message: 'Sessão validada' });
});

// ============================================
// ROTAS PROTEGIDAS - PEDIDOS
// ============================================

// GET - Listar todos os pedidos (HEAD para verificação)
app.head('/api/pedidos', verificarAutenticacao, (req, res) => {
    res.status(200).end();
});

// GET - Listar todos os pedidos
app.get('/api/pedidos', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_faturamento?select=*&order=codigo.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Supabase error: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Criar novo pedido
app.post('/api/pedidos', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_faturamento`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Supabase error: ${response.status} - ${errorData}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH - Atualizar pedido
app.patch('/api/pedidos/:id', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_faturamento?id=eq.${req.params.id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });
        
        if (!response.ok) {
            throw new Error(`Supabase error: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar pedido:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Excluir pedido
app.delete('/api/pedidos/:id', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_faturamento?id=eq.${req.params.id}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Supabase error: ${response.status}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir pedido:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS PROTEGIDAS - ESTOQUE
// ============================================

// GET - Listar estoque
app.get('/api/estoque', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/estoque?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Supabase error: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar estoque:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH - Atualizar quantidade do estoque
app.patch('/api/estoque/:codigo', verificarAutenticacao, async (req, res) => {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/estoque?codigo=eq.${req.params.codigo}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });
        
        if (!response.ok) {
            throw new Error(`Supabase error: ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar estoque:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// LIMPEZA DE SESSÕES EXPIRADAS
// ============================================
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of VALID_SESSIONS.entries()) {
        if (session.expires < now) {
            VALID_SESSIONS.delete(token);
            console.log(`🗑️  Sessão expirada removida: ${token.substring(0, 10)}...`);
        }
    }
}, 60 * 60 * 1000); // Limpar a cada 1 hora

// ============================================
// SERVIR FRONTEND
// ============================================

// Servir o index.html para todas as outras rotas
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📦 Pedidos de Faturamento - Sistema Online`);
    console.log(`✅ Conexão com Supabase configurada`);
    console.log(`🔒 Autenticação via sessionToken ativada`);
});

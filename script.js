/* ══════════════════════════════════════════════════════════════════════
   LOGICA DO MAPA DE VISITAS - PEC SÃO JOSÉ DO RIO PRETO
   ══════════════════════════════════════════════════════════════════════ */

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null;

// --- NAVEGAÇÃO ENTRE ABAS ---
function mudarAba(aba) {
  // Remove classe ativa de todos os painéis e botões
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  
  // Ativa o painel e o botão selecionado
  const painel = document.getElementById('panel-' + aba);
  const botao = document.getElementById('tab-' + aba);
  
  if (painel && botao) {
    painel.classList.add('active');
    botao.classList.add('active');
  }

  // Se for a aba de comparativo, tenta carregar os dados
  if (aba === 'comparativo') carregarComparativo();
}

// --- CONTROLE DO SUPABASE ---
function inicializarSupabase() {
  if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http')) {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      atualizarIndicador('ok', 'Conectado');
    } catch (e) {
      sb = null;
      atualizarIndicador('err', 'Erro ao conectar');
    }
  } else {
    atualizarIndicador('off', 'Não configurado');
  }
}

function abrirModalSupabase() {
  const modal = document.getElementById('modal-sb');
  if (modal) {
    document.getElementById('inp-url').value = SUPABASE_URL;
    document.getElementById('inp-key').value = SUPABASE_KEY;
    modal.classList.add('open');
  }
}

function fecharModal() {
  const modal = document.getElementById('modal-sb');
  if (modal) modal.classList.remove('open');
}

function salvarConfig() {
  const url = document.getElementById('inp-url').value.trim();
  const key = document.getElementById('inp-key').value.trim();
  
  if (!url || !key) {
    alert('Preencha os dois campos!');
    return;
  }

  SUPABASE_URL = url;
  SUPABASE_KEY = key;
  localStorage.setItem('pec_sb_url', url);
  localStorage.setItem('pec_sb_key', key);
  
  inicializarSupabase();
  fecharModal();
}

function atualizarIndicador(estado, msg) {
  const dot = document.getElementById('sb-dot');
  const lbl = document.getElementById('sb-lbl');
  if (dot) {
    dot.classList.remove('ok', 'err');
    if (estado === 'ok') dot.classList.add('ok');
    if (estado === 'err') dot.classList.add('err');
  }
  if (lbl) lbl.textContent = estado === 'ok' ? 'Online' : 'Supabase';
}

// --- FUNÇÃO PARA FECHAR MODAL AO CLICAR FORA ---
function fecharModalSeOverlay(e) {
  if (e.target.id === 'modal-sb') fecharModal();
}

// Inicializar funções ao carregar a página
window.onload = () => {
  inicializarSupabase();
};

async function testarConexao() {
  const url = document.getElementById('inp-url').value.trim();
  const key = document.getElementById('inp-key').value.trim();
  
  if (!url || !key) {
    alert('⚠️ Preencha os campos antes de testar!');
    return;
  }

  const msgStatus = document.getElementById('modal-status-msg');
  if (msgStatus) msgStatus.textContent = 'Testando conexão...';

  try {
    // Tenta criar um cliente temporário e fazer uma consulta simples
    const clienteTeste = window.supabase.createClient(url, key);
    const { error } = await clienteTeste.from('relatorios').select('id').limit(1);
    
    if (error && error.code !== 'PGRST116') throw error;
    
    if (msgStatus) msgStatus.textContent = '✅ Conexão OK! Tabela encontrada.';
    atualizarIndicador('ok', 'Online');
  } catch (e) {
    if (msgStatus) msgStatus.textContent = '❌ Erro: ' + (e.message || 'Verifique a tabela');
    atualizarIndicador('err', 'Erro');
  }
}

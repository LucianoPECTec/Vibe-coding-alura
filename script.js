// script.js - Lógica completa do Mapa de Visitas

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null;

// Inicialização
function inicializarSupabase(){
  if(SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http')){
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      atualizarIndicador('ok', 'Conectado');
    } catch(e){
      sb = null;
      atualizarIndicador('err', 'Erro ao conectar');
    }
  } else {
    sb = null;
    atualizarIndicador('off', 'Não configurado');
  }
}

// Funções de Interface
function atualizarIndicador(estado, msg){
  const dot = document.getElementById('sb-dot');
  const lbl = document.getElementById('sb-lbl');
  if(dot) {
    dot.classList.remove('ok', 'err');
    if(estado==='ok') dot.classList.add('ok');
    if(estado==='err') dot.classList.add('err');
  }
  if(lbl) lbl.textContent = estado==='ok' ? 'Online' : 'Supabase';
}

function abrirModalSupabase(){
  document.getElementById('inp-url').value = SUPABASE_URL;
  document.getElementById('inp-key').value = SUPABASE_KEY;
  document.getElementById('modal-sb').classList.add('open');
}

function fecharModal(){
  document.getElementById('modal-sb').classList.remove('open');
}

function mudarAba(aba){
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + aba).classList.add('active');
  document.getElementById('tab-' + aba).classList.add('active');
}

// Funções de Configuração
function salvarConfig(){
  const url = document.getElementById('inp-url').value.trim();
  const key = document.getElementById('inp-key').value.trim();
  if(!url || !key) return;
  SUPABASE_URL = url;
  SUPABASE_KEY = key;
  localStorage.setItem('pec_sb_url', url);
  localStorage.setItem('pec_sb_key', key);
  inicializarSupabase();
  fecharModal();
}

// Inicializar ao carregar
window.onload = () => {
    inicializarSupabase();
};

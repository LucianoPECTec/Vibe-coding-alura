/* ══════════════════════════════════════════════════════════════════════
   MAPA DE VISITAS PEC - MOTOR DE LEITURA E CÁLCULO V3
   ══════════════════════════════════════════════════════════════════════ */

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null;

const PESOS = { acessos:.25, corretos:.20, media:.25, realizacao:.20, discursivas:.10 };

const COL_KEYS = {
  escola:     ['escola','unidade escolar','nome da escola'],
  turma:      ['série','serie','classe','turma'],
  acessos:    ['índice de a','acessos','% de acessos'],
  corretos:   ['correto','2ª tentativa','alunos cor'],
  media:      ['média das','média de acertos','média geral'],
  realizacao: ['índice de r','realização','% realização'],
  aluno:      ['nome do aluno','aluno','nome'],
  ra:         ['r.a.','ra ','registro do aluno'],
};

const estado = {
  ure:    { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:false, nomeEscola:'' },
  escola: { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:false, nomeEscola:'' },
  turma:  { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:false, nomeEscola:'' },
};

// --- UTILITÁRIOS DE CONVERSÃO ---
function toNum(v){
  if(v==null||v==='') return 0;
  const s = String(v).replace(/[%\s]/g,'').trim();
  let n = s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s);
  if(isNaN(n)) return 0;
  return (n > 0 && n < 1) ? n * 100 : n;
}

function encontrarCol(obj, kws){
  const keys = Object.keys(obj);
  for(const kw of kws){
    const f = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
    if(f) return f;
  }
  return null;
}

function calcScore(linha, cols){
  let soma=0, tp=0;
  for(const [c,p] of Object.entries(PESOS)){
    if(!cols[c]) continue;
    let v = toNum(linha[cols[c]]);
    if(c==='media') v = (v/10)*100;
    soma += Math.min(v,100)*p; tp += p;
  }
  return tp>0 ? soma/tp : 0;
}

// --- MOTOR DE LEITURA (O QUE ESTAVA FALTANDO) ---
function processarArquivo(file, nivelForcado) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

      // Localiza onde começam os dados
      const headIdx = raw.findIndex(r => 
        r.join('').toLowerCase().includes('turma') || 
        r.join('').toLowerCase().includes('escola') || 
        r.join('').toLowerCase().includes('aluno')
      );

      if (headIdx === -1) { alert('⚠️ Não encontrei o cabeçalho padrão da SED.'); return; }

      const headers = raw[headIdx];
      const linhasRaw = raw.slice(headIdx + 1).filter(r => r[0] && !String(r[0]).includes('Total'));

      const linhas = linhasRaw.map(r => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
        return obj;
      });

      const cols = {};
      for (const k in COL_KEYS) cols[k] = encontrarCol(linhas[0], COL_KEYS[k]);

      const registros = linhas.map(r => {
        const s = calcScore(r, cols);
        return {
          nome: String(r[cols.escola] || r[cols.turma] || r[cols.aluno] || 'Indefinido').trim(),
          score: s,
          acessos: toNum(r[cols.acessos]),
          media: toNum(r[cols.media]),
          realizacao: toNum(r[cols.realizacao]),
          cls: s < 40 ? 'alta' : s < 65 ? 'media' : 'baixa',
          label: s < 40 ? 'ALTA' : s < 65 ? 'MÉDIA' : 'BAIXA'
        };
      });

      estado[nivelForcado].dados = registros;
      estado[nivelForcado].filtrados = [...registros];
      
      renderizarNivel(nivelForcado);
      mudarAba(nivelForcado);
      
      const badge = document.getElementById('badge-' + nivelForcado);
      if(badge) badge.textContent = registros.length;
      
    } catch (err) {
      console.error(err);
      alert('❌ Erro técnico ao ler a planilha.');
    }
  };
  reader.readAsArrayBuffer(file);
}

// --- INTERFACE ---
function renderizarNivel(nivel) {
  const st = estado[nivel];
  const resultsEl = document.getElementById('results-' + nivel);
  if (resultsEl) resultsEl.style.display = 'block';
  
  const tbody = document.getElementById('body-' + nivel);
  if (!tbody) return;

  tbody.innerHTML = st.filtrados.map((r, i) => `
    <tr>
      <td><span class="row-rank">${i + 1}</span></td>
      <td><div class="row-main">${r.nome}</div></td>
      <td><span class="pri-tag ${r.cls}">${r.label}</span></td>
      <td>
        <div class="gauge-wrap">
          <div class="gauge-track"><div class="gauge-fill" style="width:${r.score}%; background:${r.score<40?'#c0392b':r.score<65?'#b7580a':'#1a7a4a'}"></div></div>
          <span class="gauge-num">${r.score.toFixed(1)}</span>
        </div>
      </td>
      <td>${r.acessos.toFixed(1)}%</td>
      <td>${r.media.toFixed(1)}</td>
      <td>${r.realizacao.toFixed(1)}%</td>
    </tr>
  `).join('');
}

function mudarAba(aba) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + aba).classList.add('active');
  document.getElementById('tab-' + aba).classList.add('active');
}

// --- SUPABASE ---
function inicializarSupabase() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      atualizarIndicador('ok');
    } catch (e) { atualizarIndicador('err'); }
  }
}

function atualizarIndicador(estado) {
  const dot = document.getElementById('sb-dot');
  const lbl = document.getElementById('sb-lbl');
  if (dot) dot.className = 'sb-dot ' + (estado === 'ok' ? 'ok' : 'err');
  if (lbl) lbl.textContent = estado === 'ok' ? 'Online' : 'Erro';
}

function abrirModalSupabase() { document.getElementById('modal-sb').classList.add('open'); }
function fecharModal() { document.getElementById('modal-sb').classList.remove('open'); }

function salvarConfig() {
  SUPABASE_URL = document.getElementById('inp-url').value.trim();
  SUPABASE_KEY = document.getElementById('inp-key').value.trim();
  localStorage.setItem('pec_sb_url', SUPABASE_URL);
  localStorage.setItem('pec_sb_key', SUPABASE_KEY);
  inicializarSupabase();
  fecharModal();
}

// --- INICIALIZAÇÃO ---
window.onload = () => {
  inicializarSupabase();
  ['ure', 'escola', 'turma'].forEach(n => {
    const inp = document.getElementById('input-' + n);
    if (inp) inp.addEventListener('change', e => processarArquivo(e.target.files[0], n));
  });
};

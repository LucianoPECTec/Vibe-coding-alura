/* ══════════════════════════════════════════════════════════════════════
   MOTOR PEC RIO PRETO - DASHBOARD COM FILTROS HISTÓRICOS
   ══════════════════════════════════════════════════════════════════════ */

const COORDENADAS = {
    "ADAHIR GUIM. FOGAÇA": {lat:-20.8415, lng:-49.3622}, "ALBERTO ANDALÓ": {lat:-20.8146, lng:-49.3813},
    "ALZIRA V. ROLEMBERG": {lat:-20.8355, lng:-49.3622}, "AMIRA H.CHALELLA": {lat:-20.8212, lng:-49.4012},
    "ANTONIO DE B. SERRA": {lat:-20.8113, lng:-49.3646}, "AURELIANO MENDONÇA": {lat:-20.8189, lng:-49.3956},
    "BADY BASSIT": {lat:-20.8100, lng:-49.3823}, "BENTO AB.GOMES": {lat:-20.8413, lng:-49.3589},
    "CARDEAL LEME": {lat:-20.8056, lng:-49.3789}, "PIO X": {lat:-20.8080, lng:-49.3950},
    "VICTOR BRITTO BASTOS": {lat:-20.8190, lng:-49.3810}, "WALDEMIRO NAFFAH": {lat:-20.8312, lng:-49.3612}
};

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null, map = null, markers = [], chartEvo = null;
let dadosHistoricosRaw = [];

const PESOS = { acessos:.25, corretos:.20, media:.25, realizacao:.20, discursivas:.10 };
const COL_KEYS = {
    escola: ['escola','unidade'], turma: ['turma','série'], aluno: ['aluno(a)'],
    acesso: ['acesso no período'], acertados: ['acertados'], tentativas: ['tentativas'],
    media_mensal: ['média da avaliação'], acessos_ure: ['índice de a'], 
    media_ure: ['média das'], realizacao_ure: ['índice de r']
};

const estado = {
    ure: { dados:[], nomeEntidade:'D.E. Rio Preto' },
    escola: { dados:[], nomeEntidade:'' },
    turma: { dados:[], nomeEntidade:'' }
};

// --- NAVEGAÇÃO ---
function mudarAba(aba) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-' + aba).classList.add('active');
    if (aba === 'mapa') { initMap(); setTimeout(() => { map.invalidateSize(); renderizarPins(); }, 200); }
    if (aba === 'comparativo') carregarHistoricoSupabase();
}

// --- PROCESSAMENTO XLS ---
function processarArquivo(file, nivel) {
    const reader = new FileReader();
    reader.onload = e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        
        // Identifica nome da Escola/Turma pelo título
        const titulo = String(raw[0] || '').toUpperCase();
        estado[nivel].nomeEntidade = titulo || file.name.split('.')[0];

        const headIdx = raw.findIndex(r => r.join('').toLowerCase().includes('aluno') || r.join('').toLowerCase().includes('unidade'));
        const headers = raw[headIdx];
        const linhasRaw = raw.slice(headIdx + 1).filter(r => r[0] && !String(r[0]).includes('Filtros'));

        const cols = {};
        headers.forEach((h, i) => { for(let k in COL_KEYS) if(COL_KEYS[k].some(x => h.toLowerCase().includes(x))) cols[k] = i; });

        estado[nivel].dados = linhasRaw.map(r => {
            const m = toNum(r[cols.media_mensal || cols.media_ure]);
            const s = nivel === 'turma' ? m * 10 : calcScore(r, cols);
            return {
                nome: String(r[cols.aluno || cols.escola || cols.turma] || '—').trim(),
                score: s, media: m, acesso: r[cols.acesso] === 'V',
                cls: s < 40 ? 'alta' : s < 65 ? 'media' : 'baixa'
            };
        });
        renderizarNivel(nivel);
    };
    reader.readAsArrayBuffer(file);
}

function renderizarNivel(nivel) {
    document.getElementById('results-' + nivel).style.display = 'block';
    const st = estado[nivel];
    const alta = st.dados.filter(d => d.cls === 'alta').length;
    document.getElementById('strip-' + nivel).innerHTML = `
        <div class="score-card"><b>${st.dados.length}</b><br>Registros</div>
        <div class="score-card" style="color:var(--red)"><b>${alta}</b><br>Alerta</div>
    `;
    renderizarTabela(nivel);
}

function renderizarTabela(nivel) {
    const st = estado[nivel];
    const head = document.getElementById('head-' + nivel);
    const body = document.getElementById('body-' + nivel);
    if(nivel === 'turma') {
        head.innerHTML = `<th>#</th><th>Aluno</th><th>Acesso</th><th>Média</th>`;
        body.innerHTML = st.dados.map((r, i) => `<tr><td>${i+1}</td><td>${r.nome}</td><td>${r.acesso?'✅':'❌'}</td><td>${r.media}</td></tr>`).join('');
    } else {
        head.innerHTML = `<th>#</th><th>Entidade</th><th>Prioridade</th><th>Score</th>`;
        body.innerHTML = st.dados.map((r, i) => `<tr><td>${i+1}</td><td>${r.nome}</td><td><span class="pri-tag ${r.cls}">${r.cls.toUpperCase()}</span></td><td>${r.score.toFixed(1)}</td></tr>`).join('');
    }
}

// --- HISTÓRICO E GRÁFICOS (FILTROS ESCOLA/TURMA) ---
async function salvarSupabase(nivel) {
    if (!sb || !estado[nivel].dados.length) return alert('Verifique os dados!');
    const periodo = prompt("Digite o período (ex: Semana 08/2026):", "Semana " + new Date().toLocaleDateString());
    if(!periodo) return;

    const { error } = await sb.from('relatorios').insert([{
        nivel, nome_entidade: estado[nivel].nomeEntidade, periodo,
        dados: estado[nivel].dados, score_medio: estado[nivel].dados.reduce((a,b)=>a+b.score,0)/estado[nivel].dados.length
    }]);
    if (error) alert('Erro ao salvar: ' + error.message); else alert('Dados salvos no histórico!');
}

async function carregarHistoricoSupabase() {
    if (!sb) return;
    const { data } = await sb.from('relatorios').select('*').order('periodo', { ascending: true });
    if (!data) return;
    dadosHistoricosRaw = data;
    
    // Popula Select de Escolas
    const selEscola = document.getElementById('filtro-escola-hist');
    const escolas = [...new Set(data.map(d => d.nome_entidade))];
    selEscola.innerHTML = '<option value="todos">Todas as Entidades</option>' + escolas.map(e => `<option value="${e}">${e}</option>`).join('');
    
    atualizarGraficoFiltro();
}

function atualizarGraficoFiltro() {
    const escolaSel = document.getElementById('filtro-escola-hist').value;
    let dadosFiltrados = dadosHistoricosRaw;
    
    if (escolaSel !== 'todos') {
        dadosFiltrados = dadosHistoricosRaw.filter(d => d.nome_entidade === escolaSel);
    }

    const ctx = document.getElementById('chart-evolucao').getContext('2d');
    if (chartEvo) chartEvo.destroy();

    chartEvo = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dadosFiltrados.map(d => d.periodo),
            datasets: [{
                label: 'Evolução Score Médio',
                data: dadosFiltrados.map(d => d.score_medio),
                borderColor: '#1a5fd4', tension: 0.3, fill: true, backgroundColor: 'rgba(26, 95, 212, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- MAPA E UTILS ---
function initMap() { if (map) return; map = L.map('map').setView([-20.8113, -49.3758], 12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); }
function renderizarPins() {
    markers.forEach(m => map.removeLayer(m)); markers = [];
    estado.ure.dados.forEach(esc => {
        const nomeL = esc.nome.replace("EE ", "").toUpperCase();
        const c = COORDENADAS[nomeL] || {lat: -20.8113 + (Math.random()-0.5)*0.05, lng: -49.3758 + (Math.random()-0.5)*0.05};
        markers.push(L.circleMarker([c.lat, c.lng], { radius: 8, fillColor: corScore(esc.score), color: "#fff", fillOpacity: 0.9 }).addTo(map));
    });
}
function corScore(s) { return s < 40 ? '#c0392b' : s < 65 ? '#b7580a' : '#1a7a4a'; }
function toNum(v){ if(v==null||v==='') return 0; const s = String(v).replace(/[%\s]/g,'').trim(); let n = s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s); return isNaN(n) ? 0 : (n > 0 && n < 1 ? n * 100 : n); }
function calcScore(r, cols){ let s=0, t=0; for(let c in PESOS) { let v = toNum(r[cols[c+'_ure']]); s += Math.min(v,100)*PESOS[c]; t+=PESOS[c]; } return t>0 ? s/t : 0; }
function inicializar() { if(SUPABASE_URL) { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); document.getElementById('sb-dot').classList.add('ok'); } }
window.onload = () => { inicializar(); ['ure','escola','turma'].forEach(n => { document.getElementById('input-'+n).addEventListener('change', e => processarArquivo(e.target.files[0], n)); }); };
function abrirModalSupabase() { document.getElementById('modal-sb').classList.add('open'); }
function fecharModal() { document.getElementById('modal-sb').classList.remove('open'); }
function salvarConfig() { SUPABASE_URL = document.getElementById('inp-url').value; SUPABASE_KEY = document.getElementById('inp-key').value; localStorage.setItem('pec_sb_url', SUPABASE_URL); localStorage.setItem('pec_sb_key', SUPABASE_KEY); inicializar(); fecharModal(); }

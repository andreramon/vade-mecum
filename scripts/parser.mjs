// Converte o HTML de uma lei do Planalto em blocos estruturados (títulos e artigos).
import * as cheerio from 'cheerio';

const RE_CAB = /^(PARTE\s+(?:GERAL|ESPECIAL)|LIVRO\s+(?:[IVXLC]+|COMPLEMENTAR)|T[IÍ]TULO\s+(?:[IVXLC]+(?:-[A-Z])?|[UÚ]NICO)|CAP[IÍ]TULO\s+(?:[IVXLC]+(?:-[A-Z])?|[UÚ]NICO)|SUBSE[CÇ][AÃ]O\s+(?:[IVXLC]+(?:-[A-Z])?|[UÚ]NICA)|SE[CÇ][AÃ]O\s+(?:[IVXLC]+(?:-[A-Z])?|[UÚ]NICA))(?![A-Za-zÀ-ú])\s*[-–—.]?\s*(.*)$/;
const RE_ADCT = /^ATO DAS DISPOSI[CÇ][OÕ]ES CONSTITUCIONAIS TRANSIT[OÓ]RIAS/;
const RE_ART = /^(?:Art|ART|Artigo|ARTIGO)\.?\s*(\d{1,4}(?:\.\d{3})?)\s*([º°oª])?(-[A-Z]{1,2}(?:[-\s][A-Z](?=\.))?|\s*[-–]\s*[A-Z]{1,2}(?=\.))?(?![a-zà-ú])\s*\.?\s*[-–—]?\s*(.*)$/;
const RE_PAR = /^(§\s*\d+\s*[º°o]?(?:-[A-Z]{1,2})?|Par[aá]grafo [uú]nico)\s*\.?\s*[-–—]?\s*(.*)$/i;
const RE_INC = /^([IVXLCDM]+(?:-[A-Z])?)\s*[-–—]\s*(.*)$/;
const RE_ALI = /^([a-z](?:-[A-Z])?)\)\s*(.*)$/;
const RE_ITEM = /^(\d{1,2})\.\s+(.*)$/;
const RE_FIM = /^Bras[ií]lia,\s*\d/;
const MARCA = '\u0001RISCADO ';
const RISCO = 'strike, s, del, [style*="line-through"], [style*="LINE-THROUGH"]';
const RE_NOTA = /\s*\((?:Reda[cç][aã]o|Inclu[ií]d[oa]|Acrescid[oa]|Acrescentad[oa]|Revogad[oa]|Vide|Vig[eê]ncia|Renumerad[oa]|Produ[cç][aã]o de efeito|Regulamento|Promulga[cç][aã]o|Suspens[oa]|Execu[cç][aã]o suspensa)[^()]*(?:\([^()]*\)[^()]*)*\)\s*\.?\s*$/i;

function nivelDe(rotulo) {
  const r = rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (r.startsWith('PARTE')) return 0;
  if (r.startsWith('LIVRO')) return 1;
  if (r.startsWith('TITULO')) return 2;
  if (r.startsWith('CAPITULO')) return 3;
  if (r.startsWith('SUBSECAO')) return 5;
  return 4;
}

export function separarNotas(t) {
  const notas = [];
  let m;
  while (t && (m = t.match(RE_NOTA))) {
    notas.unshift(m[0].trim());
    t = t.slice(0, m.index).trimEnd();
  }
  return { texto: t, nota: notas.join(' ') || undefined };
}

const ehRevogado = (texto, nota) =>
  !texto || /^\(?\s*revogad[oa]/i.test(texto) || (/^\(Revogad/i.test(nota || '') && texto.replace(/[;.:\s]/g, '') === '');
const maiusculas = t => /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t) && t === t.toUpperCase();

const BLOCOS = 'p, div, h1, h2, h3, h4, h5, h6, li, td, th, tr, table, blockquote, center, section, article, dd, dt, pre';

// Lê o texto da página inteira (não só os <p>), porque páginas antigas do Planalto
// às vezes trazem artigos dentro de <div>, <font> ou direto no corpo.
export function extrairLinhas(html) {
  const $ = cheerio.load(html);
  // Texto riscado = redação antiga. Some, mas deixa um marcador quando é um artigo inteiro,
  // para artigos totalmente revogados continuarem aparecendo como "(Revogado)".
  $(RISCO).each((_, el) => {
    if ($(el).parents(RISCO).length) return;
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (/^(?:Art|ART|Artigo|ARTIGO)\.?\s*\d/.test(t)) $(el).replaceWith('\n' + MARCA + t.slice(0, 60) + '\n');
    else $(el).remove();
  });
  $('script, style, head').remove();
  $('*').contents().each((_, n) => { if (n.type === 'text') n.data = n.data.replace(/\s+/g, ' '); });
  $('br').replaceWith('\n');
  $(BLOCOS).each((_, el) => { $(el).prepend('\n').append('\n'); });
  return $.root().text().split('\n')
    .map(t => t.replace(/\s+/g, ' ').trim().normalize('NFC'))
    .filter(Boolean);
}

export function parsearHtml(html) {
  const linhas = extrairLinhas(html);
  const blocos = [];
  const posicao = new Map(); // id do artigo -> posição em blocos
  let art = null, cabPendente = null, prefixo = '', nCab = 0, comecou = false;

  // Mesmo número repetido: a versão que vem depois é a vigente (ex.: redação antiga sem risco,
  // artigos do decreto que aprova a CLT). Um marcador de texto riscado nunca substitui texto real.
  const registrar = item => {
    const p = posicao.get(item.id);
    if (p !== undefined) {
      if (item.marcador && !blocos[p].marcador) return false;
      blocos[p] = null;
    }
    posicao.set(item.id, blocos.length);
    blocos.push(item);
    return true;
  };
  const lerArtigo = m => {
    const num = m[1].replace('.', '');
    const ord = m[2] ? 'º' : '';
    const suf = m[3] ? '-' + m[3].match(/[A-Z]{1,2}/g).join('-') : '';
    return { id: prefixo + 'art' + num + suf.toLowerCase(), numero: m[1] + ord + suf };
  };
  const anexar = (alvo, campo, t) => { alvo[campo] = (alvo[campo] ? alvo[campo] + ' ' : '') + t; };

  for (const linha of linhas) {
    // Assinatura: encerra o artigo atual, mas segue lendo (a CF tem o ADCT depois dela)
    if (comecou && RE_FIM.test(linha)) { art = null; cabPendente = null; continue; }

    if (linha.startsWith(MARCA)) {
      const mr = linha.slice(MARCA.length).match(RE_ART);
      if (mr && comecou !== null) {
        const { id, numero } = lerArtigo(mr);
        const ph = { tipo: 'artigo', id, numero, caput: '(Revogado)', dispositivos: [], revogado: true, marcador: true };
        art = registrar(ph) ? ph : null;
      }
      continue;
    }

    if (RE_ADCT.test(linha)) {
      prefixo = 'adct-'; comecou = true; art = null; cabPendente = null;
      blocos.push({ tipo: 'titulo', id: 'h' + (++nCab), nivel: 0, rotulo: 'ADCT', nome: 'ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS' });
      continue;
    }

    let m = linha.match(RE_CAB);
    if (m) {
      comecou = true; art = null;
      const { texto } = separarNotas(m[2] || '');
      const cab = { tipo: 'titulo', id: 'h' + (++nCab), nivel: nivelDe(m[1]), rotulo: m[1].replace(/\s+/g, ' '), nome: texto };
      blocos.push(cab);
      cabPendente = texto || m[1].startsWith('PARTE') ? null : cab;
      continue;
    }
    if (cabPendente && maiusculas(linha) && !RE_ART.test(linha)) {
      cabPendente.nome = separarNotas(linha).texto;
      cabPendente = null;
      continue;
    }

    m = linha.match(RE_ART);
    if (m) {
      comecou = true; cabPendente = null;
      const { id, numero } = lerArtigo(m);
      const { texto, nota } = separarNotas(m[4] || '');
      art = { tipo: 'artigo', id, numero, caput: texto, dispositivos: [] };
      if (nota) art.nota = nota;
      if (ehRevogado(texto, nota)) art.revogado = true;
      registrar(art);
      continue;
    }
    if (!art) continue; // ementa, preâmbulo, menus do site etc.
    if (art.marcador) { // depois de um artigo riscado, só aproveita notas como "(Revogado pela Lei...)"
      const { texto, nota } = separarNotas(linha);
      if (!texto && nota) art.nota = nota;
      continue;
    }

    let tipo = null, rotulo, resto;
    if ((m = linha.match(RE_PAR))) {
      tipo = 'paragrafo';
      rotulo = /^par/i.test(m[1]) ? 'Parágrafo único.' : m[1].replace(/\s+/g, ' ').replace(/[°o]/, 'º').replace(/^§(\d)/, '§ $1');
      resto = m[2];
    } else if ((m = linha.match(RE_INC))) { tipo = 'inciso'; rotulo = m[1]; resto = m[2]; }
    else if ((m = linha.match(RE_ALI))) { tipo = 'alinea'; rotulo = m[1] + ')'; resto = m[2]; }
    else if ((m = linha.match(RE_ITEM)) && art.dispositivos.length) { tipo = 'item'; rotulo = m[1] + '.'; resto = m[2]; }

    if (tipo) {
      const { texto, nota } = separarNotas(resto || '');
      const d = { tipo, rotulo, texto };
      if (nota) d.nota = nota;
      if (ehRevogado(texto, nota)) d.revogado = true;
      art.dispositivos.push(d);
    } else {
      // Texto que o Planalto quebrou em outro parágrafo: junta ao dispositivo anterior
      const { texto, nota } = separarNotas(linha);
      const alvo = art.dispositivos.length ? art.dispositivos[art.dispositivos.length - 1] : art;
      if (texto) anexar(alvo, alvo === art ? 'caput' : 'texto', texto);
      if (nota) anexar(alvo, 'nota', nota);
    }
  }
  return blocos.filter(Boolean).map(b => { if (b.marcador) delete b.marcador; return b; });
}

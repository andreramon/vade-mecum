// Teste rápido do parser: node scripts/testar-parser.mjs
import assert from 'node:assert/strict';
import { parsearHtml } from './parser.mjs';
import { parsearSumulas, textoDeHtml } from './sumulas.mjs';

const html = `<html><head><meta charset="windows-1252"></head><body>
<p><a href="#">Presidência da República</a></p>
<p>Institui o Código de Exemplo.</p>
<p align="center"><b>PARTE GERAL</b></p>
<p align="center">TÍTULO I</p>
<p align="center">DAS PESSOAS NATURAIS</p>
<p align="center">CAPÍTULO I<br>DA PERSONALIDADE</p>
<p>Art. 1<sup>o</sup> Toda pessoa é capaz de direitos e deveres na ordem civil.</p>
<p><strike>Art. 2º Texto antigo que foi substituído.</strike></p>
<p>Art. 2º - Texto novo do artigo.    <a href="#">(Redação dada pela Lei nº 13.146, de 2015)</a> <a href="#">(Vigência)</a></p>
<p>I - primeiro inciso;</p>
<p><strike>II - inciso antigo;</strike></p>
<p>II - (revogado); <a href="#">(Redação dada pela Lei nº 1.000, de 2020)</a></p>
<p>a) alínea um;</p>
<p>1. item um.</p>
<p>§ 1<sup>o</sup> Primeiro parágrafo.</p>
<p>Parágrafo único. Texto do parágrafo único.</p>
<p>Art. 3º-A. Artigo incluído depois. <a>(Incluído pela Lei nº 14.000, de 2020)</a></p>
<p>Art. 10. Artigo de dois dígitos,</p>
<p>que continua em outro parágrafo.</p>
<p>Art. 1.025. Artigo com milhar.</p>
<p>Art. 11. (Revogado pela Lei nº 9.000, de 1995)</p>
<p>ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS</p>
<p>Art. 1º Artigo do ADCT.</p>
<p>Brasília, 10 de janeiro de 2002; 181º da Independência.</p>
<p>Art. 99. Não deve entrar.</p>
</body></html>`;

const b = parsearHtml(html);
const cab = b.filter(x => x.tipo === 'titulo');
const art = Object.fromEntries(b.filter(x => x.tipo === 'artigo').map(a => [a.id, a]));

assert.deepEqual(cab.map(c => [c.rotulo, c.nome, c.nivel]), [
  ['PARTE GERAL', '', 0], ['TÍTULO I', 'DAS PESSOAS NATURAIS', 2], ['CAPÍTULO I', 'DA PERSONALIDADE', 3], ['ADCT', 'ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS', 0]
]);
assert.equal(art.art1.numero, '1º');
assert.equal(art.art2.caput, 'Texto novo do artigo.');
assert.equal(art.art2.nota, '(Redação dada pela Lei nº 13.146, de 2015) (Vigência)');
assert.deepEqual(art.art2.dispositivos.map(d => [d.tipo, d.rotulo, d.texto, !!d.revogado]), [
  ['inciso', 'I', 'primeiro inciso;', false],
  ['inciso', 'II', '(revogado);', true],
  ['alinea', 'a)', 'alínea um;', false],
  ['item', '1.', 'item um.', false],
  ['paragrafo', '§ 1º', 'Primeiro parágrafo.', false],
  ['paragrafo', 'Parágrafo único.', 'Texto do parágrafo único.', false]
]);
assert.equal(art['art3-a'].numero, '3º-A');
assert.equal(art.art10.caput, 'Artigo de dois dígitos, que continua em outro parágrafo.');
assert.equal(art.art1025.numero, '1.025');
assert.equal(art.art11.revogado, true);
assert.ok(art['adct-art1']);
assert.ok(!art.art99, 'texto após a assinatura não deve entrar');
console.log('Parser OK:', Object.keys(art).length, 'artigos,', cab.length, 'títulos');

// Página antiga: artigos fora de <p>, em <div>, <font> e direto no corpo
const antigo = parsearHtml(`<html><body><font face="Arial">
<div>Art. 1º Primeiro artigo.</div>
<div><font>Art. 2º Segundo artigo,
que quebra a linha no código-fonte.</font></div>
Art. 3º Terceiro artigo solto no corpo.<br>
I - inciso do terceiro;
<table><tr><td>ART. 4º Quarto em maiúsculas.</td></tr></table>
<p>Art 5º Sem ponto depois de Art.</p>
</font></body></html>`).filter(x => x.tipo === 'artigo');
assert.deepEqual(antigo.map(a => a.id), ['art1', 'art2', 'art3', 'art4', 'art5']);
assert.equal(antigo[1].caput, 'Segundo artigo, que quebra a linha no código-fonte.');
assert.equal(antigo[2].dispositivos[0].texto, 'inciso do terceiro;');
console.log('Páginas antigas OK');

// Súmulas
const sum = parsearSumulas(textoDeHtml(`<html><body>
<p>Índice: Súmula 1, Súmula 7</p>
<h3>SÚMULA 7</h3><p>VEJA MAIS</p><p>A pretensão de simples reexame de prova não enseja recurso especial. (CORTE ESPECIAL, julgado em 28/06/1990, DJ 03/07/1990)</p>
<h3>Súmula Vinculante 14</h3><p>É direito do defensor ter acesso amplo aos elementos de prova, conforme a Súmula 7 citada.</p><p>Precedentes Representativos: HC 88.190</p>
<h3>SÚMULA 94</h3><p>(CANCELADA) A parcela relativa ao ICMS inclui-se na base de cálculo do FINSOCIAL.</p>
</body></html>`));
const sm = Object.fromEntries(sum.map(x => [x.numero, x]));
assert.equal(sm['7'].caput, 'A pretensão de simples reexame de prova não enseja recurso especial.');
assert.equal(sm['14'].caput, 'É direito do defensor ter acesso amplo aos elementos de prova, conforme a Súmula 7 citada.');
assert.equal(sm['94'].revogado, true);
assert.equal(sum.length, 3);
console.log('Súmulas OK:', sum.length, 'enunciados');

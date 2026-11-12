import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCodeSvg, escapeXML, validateCode } from '../src/shared/code-svg.ts'

test('SVG escapa código, título e cores vindos do conteúdo', () => {
  const result = createCodeSvg([[{ content: '<script>alert("&")</script>', color: '" onload="evil' }]], '<img onerror="evil">')
  assert.equal(result.svg.includes('<script>'), false)
  assert.equal(result.svg.includes('<img'), false)
  assert.match(result.svg, /&lt;script&gt;/)
  assert.match(result.svg, /fill="&quot; onload=&quot;evil"/)
  assert.equal(escapeXML("<&>\"'"), '&lt;&amp;&gt;&quot;&apos;')
})

test('linhas longas são quebradas sem perder texto ou gerar imagens largas demais', () => {
  const text = 'x'.repeat(1000)
  const result = createCodeSvg([[{ content: text, color: '#fff' }]], 'longo')
  assert.ok(result.width <= 1440)
  assert.equal((result.svg.match(/<tspan[^>]*>(.*?)<\/tspan>/g) || []).map(span => span.replace(/<[^>]*>/g, '')).join(''), text)
  assert.equal((result.svg.match(/<tspan /g) || []).length, 7)
})

test('código Unicode e linhas vazias são preservados', () => {
  const result = createCodeSvg([[{ content: 'Olá 🚀' }], [], [{ content: 'fim' }]], 'Ação')
  assert.match(result.svg, /Olá 🚀/)
  assert.match(result.svg, /Ação/)
  assert.equal(result.height, 157)
})

test('blocos excessivos são rejeitados antes de gerar imagens', () => {
  assert.throws(() => validateCode('x'.repeat(60001)), /60.000/)
  assert.throws(() => validateCode('\n'.repeat(300)), /300 linhas/)
  assert.doesNotThrow(() => validateCode('\n'.repeat(299)))
})

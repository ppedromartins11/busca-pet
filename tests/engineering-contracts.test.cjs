'use strict';

/*
 * Contratos estruturais de Engenharia de Software.
 * Estes testes são estáticos: não substituem navegador, backend nem RLS.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('o projeto dispõe de comandos reproduzíveis de sintaxe, teste e build', () => {
  const pkg = JSON.parse(source('package.json'));
  for (const name of ['check', 'test', 'build']) {
    assert.equal(typeof pkg.scripts[name], 'string', `Script ausente: ${name}`);
  }
});

test('a entrada do sistema separa o modo conectado do demonstrativo', () => {
  assert.match(source('src/events.js'), /BPSupabase\?\.configured/);
  assert.match(source('src/events.js'), /BPRealApp\s*:\s*window\.BPApp/);
});

test('existe um módulo de validação de domínio fora da interface', () => {
  const code = source('src/validation.js');
  assert.match(code, /function\s+alertData\s*\(/);
  assert.match(code, /function\s+sightingData\s*\(/);
  assert.match(code, /Data inexistente/);
});

test('rotas privadas declaram exigência de autenticação', () => {
  const code = source('src/router.js');
  assert.match(code, /requiresAuth:\s*true/);
  assert.match(code, /status:\s*["']login["']/);
});

test('permissões verificam a relação do usuário com o recurso', () => {
  const code = source('src/permissions.js');
  assert.match(code, /resource\.ownerId\s*!==\s*user\.id/);
  assert.match(code, /resource\.canCoordinate\s*===\s*false/);
});

test('o repositório contém evidências do processo e da verificação', () => {
  for (const file of ['docs/SPRINTS.md', 'docs/DEMO_PROFESSOR.md', 'docs/ARQUITETURA.md', 'docs/ENGENHARIA_DE_SOFTWARE_ACADEMICO.md', 'docs/MATRIZ_RASTREABILIDADE.md']) {
    assert.ok(fs.existsSync(path.join(root, file)), `Evidência ausente: ${file}`);
  }
});

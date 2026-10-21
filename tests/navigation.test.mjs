import test from 'node:test';
import assert from 'node:assert/strict';
import {routeHref, consumeRouteParams} from '../js/navigation.js';

test('links internos permanecem relativos e preservam o contexto do período', () => {
  assert.equal(routeHref('transactions'), '#transactions');
  const href = routeHref('transactions', {from: '2026-09-01', to: '2026-10-21', period: 'custom'});
  assert.equal(href, '#transactions?from=2026-09-01&to=2026-10-21&period=custom');
});

test('parâmetros de navegação codificam conteúdo sem criar novas chaves', () => {
  const href = routeHref('transactions', {record: 'salário & mercado?ação=editar', edit: '1'});
  const params = new URLSearchParams(href.split('?')[1]);
  assert.equal(params.get('record'), 'salário & mercado?ação=editar');
  assert.equal(params.get('edit'), '1');
  assert.deepEqual([...params.keys()], ['record', 'edit']);
});

test('links ignoram parâmetros ausentes e rejeitam nomes de páginas inválidos', () => {
  assert.equal(routeHref('bills', {kind: 'income', month: '', recurring: null, unused: undefined}), '#bills?kind=income');
  assert.equal(routeHref('bills', {count: 0, enabled: false}), '#bills?count=0&enabled=false');
  for (const page of ['/transactions', '../bills', 'javascript:alert(1)', 'bills?kind=income', '']) assert.throws(() => routeHref(page), /Página inválida/);
});

test('contexto do destino é consumido uma vez sem criar entrada extra no histórico', () => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');
  const calls = [];
  const currentLocation = {hash: '#bills?kind=income&month=2026-09&recurring=salary'};
  const state = {source: 'statement'};
  Object.defineProperty(globalThis, 'location', {configurable: true, value: currentLocation});
  Object.defineProperty(globalThis, 'history', {configurable: true, value: {state, replaceState: (...args) => {
    calls.push(args);
    currentLocation.hash = args[2];
  }}});
  try {
    const params = consumeRouteParams();
    assert.equal(params.get('kind'), 'income');
    assert.equal(params.get('month'), '2026-09');
    assert.equal(params.get('recurring'), 'salary');
    assert.deepEqual(calls, [[state, '', '#bills']]);
    assert.equal(consumeRouteParams().size, 0);
    assert.equal(calls.length, 1);
  } finally {
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else delete globalThis.location;
    if (originalHistory) Object.defineProperty(globalThis, 'history', originalHistory);
    else delete globalThis.history;
  }
});

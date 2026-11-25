import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eIngresso, percorsoPulito, daContare } from '../../sito/statico/js/conta.js';

// Un elemento finto: closest() risale ai genitori come nel DOM.
function finto(tag, { conta, padre } = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    dataset: conta ? { conta } : {},
    parentElement: padre ?? null,
    closest(sel) {
      if (sel !== '[data-conta]') throw new Error(sel);
      for (let x = this; x; x = x.parentElement) if (x.dataset.conta) return x;
      return null;
    },
  };
  return el;
}

test('eIngresso: da fuori o senza referrer sì, da dovaivoli.it no', () => {
  assert.equal(eIngresso('', 'dovaivoli.it'), true);
  assert.equal(eIngresso('https://www.instagram.com/', 'dovaivoli.it'), true);
  assert.equal(eIngresso('https://dovaivoli.it/roma/', 'dovaivoli.it'), false);
  assert.equal(eIngresso('non un indirizzo', 'dovaivoli.it'), true);
});

test('daContare: clic sul bottone dà il suo data-conta', () => {
  assert.equal(daContare({ type: 'click', button: 0, target: finto('a', { conta: 'kiwi' }) }), 'kiwi');
});

test('daContare: tasto destro no, centrale sì', () => {
  const a = finto('a', { conta: 'kiwi' });
  assert.equal(daContare({ type: 'auxclick', button: 2, target: a }), null);
  assert.equal(daContare({ type: 'auxclick', button: 1, target: a }), 'kiwi');
});

test('daContare: clic su select o input dei filtri non conta (conta il change)', () => {
  assert.equal(daContare({ type: 'click', button: 0, target: finto('select', { conta: 'filtro' }) }), null);
  assert.equal(daContare({ type: 'click', button: 0, target: finto('input', { conta: 'filtro' }) }), null);
  assert.equal(daContare({ type: 'click', button: 0, target: finto('a', { conta: 'filtro' }) }), 'filtro');
});

test('daContare: clic sullo span dentro il bottone risale al data-conta; fuori niente', () => {
  const a = finto('a', { conta: 'premium-passa' });
  assert.equal(daContare({ type: 'click', button: 0, target: finto('span', { padre: a }) }), 'premium-passa');
  assert.equal(daContare({ type: 'click', button: 0, target: finto('p') }), null);
  assert.equal(daContare({ type: 'click', button: 0, target: null }), null);
});

test('percorsoPulito toglie query e #', () => {
  assert.equal(percorsoPulito('/roma/'), '/roma/');
  assert.equal(percorsoPulito('/roma/?volo=x#a'), '/roma/');
});

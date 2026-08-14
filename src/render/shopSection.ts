import type { Game } from '../game';
import { CRATES, RARITY_COLOUR, RARITY_LABEL, REROLL_COST } from '../economy';
import type { CrateSpec, Rarity } from '../economy';
import { playCrateReveal } from './crateReveal';
import { drawBeyThumb } from './beyThumb';
import { themeById } from './theme';
import { LAYERS } from '../sim/parts';

/**
 * The crate shop.
 *
 * Two things it must do that a plain list of buttons would not:
 *
 *  - **Show the odds.** The rarity bar under each crate is generated from the
 *    crate's own `weights`, never hardcoded, so the display cannot drift from
 *    what `rollCrate` actually does. A shop that advertises odds it does not
 *    honour is the thing that makes this genre disreputable, and the honest
 *    version costs one loop.
 *  - **Refuse clearly.** An unaffordable crate is disabled *and* says how
 *    short you are, because "nothing happened when I clicked" is the worst
 *    possible answer to a purchase attempt.
 */

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Proportional odds bar, derived from the crate's own weights. */
function oddsBar(crate: CrateSpec): HTMLElement {
  const total = RARITIES.reduce((a, r) => a + crate.weights[r], 0) || 1;
  const bar = document.createElement('div');
  bar.className = 'crate-odds';
  for (const r of RARITIES) {
    const w = crate.weights[r];
    if (w <= 0) continue;
    const seg = document.createElement('i');
    seg.style.flexGrow = String(w);
    seg.style.background = hex(RARITY_COLOUR[r]);
    seg.title = `${RARITY_LABEL[r]} ${((w / total) * 100).toFixed(0)}%`;
    bar.appendChild(seg);
  }
  return bar;
}

export function shopSection(game: Game, onChange: () => void): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'slot shop';

  const head = document.createElement('div');
  head.className = 'shop-head';
  head.innerHTML =
    '<h4>Crates — spend what you have won</h4>' +
    `<span class="coin-pill"><b>${game.coins}</b> coins</span>`;
  sec.appendChild(head);

  const row = document.createElement('div');
  row.className = 'chips crate-row';

  for (const crate of CRATES) {
    const afford = game.canAfford(crate.id);
    const card = document.createElement('button');
    card.className = 'chip crate-card' + (afford ? '' : ' locked-part');
    card.disabled = !afford;

    const title = document.createElement('span');
    title.className = 'crate-title';
    title.innerHTML = `${escapeHtml(crate.name)}<br><small>${escapeHtml(crate.blurb)}</small>`;
    card.appendChild(title);
    card.appendChild(oddsBar(crate));

    const price = document.createElement('span');
    price.className = 'crate-price';
    price.textContent = afford
      ? `${crate.cost} coins`
      : `${crate.cost} — need ${crate.cost - game.coins} more`;
    card.appendChild(price);

    card.addEventListener('click', () => {
      // Re-checked rather than trusting the disabled flag: a stale render
      // after a purchase would otherwise let a second click through.
      const result = game.openCrate(crate.id);
      if (!result) return;
      playCrateReveal(result, onChange, themeById(game.themeId).toon ? 'anime' : 'classic');
    });

    row.appendChild(card);
  }

  sec.appendChild(row);

  const note = document.createElement('p');
  note.className = 'sub';
  note.style.margin = '10px 0 0';
  note.textContent =
    'Crates only ever contain parts the ladder also awards — they change the order you get things in, never what is reachable. Duplicates refund coins.';
  sec.appendChild(note);

  sec.appendChild(offerBlock(game, onChange));

  return sec;
}

/**
 * The rotating offer.
 *
 * The crate above is chance; this is choice. It exists so a player who wants a
 * specific part never has to gamble for it — they can see the price, save for
 * it, and buy it. Without this the only route to a particular legendary is
 * pulling Relic Crates until one happens to be the right one, and a collection
 * game whose only acquisition path is a slot machine is a slot machine.
 *
 * It restocks free after every match, so looking is never something you pay
 * for. The paid reroll is for impatience.
 */
function offerBlock(game: Game, onChange: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'offer';

  const head = document.createElement('div');
  head.className = 'shop-head';
  head.innerHTML = '<h4>Today’s shelf — buy exactly what you want</h4>';

  const slots = game.offer;

  const reroll = document.createElement('button');
  reroll.className = 'chip reroll-btn';
  const canReroll = game.coins >= REROLL_COST && slots.length > 0;
  reroll.disabled = !canReroll;
  reroll.innerHTML = `<span>Reroll</span><small>${REROLL_COST} coins</small>`;
  reroll.addEventListener('click', () => {
    if (game.rerollOffer()) onChange();
  });
  head.appendChild(reroll);
  wrap.appendChild(head);

  if (slots.length === 0) {
    const done = document.createElement('p');
    done.className = 'sub';
    done.style.margin = '8px 0 0';
    done.textContent = 'Nothing left to sell you — the catalog is complete.';
    wrap.appendChild(done);
    return wrap;
  }

  const row = document.createElement('div');
  row.className = 'chips offer-row';

  for (const slot of slots) {
    const r = slot.reward;
    const afford = game.coins >= slot.price;
    const card = document.createElement('button');
    card.className = `chip offer-card r-${r.rarity}` + (afford ? '' : ' locked-part');
    card.style.setProperty('--rar', hex(RARITY_COLOUR[r.rarity]));
    card.disabled = !afford;

    // Layers get their real plan view; a disc or driver has no silhouette worth
    // 56px, and a made-up one would be worse than none.
    if (r.kind === 'layers' && LAYERS.some((l) => l.id === r.id)) {
      const canvas = document.createElement('canvas');
      canvas.className = 'offer-art';
      // Same set the garage picker draws, or the shop sells a bey that looks
      // nothing like the one the player receives.
      drawBeyThumb(canvas, r.id, 56, themeById(game.themeId).toon ? 'anime' : 'classic');
      card.appendChild(canvas);
    } else {
      const glyph = document.createElement('span');
      glyph.className = 'offer-glyph';
      glyph.textContent = r.name.slice(0, 2).toUpperCase();
      card.appendChild(glyph);
    }

    const text = document.createElement('span');
    text.className = 'offer-text';
    text.innerHTML =
      `<b>${escapeHtml(r.name)}</b>` +
      `<small class="offer-rarity">${RARITY_LABEL[r.rarity]} ${KIND_WORD[r.kind]}</small>` +
      `<small class="crate-price">${afford ? `${slot.price} coins` : `${slot.price} — need ${slot.price - game.coins} more`}</small>`;
    card.appendChild(text);

    card.addEventListener('click', () => {
      if (game.buyOffer(r.kind, r.id)) onChange();
    });

    row.appendChild(card);
  }

  wrap.appendChild(row);
  return wrap;
}

const KIND_WORD: Record<string, string> = {
  layers: 'layer',
  discs: 'disc',
  drivers: 'driver',
  skins: 'finish',
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

import type { Game } from '../game';
import { CRATES, RARITY_COLOUR, RARITY_LABEL } from '../economy';
import type { CrateSpec, Rarity } from '../economy';
import { playCrateReveal } from './crateReveal';

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
      playCrateReveal(result, onChange);
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

  return sec;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export async function animateArchiveRestore(crate: HTMLDivElement | null, target: HTMLButtonElement | null, restored: Set<string>) {
  if (!crate || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return;
  const sleeves = Array.from(crate.querySelectorAll<HTMLElement>('[data-flight-song]'))
    .filter(source => restored.has(source.dataset.flightSong ?? ''));
  const restingSleeve = crate.querySelector<HTMLElement>('.archive-record-art');
  const front = crate.querySelector('.archive-crate-front')?.getBoundingClientRect();
  if (!restingSleeve || !front) return;
  const fallback = restingSleeve.getBoundingClientRect();
  const destination = target.getBoundingClientRect();
  const endX = destination.left + destination.width / 2;
  const endY = Math.max(16, Math.min(window.innerHeight - 16, destination.top + destination.height / 2));

  await Promise.all(sleeves.slice(0, 6).map(async (source, index) => {
    const cover = source.querySelector<HTMLElement>('.record-sleeve');
    if (!cover) return;
    const artwork = source.querySelector<HTMLElement>('.archive-record-art');
    const bounds = artwork?.getBoundingClientRect() ?? fallback;
    const size = restingSleeve.offsetWidth;
    const left = bounds.left + (artwork ? 0 : index * 5);
    const top = Math.max(16, Math.min(window.innerHeight - size / 2, bounds.top));
    const centerX = left + size / 2;
    const edge = centerX <= front.right
      ? front.top + (centerX - front.left) * .18
      : front.top + front.width * .18 - (centerX - front.right) * .4;
    const tucked = Math.max(0, Math.min(size * .65, bounds.bottom - size * .09 - edge));
    const travelX = endX - centerX;
    const travelY = endY - top - size / 2;
    const ghost = document.createElement('div');
    ghost.className = 'archive-restore-sleeve';
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` });
    ghost.append(cover.cloneNode(true));
    document.body.append(ghost);
    try {
      const flight = ghost.animate([
        { transform: 'skewY(10.2deg) skewX(-6deg)', clipPath: `inset(0 0 ${tucked}px 0)`, opacity: 1 },
        { transform: 'translate(-5px, -52px) rotate(-4deg) scale(1.04)', clipPath: 'inset(0)', opacity: 1, offset: .3 },
        { transform: `translate(${travelX}px, ${travelY}px) rotate(-12deg) scale(.12)`, clipPath: 'inset(0)', opacity: 0 },
      ], { duration: 690, delay: index * 55, easing: 'cubic-bezier(.23,.62,.32,1)', fill: 'both' });
      if (artwork) source.dataset.leaving = 'true';
      await flight.finished.catch(() => {});
    } finally {
      ghost.remove();
    }
  }));
  if (target.isConnected && sleeves.length) target.animate([
    { boxShadow: 'inset 0 0 0 2px #91a282' },
    { boxShadow: 'inset 0 0 0 2px transparent' },
  ], { duration: 230, easing: 'ease-out' });
}

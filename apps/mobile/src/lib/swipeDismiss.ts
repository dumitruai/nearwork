/** Upward drag-to-dismiss that keeps taps and keyboard activation intact. */
export function swipeDismiss(node: HTMLElement, options: { key: object; closing: boolean; dismiss: () => void; pause: () => void; resume: () => void }) {
  let pointer: { id: number; x: number; y: number } | null = null;
  let offset = 0, dragging = false, exiting = false, suppressClick = false;
  let animation: Animation | undefined;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const transform = (y: number) => `translate(-50%, ${y}px)`;
  function reset() {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && node.hasPointerCapture(id)) node.releasePointerCapture(id);
    animation?.cancel();
    animation = undefined;
    offset = 0; dragging = false; exiting = false;
    node.inert = false;
    node.style.removeProperty('transform');
    node.style.removeProperty('opacity');
  }
  function enter() {
    if (reducedMotion()) return;
    animation = node.animate([
      { transform: transform(-node.getBoundingClientRect().bottom - 16), opacity: 0 },
      { transform: transform(0), opacity: 1 },
    ], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
  function exit() {
    if (exiting) return;
    const currentStyle = getComputedStyle(node);
    const fromTransform = currentStyle.transform;
    const fromOpacity = currentStyle.opacity;
    // Include any in-progress entrance, drag or return animation.
    const rect = node.getBoundingClientRect();
    const restBottom = node.offsetTop + node.offsetHeight;
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && node.hasPointerCapture(id)) node.releasePointerCapture(id);
    animation?.cancel();
    exiting = true;
    node.inert = true;
    options.pause();
    const dismiss = options.dismiss;
    if (reducedMotion()) { dismiss(); return; }
    const current = animation = node.animate([
      { transform: fromTransform, opacity: fromOpacity },
      { transform: transform(-Math.max(restBottom, rect.height) - 16), opacity: 0 },
    ], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    void current.finished.then(() => { if (animation === current) dismiss(); }).catch(() => {});
  }
  function settle() {
    const from = offset;
    reset();
    if (from && !reducedMotion()) {
      animation = node.animate([
        { transform: transform(from), opacity: Math.max(.45, 1 + from / 220) },
        { transform: transform(0), opacity: 1 },
      ], { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    options.resume();
  }
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || exiting) return;
    reset();
    suppressClick = false;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    options.pause();
  }
  function move(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dy = event.clientY - pointer.y, dx = event.clientX - pointer.x;
    if (!dragging) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { settle(); return; }
      if (dy > -6 || Math.abs(dy) <= Math.abs(dx)) return;
      dragging = true;
      suppressClick = true;
      node.setPointerCapture(event.pointerId);
    }
    offset = Math.max(-node.offsetHeight - 40, Math.min(0, dy));
    node.style.transform = transform(offset);
    node.style.opacity = String(Math.max(.45, 1 + offset / 220));
  }
  function up(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!dragging || offset > -40) { settle(); return; }
    exit();
  }
  function cancel(event: PointerEvent) {
    if (pointer?.id === event.pointerId) settle();
  }
  function click(event: MouseEvent) {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('lostpointercapture', cancel);
  node.addEventListener('click', click, true);
  enter();
  return {
    update(next: typeof options) {
      if (next.key !== options.key) { reset(); suppressClick = false; enter(); }
      options = next;
      if (options.closing) exit();
    },
    destroy() {
      reset();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('lostpointercapture', cancel);
      node.removeEventListener('click', click, true);
    },
  };
}

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import BottomNav from './BottomNav.svelte';
  import Saved from './Saved.svelte';
  import Connections from './Connections.svelte';
  import Profile from './Profile.svelte';
  import Location from './Location.svelte';
  import Jobs from './Jobs.svelte';
  import LiveChat from './LiveChat.svelte';
  import LiveChats from './LiveChats.svelte';
  import type { Conversation } from '../lib/api';
  import { connectChat } from '../lib/realtime';
  import { swipeDismiss } from '../lib/swipeDismiss';
  import { registerBack } from '../lib/native';
  import { Heart, X, MapPin, Briefcase, CalendarBlank, SignOut, ArrowRight } from 'phosphor-svelte';
  import { api, formatLocation, type Account, type Job, type Point } from '../lib/api';
  let { account, point, onrefresh, onpoint, onsignout }: { account: Account; point: Point | null; onrefresh: () => Promise<void>; onpoint: (value: Point | null) => void; onsignout: () => void } = $props();
  let editing = $state(false), locationOpen = $state(false);
  function onprofile() { tab = 'profile'; editing = true; }
  function onlocation() { locationOpen = true; }
  async function profileSaved() { await onrefresh(); editing = false; notify('Profile updated.'); }
  async function locationSaved(value: Point | null) { onpoint(value); await onrefresh(); locationOpen = false; void load(); }

  const needsLocation = $derived(!account.preferences?.locationSource || !point);
  let total = $state(0);
  let jobs = $state<Job[]>([]);
  let busy = $state(false);
  let loading = $state(true);
  let error = $state('');
  let feedback = $state('');
  let detailsOpen = $state(false);
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(message: string) {
    clearTimeout(feedbackTimer);
    feedback = message;
    feedbackTimer = setTimeout(() => feedback = '', 4000);
  }
  function showDialog(node: HTMLDialogElement) { node.showModal(); }
  let tab = $state(untrack(() => account.user.profileType === 'employer' ? 'profile' : 'discover'));
  let conversation = $state<Conversation | null>(null);
  let savedSegment = $state<'interested' | 'matches'>('interested');
  onMount(() => registerBack(() => {
    if (busy) return true;
    if (conversation) { conversation = null; return true; }
    if (locationOpen) { locationOpen = false; return true; }
    if (editing) { editing = false; return true; }
    const root = account.user.profileType === 'employer' ? 'profile' : 'discover';
    if (tab !== root) { tab = root; void load(); return true; }
    return false;
  }, -10));
  let unreadCount = $state(0);
  let interestCount = $state(0);
  let refreshCounters = $state<() => void>(() => {});
  let messageNotice = $state<{ thread: Conversation; body: string } | null>(null);
  let messageNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  let messageNoticeClosing = $state(false);
  let noticeVersion = 0;
  const canShowMessageNotice = (conversationId: string) =>
    !locationOpen && !detailsOpen && conversation?.id !== conversationId;
  function dismissMessageNotice() {
    noticeVersion++;
    clearTimeout(messageNoticeTimer);
    messageNoticeClosing = true;
  }
  function removeMessageNotice() {
    noticeVersion++;
    clearTimeout(messageNoticeTimer);
    messageNotice = null;
    messageNoticeClosing = false;
  }
  function expireMessageNotice() {
    clearTimeout(messageNoticeTimer);
    messageNoticeTimer = setTimeout(dismissMessageNotice, 8000);
  }
  function openMessageNotice() {
    if (!messageNotice) return;
    conversation = messageNotice.thread;
    removeMessageNotice();
  }
  $effect(() => {
    if (messageNotice && !canShowMessageNotice(messageNotice.thread.id)) removeMessageNotice();
  });
  onMount(() => {
    let alive = true, fetching = false, queued = false, connected = false;
    const seenMessages = new Set<string>();
    async function showMessageNotice(conversationId: string, body: string) {
      const version = ++noticeVersion;
      // Resolve the actual thread, including sender name and job details, before offering navigation.
      try {
        for (let offset = 0; alive && version === noticeVersion; offset += 100) {
          const rows = await api<Conversation[]>(`conversations?limit=100&offset=${offset}`);
          if (!alive || version !== noticeVersion || !canShowMessageNotice(conversationId) || document.visibilityState !== 'visible') return;
          const thread = rows.find(row => row.id === conversationId);
          if (thread) {
            messageNoticeClosing = false;
            messageNotice = { thread, body };
            expireMessageNotice();
            return;
          }
          if (rows.length < 100) return;
        }
      } catch { /* The unread badge remains available if thread details cannot be loaded. */ }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refreshUnread() {
      if (!alive) return;
      if (fetching) { queued = true; return; }
      fetching = true;
      try {
        const result = await api<{ count: number }>('conversations/unread');
        if (alive) unreadCount = result.count;
        if (account.user.profileType === 'employer') {
          const interests = await api<{ count: number }>('employer/interests/count');
          if (alive) interestCount = interests.count;
        }
      } catch { /* Keep the last confirmed count; reconnect/focus/poll retries. */ }
      finally {
        fetching = false;
        if (queued && alive) { queued = false; void refreshUnread(); }
      }
    }
    const realtime = connectChat({
      ready: () => void refreshUnread(),
      status: value => { connected = value; },
      event: event => {
        if (event.type === 'message' && event.data?.id && !seenMessages.has(event.data.id)) {
          seenMessages.add(event.data.id);
          if (seenMessages.size > 200) seenMessages.delete(seenMessages.values().next().value!);
          if (event.data.senderUserId !== account.user.id && typeof event.data.body === 'string'
            && canShowMessageNotice(event.conversationId) && document.visibilityState === 'visible') {
            void showMessageNotice(event.conversationId, event.data.body);
          }
        }
        if (!['message', 'read', 'conversation'].includes(event.type)) return;
        clearTimeout(timer);
        timer = setTimeout(() => void refreshUnread(), 100);
      },
    });
    // Persisted changes (including demo welcome messages) can have no live event.
    refreshCounters = () => void refreshUnread();
    const fallback = setInterval(() => { if (!connected && document.visibilityState === 'visible') void refreshUnread(); }, 15000);
    void refreshUnread();
    return () => {
      alive = false; clearTimeout(timer); clearInterval(fallback); realtime.close();
      refreshCounters = () => {};
      removeMessageNotice();
    };
  });
  let requestId = 0;
  let card = $state<HTMLElement>();
  let dragStart: { x: number; y: number; pointerId: number } | null = null;
  let dragX = $state(0);
  let dragY = $state(0);
  let dragging = $state(false);
  let direction = $state<'pass' | 'interested' | null>(null);
  let mounted = true;
  let exitAnimation: Animation | undefined;
  let settleAnimation: Animation | undefined;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pose = (x: number, y = 0) =>
    `perspective(1100px) translate3d(${x}px, ${y}px, 0) rotateX(${-y / 12}deg) rotateY(${x / 65}deg) rotateZ(${Math.max(-3, Math.min(3, x / 40))}deg)`;
  function settleCard() {
    if (!card || reducedMotion() || (!dragX && !dragY)) return;
    settleAnimation?.cancel();
    const animation = card.animate([
      { transform: getComputedStyle(card).transform, offset: 0 },
      { transform: pose(-dragX * .045, -dragY * .045), offset: .65 },
      { transform: pose(0), offset: 1 },
    ], { duration: 480, easing: 'cubic-bezier(.22,.75,.3,1)', fill: 'both' });
    settleAnimation = animation;
    void animation.finished.catch(() => {}).finally(() => animation.cancel());
  }
  function resetDrag() {
    settleCard();
    dragStart = null;
    dragging = false;
    dragX = 0;
    dragY = 0;
    direction = null;
  }
  function startDrag(event: PointerEvent) {
    if (busy || !event.isPrimary || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    settleAnimation?.cancel();
    dragStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    card?.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent) {
    if (!dragStart || dragStart.pointerId !== event.pointerId || busy) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    // Leave vertical gestures to native scrolling, including on long cards.
    if (!dragging && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      resetDrag();
      return;
    }
    if (!dragging && Math.abs(dx) < 8) return;
    dragging = true;
    dragX = Math.max(-240, Math.min(240, dx));
    dragY = Math.max(-8, Math.min(8, dy * .12));
    direction = dx > 0 ? 'interested' : 'pass';
  }
  function endDrag(event: PointerEvent) {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const commit = dragging && Math.abs(dragX) >= 90;
    const decision = dragX > 0 ? 'interested' : 'pass';
    dragStart = null;
    dragging = false;
    if (card?.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    if (commit) void decide(decision);
    else resetDrag();
  }
  async function exitCard(decision: 'pass' | 'interested') {
    if (!mounted || !card || reducedMotion()) return;
    const sign = decision === 'interested' ? 1 : -1;
    settleAnimation?.cancel();
    exitAnimation = card.animate([
      { transform: getComputedStyle(card).transform, opacity: 1, offset: 0 },
      { transform: pose(sign * card.offsetWidth * .55, -12), opacity: .95, offset: .6 },
      { transform: pose(sign * (card.offsetWidth + 90), 24), opacity: 0, offset: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' });
    await exitAnimation.finished.catch(() => {});
  }
  const employer = $derived(account.user.profileType === 'employer');
  const pay = (job: Job) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(job.hourlyPayMinor / 100);
  async function load() {
    const id = ++requestId;
    loading = true; error = '';
    try {
      if (employer || needsLocation) { jobs = []; total = 0; return; }
        const query = point ? `?latitude=${point.latitude}&longitude=${point.longitude}` : '';
        const result = await api<{ items: Job[]; total: number }>(`jobs${query}`);
        if (id === requestId) { jobs = result.items; total = result.total; }
    } catch (e) { if (id === requestId) error = (e as Error).message; }
    finally { if (id === requestId) loading = false; }
  }
  onMount(() => {
    return () => { mounted = false; requestId++; clearTimeout(feedbackTimer); exitAnimation?.cancel(); settleAnimation?.cancel(); };
  });
  $effect(() => {
    const locationKey = `${point?.latitude},${point?.longitude},${needsLocation}`;
    untrack(() => { if (tab === 'discover') void load(); });
  });
  async function decide(decision: 'pass' | 'interested') {
    if (busy || !jobs[0]) return;
    busy = true; error = ''; feedback = ''; direction = decision;
    // Give buttons an immediate, subtle lean while the API persists the decision.
    if (!dragX) dragX = decision === 'interested' ? 22 : -22;
    try {
      const result = await api<{ match: { source: string } | null }>(`jobs/${jobs[0].id}/decision`, { decision });
      refreshCounters();
      // Only dismiss a card once its decision is safely persisted.
      await exitCard(decision);
      if (!mounted) return;
      jobs = jobs.slice(1); total = Math.max(0, total - 1);
      // The old card has exited; do not start a return animation on it.
      dragX = 0; dragY = 0;
      resetDrag();
      notify(result.match ? 'You’re a match! Open Chats to start a conversation.' : decision === 'interested' ? 'Interest saved. You’ll find this role in Saved.' : 'Passed. On to the next opportunity.');
      if (!jobs.length) await load();
    } catch (e) { resetDrag(); error = `${(e as Error).message} Your card is still here; try again.`; }
    finally { busy = false; }
  }
</script>
{#if conversation}
  {#key conversation.id}<LiveChat {account} {conversation} backLabel={`Back to ${tab}`} onback={() => conversation = null} />{/key}
{:else if locationOpen}
  <Location {account} {point} oncancel={() => locationOpen = false} oncomplete={locationSaved} />
{:else}
  <header class="app-home-header"><span class="wordmark">nearwork.</span>{#if tab === 'profile'}<button class="secondary profile-signout" onclick={onsignout}><SignOut size={18} />Sign out</button>{/if}</header>
  <div class="employee-content" class:discovery-content={tab === 'discover'}>
  {#if tab === 'discover'}
    <div class="discovery-location"><MapPin size={24} weight="fill" /><div class="location-copy"><strong>{point ? formatLocation(point) : 'Choose a location'}</strong><span>Within {(account.preferences?.radiusMeters ?? 5000) / 1000} km</span></div><button class="link location-action" disabled={busy} onclick={onlocation} aria-label="Edit discovery location">Edit</button></div>
    {#if needsLocation}<div class="no-results"><MapPin size={56} weight="light" /><h2>Find work near you</h2><p>Use your device location or choose an area manually to find nearby jobs. Your Saved jobs and Chats are available below.</p><button class="primary" onclick={onlocation}>Set location</button></div>
    {:else if loading}<p class="loading" role="status">Finding nearby opportunities…</p>
    {:else if jobs[0]}
      <p class="muted" role="status">{total} jobs within {(account.preferences?.radiusMeters ?? 5000) / 1000} km</p>
      {@const job = jobs[0]}
      {#key job.id}
      <div class="card-stage" class:has-next={jobs.length > 1}>
      <div class="card-entrance">
      <article bind:this={card} class="job-card" class:dragging class:deciding={busy}
        style:transform={reducedMotion() ? 'none' : pose(dragX, dragY)}
        onpointerdown={startDrag} onpointermove={moveDrag} onpointerup={endDrag}
        onpointercancel={resetDrag} onlostpointercapture={() => { if (dragStart) resetDrag(); }}>
        {#if direction}<div class="swipe-label" class:pass={direction === 'pass'} aria-hidden="true">{direction === 'pass' ? 'Pass' : 'Interested'}</div>{/if}
        <div class="job-top"><span class="eyebrow">{job.category}</span></div>
        <h1 class:long-role={job.role.length > 16} class="job-role">{job.role}</h1>
        <p class="job-company">{job.companyName}</p>
        <p class="pay">{pay(job)}<span> / hour</span></p>
        <div class="job-details">
          <p><MapPin size={25} weight="fill" /><span>{((job.distanceMeters ?? 0) / 1000).toFixed(1)} km away</span></p>
          <p><Briefcase size={25} weight="fill" /><span>{job.weeklyHoursMin === job.weeklyHoursMax ? job.weeklyHoursMin : `${job.weeklyHoursMin}–${job.weeklyHoursMax}`} hours/week</span></p>
          <p><CalendarBlank size={25} weight="bold" /><span>{job.scheduleSummary}</span></p>
        </div>
        <p class="job-description">{job.description}</p>
        <button class="card-details-link" disabled={busy} onclick={() => detailsOpen = true}>View full job details</button>
      </article>
      </div>
      </div>
      {/key}
      <div class="swipe-actions" aria-label="Job decisions">
        <button disabled={busy} onclick={() => decide('pass')}><span class="action-circle"><X size={28} weight="bold" /></span><span>Pass</span></button>
        <button disabled={busy} onclick={() => decide('interested')}><span class="action-circle interested"><Heart size={28} weight="bold" /></span><span>Interested</span></button>
      </div>
      {#if busy}<p class="saving-status sr-only" role="status">Saving your decision…</p>{/if}
    {:else if !error}<div class="no-results"><MapPin size={56} weight="light" /><h2>No more jobs within {(account.preferences?.radiusMeters ?? 5000) / 1000} km.</h2><p>You’ve reviewed the available roles, or none match your preferences yet.</p><button class="secondary full" onclick={onprofile}>Change distance or preferences</button></div>{/if}
  {:else if tab === 'saved'}
    <Saved {account} {point} bind:segment={savedSegment} ondiscover={() => { tab = 'discover'; void load(); }} onchat={value => conversation = value} />
  {:else if tab === 'chats'}
    <LiveChats {account} onopen={value => conversation = value} />
  {:else if tab === 'jobs'}
    <Jobs {account} />
  {:else if editing || !employer}
    <section class="screen-section"><Profile {account} oncomplete={profileSaved} />{#if !employer}<button class="secondary full" onclick={onlocation}>Location & distance</button>{/if}</section>
  {:else}
    <section class="profile-overview"><p class="eyebrow">EMPLOYER PROFILE</p><h1 class="identity-title">{account.profile?.companyName}</h1><button class="link edit-profile" onclick={() => editing = true}>Edit profile</button><p class="capitalize">{account.profile?.industry}</p><p class="inline-icon"><MapPin size={19} />{account.profile?.workplaceLabel}</p><button class="manage-jobs" onclick={() => tab = 'jobs'}><Briefcase size={25} /><span><strong>Manage your jobs</strong><small>Post roles and manage your listings</small></span><ArrowRight size={22} /></button><Connections {account} {interestCount} onchange={refreshCounters} onchat={value => conversation = value} /></section>
  {/if}
  {#if error}<div class="discovery-error" role="alert"><p>{error}</p><button class="link" disabled={busy} onclick={load}>Retry loading</button><button class="link" onclick={() => error = ''}>Dismiss</button></div>{/if}
  </div>
  <BottomNav role={account.user.profileType} active={tab} {unreadCount} {interestCount} disabled={busy} onchange={value => { requestId++; loading = false; tab = value; editing = false; error = ''; refreshCounters(); if (value === 'discover') void load(); }} />
{/if}
{#if messageNotice && canShowMessageNotice(messageNotice.thread.id)}
  <div class="feedback-toast message-toast" role="status"
    use:swipeDismiss={{ key: messageNotice, closing: messageNoticeClosing, dismiss: removeMessageNotice, pause: () => clearTimeout(messageNoticeTimer), resume: expireMessageNotice }}
    onmouseenter={() => clearTimeout(messageNoticeTimer)} onmouseleave={expireMessageNotice}
    onfocusin={() => clearTimeout(messageNoticeTimer)} onfocusout={expireMessageNotice}>
    <button class="message-toast-open" onclick={openMessageNotice} aria-label={`Open chat with ${account.user.profileType === 'employee' ? messageNotice.thread.companyName : messageNotice.thread.employeeName}`}>
      <strong>{account.user.profileType === 'employee' ? messageNotice.thread.companyName : messageNotice.thread.employeeName}</strong>
      <span>{messageNotice.body}</span>
      <small>Tap to open chat</small>
    </button>
    <button class="icon" aria-label="Dismiss message notification" onclick={dismissMessageNotice}><X size={18} /></button>
  </div>
{:else if feedback}
  <div class="feedback-toast" role="status"><span>{feedback}</span><button class="icon" aria-label="Dismiss notification" onclick={() => { clearTimeout(feedbackTimer); feedback = ''; }}><X size={18} /></button></div>
{/if}
{#if detailsOpen && jobs[0]}
  {@const job = jobs[0]}
  <dialog class="sheet job-detail-sheet" use:showDialog onclose={() => detailsOpen = false} aria-label="Full job details">
    <button class="icon detail-close" aria-label="Close job details" onclick={() => detailsOpen = false}><X size={24} /></button>
    <h2>{job.role}</h2><p>{job.companyName}</p><p>{pay(job)} / hour</p>
    <p>{job.areaLabel} · {((job.distanceMeters ?? 0) / 1000).toFixed(1)} km away</p>
    <p>{job.weeklyHoursMin}–{job.weeklyHoursMax} hours/week</p>
    <p>{job.scheduleSummary}</p><p>{job.description}</p>
  </dialog>
{/if}
{#if employer && error}<p class="error" role="alert">{error}</p><button class="secondary full" disabled={busy} onclick={load}>Retry loading</button>{/if}

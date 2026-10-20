<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowLeft, ArrowRight, Check, Checks, X } from 'phosphor-svelte';
  import { api, initials, money, type Account, type Conversation, type Message, type Job } from '../lib/api';
  import { connectChat } from '../lib/realtime';
  let { account, conversation, onback, backLabel = 'Back to chats' }: { account: Account; conversation: Conversation; onback: () => void; backLabel?: string } = $props();
  type Outbox = { clientMessageId: string; body: string; createdAt: string; state: 'sending' | 'failed' };
  let messages = $state<Message[]>([]), pending = $state<Outbox[]>([]);
  let draft = $state(''), error = $state(''), loading = $state(true), olderBusy = $state(false), connected = $state(false), typing = $state(false);
  let nextCursor = $state<string | null>(null), scroller = $state<HTMLDivElement>();
  let job = $state<Job | null>(null), jobOpen = $state(false);
  let alive = true, reading = false, fetching = false, resync = false;
  let realtime: ReturnType<typeof connectChat> | undefined;
  let readTimer: ReturnType<typeof setTimeout> | undefined, typingTimer: ReturnType<typeof setTimeout> | undefined;
  const counterpart = $derived(account.user.profileType === 'employee' ? conversation.companyName : conversation.employeeName);
  const time = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function merge(incoming: Message[]) {
    const map = new Map(messages.map(m => [m.id, m]));
    incoming.forEach(m => map.set(m.id, { ...m, readAt: m.readAt ?? map.get(m.id)?.readAt ?? null }));
    messages = [...map.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const sent = new Set(messages.filter(m => m.senderUserId === account.user.id).map(m => m.clientMessageId));
    pending = pending.filter(m => !sent.has(m.clientMessageId));
  }
  function markVisibleRead() { clearTimeout(readTimer); readTimer = setTimeout(() => void acknowledge(), 200); }
  async function acknowledge() {
    if (!alive || reading || !scroller || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const bounds = scroller.getBoundingClientRect();
    const visible = new Set(Array.from(scroller.querySelectorAll<HTMLElement>('[data-message-id]')).filter(el => {
      const rect = el.getBoundingClientRect(); return rect.top < bounds.bottom && rect.bottom > bounds.top;
    }).map(el => el.dataset.messageId));
    const ids = messages.filter(m => m.senderUserId !== account.user.id && !m.readAt && visible.has(m.id)).map(m => m.id).slice(0,100);
    if (!ids.length) return;
    reading = true;
    try {
      const result = await api<{ items: { id: string; readAt: string }[] }>(`conversations/${conversation.id}/read`, { messageIds: ids });
      if (alive) { applyReads(result.items); markVisibleRead(); }
    } catch { /* Retry after reconnect, focus, or another visible message. */ }
    finally { reading = false; }
  }
  function applyReads(items: { id: string; readAt: string }[]) {
    const read = new Map(items.map(m => [m.id, m.readAt]));
    messages = messages.map(m => read.has(m.id) ? { ...m, readAt: read.get(m.id)! } : m);
  }
  async function load(older = false) {
    if (fetching) { if (!older) resync = true; return; }
    if (older && !nextCursor) return;
    fetching = true; olderBusy = older;
    const oldest = messages[0];
    const oldHeight = scroller?.scrollHeight ?? 0;
    const atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 70;
    let cursor = older ? nextCursor : null;
    try {
      do {
        const result: { items: Message[]; nextCursor: string | null } = await api(`conversations/${conversation.id}/messages?limit=100${cursor ? `&before=${cursor}` : ''}`);
        if (!alive) return;
        merge(result.items); cursor = result.nextCursor;
        // Reconnect refreshes all previously loaded history, including read receipts,
        // and walks every page of messages received during the disconnection.
        if (older || !oldest || result.items.some(m => m.id === oldest.id) || !cursor) { nextCursor = cursor; break; }
      } while (cursor);
      loading = false; error = ''; await tick();
      if (scroller) {
        if (older) scroller.scrollTop += scroller.scrollHeight - oldHeight;
        else if (atBottom) scroller.scrollTop = scroller.scrollHeight;
      }
      markVisibleRead();
    } catch (e) { if (alive) error = (e as Error).message; }
    finally { fetching = false; olderBusy = false; loading = false; if (resync && alive) { resync = false; void load(); } }
  }
  async function send(item: Outbox) {
    pending = pending.map(p => p.clientMessageId === item.clientMessageId ? { ...p, state: 'sending' } : p);
    try {
      const result = await api<Message>(`conversations/${conversation.id}/messages`, { clientMessageId: item.clientMessageId, body: item.body });
      if (!alive) return;
      merge([result]); await load(); await tick(); if (scroller) scroller.scrollTop = scroller.scrollHeight;
    } catch { if (alive) pending = pending.map(p => p.clientMessageId === item.clientMessageId ? { ...p, state: 'failed' } : p); }
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault(); const body = draft.trim(); if (!body) return;
    const item: Outbox = { clientMessageId: crypto.randomUUID(), body, createdAt: new Date().toISOString(), state: 'sending' };
    pending = [...pending, item]; draft = ''; await tick(); if (scroller) scroller.scrollTop = scroller.scrollHeight; void send(item);
  }
  async function viewJob() { try { job = await api<Job>(`jobs/${conversation.jobId}`); jobOpen = true; } catch(e) { error = (e as Error).message; } }
  function showDialog(node: HTMLDialogElement) { node.showModal(); }
  function back() { if (pending.length) { error = 'Send or discard unsent messages before leaving.'; return; } onback(); }
  function clearTyping() { typing = false; clearTimeout(typingTimer); }
  onMount(() => {
    void load();
    realtime = connectChat({ conversationId: conversation.id, status: value => { connected = value; if (!value) clearTyping(); }, ready: () => void load(), event: async event => {
      if (event.conversationId !== conversation.id) return;
      if (event.type === 'message') {
        if (event.data.senderUserId !== account.user.id) clearTyping();
        const bottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 70;
        merge([event.data]); await tick(); if (!alive) return;
        if (bottom && scroller) scroller.scrollTop = scroller.scrollHeight; markVisibleRead();
      } else if (event.type === 'read') applyReads(event.data.items);
      else if (event.type === 'typing' && event.data.userId !== account.user.id) { typing = true; clearTimeout(typingTimer); typingTimer = setTimeout(clearTyping, 2500); }
    }});
    const focus = () => { if (document.visibilityState === 'visible') markVisibleRead(); };
    const fallback = setInterval(() => { if (!connected && document.visibilityState === 'visible') void load(); }, 10000);
    const unload = (e: BeforeUnloadEvent) => { if (pending.length) e.preventDefault(); };
    window.addEventListener('focus', focus); window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', focus);
    return () => { alive = false; realtime?.close(); clearInterval(fallback); clearTimeout(readTimer); clearTimeout(typingTimer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', focus); window.removeEventListener('beforeunload', unload); };
  });
</script>
<section class="conversation-screen">
  <header class="conversation-header"><button class="icon" aria-label={backLabel} onclick={back}><ArrowLeft size={26} /></button><span class="avatar">{initials(counterpart)}</span><div><h1>{counterpart}</h1><p>{conversation.jobRole} · {conversation.companyName}</p></div></header>
  <div class="conversation-context"><Check size={18} />Mutual match · <button class="link" onclick={viewJob}>View job</button></div>
  {#if !connected}<p class="chat-connection-status" role="status">Connecting live updates. Messages refresh automatically.</p>{/if}
  {#if error}<div class="chat-error" role="alert">{error}<button class="link" onclick={() => load()}>Retry loading messages</button></div>{/if}
  <div class="messages-scroll" bind:this={scroller} onscroll={markVisibleRead}>
    {#if nextCursor}<button class="link full" disabled={olderBusy} onclick={() => load(true)}>{olderBusy ? 'Loading…' : 'Load older messages'}</button>{/if}
    {#if loading}<p role="status">Loading conversation…</p>{:else if !error && !messages.length && !pending.length}<p class="chat-empty">You’re a match. Say hello and talk about the role.</p>{/if}
    {#each messages as message, i (message.id)}
      {#if i === 0 || new Date(message.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString()}<p class="date-divider">{new Date(message.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>{/if}
      <div class="message" class:outgoing={message.senderUserId === account.user.id} data-message-id={message.id}>
        <p class="bubble">{message.body}</p><span class="message-meta">{time(message.createdAt)}{#if message.senderUserId === account.user.id} · {message.readAt ? 'Read' : 'Sent'} {#if message.readAt}<Checks size={16} />{:else}<Check size={16} />{/if}{/if}</span>
      </div>
    {/each}
    {#each pending as item (item.clientMessageId)}<div class="message outgoing"><p class="bubble">{item.body}</p><span class="message-meta">{time(item.createdAt)} · {item.state === 'sending' ? 'Sending…' : 'Failed'}</span>{#if item.state === 'failed'}<div class="retry-actions"><button class="link" onclick={() => send(item)}>Retry</button><button class="link" onclick={() => pending = pending.filter(p => p.clientMessageId !== item.clientMessageId)}>Discard</button></div>{/if}</div>{/each}
  </div>
  <p class="chat-typing-status" role="status" aria-live="polite">{typing ? `${counterpart} is typing…` : ''}</p>
  <form class="message-composer" onsubmit={submit}><textarea aria-label="Message" placeholder="Write a message…" rows="1" maxlength="4000" bind:value={draft} oninput={() => realtime?.typing()}></textarea><button aria-label="Send message" disabled={!draft.trim()}><ArrowRight size={26} /></button></form>
</section>
{#if jobOpen && job}<dialog class="sheet" use:showDialog onclose={() => jobOpen = false} aria-label="Job details"><button class="icon detail-close" aria-label="Close job details" onclick={() => jobOpen = false}><X size={22} /></button><h2>{job.role}</h2><p>{job.companyName}</p><p>{money(job.hourlyPayMinor)} / hour · {job.weeklyHoursMin}–{job.weeklyHoursMax} hours/week</p><p>{job.scheduleSummary}</p><p>{job.description}</p></dialog>{/if}

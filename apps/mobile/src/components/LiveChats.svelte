<script lang="ts">
  import { onMount } from 'svelte';
  import { api, initials, type Account, type Conversation } from '../lib/api';
  import { connectChat } from '../lib/realtime';
  let { account, onopen }: { account: Account; onopen: (conversation: Conversation) => void } = $props();
  let rows = $state<Conversation[]>([]), loading = $state(true), error = $state(''), more = $state(false);
  let typing = $state<Record<string, boolean>>({});
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let alive = true, fetching = false, queued = false;
  let refresh: ReturnType<typeof setTimeout> | undefined;
  function clearTyping(id: string) {
    clearTimeout(typingTimers.get(id)); typingTimers.delete(id);
    delete typing[id];
  }
  function clearAllTyping() {
    typingTimers.forEach(timer => clearTimeout(timer));
    typingTimers.clear(); typing = {};
  }
  async function load(append = false) {
    if (fetching) { queued = true; return; }
    fetching = true; loading = true;
    try {
      const target = append ? 30 : Math.max(30, rows.length);
      const result: Conversation[] = [];
      let hasMore = false;
      do {
        const limit = Math.min(100, target - result.length);
        const page = await api<Conversation[]>(`conversations?limit=${limit}&offset=${append ? rows.length : result.length}`);
        if (!alive) return;
        result.push(...page); hasMore = page.length === limit;
        if (!hasMore || append) break;
      } while (result.length < target);
      const merged = append ? [...rows, ...result] : result;
      rows = [...new Map(merged.map(row => [row.id, row])).values()];
      more = hasMore; error = '';
    } catch(e) { if (alive) error = (e as Error).message; }
    finally { fetching = false; loading = false; if (queued && alive) { queued = false; void load(); } }
  }
  onMount(() => {
    let connected = false;
    void load();
    const realtime = connectChat({ ready: () => void load(), status: value => { connected = value; if (!value) clearAllTyping(); }, event: event => {
      if (event.type === 'typing') {
        if (event.data.userId === account.user.id) return;
        clearTyping(event.conversationId);
        typing[event.conversationId] = true;
        typingTimers.set(event.conversationId, setTimeout(() => clearTyping(event.conversationId), 2500));
        return;
      }
      if (event.type === 'presence') return;
      if (event.type === 'message' && event.data.senderUserId !== account.user.id) clearTyping(event.conversationId);
      clearTimeout(refresh); refresh = setTimeout(() => void load(), 150);
    }});
    const fallback = setInterval(() => { if (!connected && document.visibilityState === 'visible') void load(); }, 15000);
    return () => { clearInterval(fallback); alive = false; clearTimeout(refresh); clearAllTyping(); realtime.close(); };
  });
</script>
<section class="screen-section">
  <h1 class="section-poster">Chats</h1><p class="intro">Conversations about your roles.</p>
  {#if loading && !rows.length}<p role="status">Loading conversations…</p>
  {:else if !rows.length && !error}<div class="empty"><h2>A conversation starts with a match.</h2><p>Your chats will appear here once you and {account.user.profileType === 'employee' ? 'an employer' : 'an applicant'} connect.</p></div>
  {:else}{#each rows as row (row.id)}
    {@const name = account.user.profileType === 'employee' ? row.companyName : row.employeeName}
    <button class="conversation-row" onclick={() => onopen(row)}>
      <span class="avatar">{initials(name)}</span>
      <span class="row-copy"><strong>{name}</strong><span>{row.jobRole} · {row.companyName}</span><span class="message-preview" aria-live="polite">{typing[row.id] ? 'Typing…' : row.latestMessage ? `${row.latestSenderId === account.user.id ? 'You: ' : ''}${row.latestMessage}` : 'Start a conversation'}</span></span>
      <span class="row-meta">{#if row.latestAt}<time>{new Date(row.latestAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</time>{/if}{#if row.unreadCount}<span class="unread-count">{row.unreadCount}</span>{/if}</span>
    </button>
  {/each}{/if}
  {#if error}<div class="error" role="alert">{error}<button class="link" onclick={() => load()}>Retry loading chats</button></div>{/if}
  {#if more}<button class="secondary full" disabled={loading} onclick={() => load(true)}>Load more chats</button>{/if}
</section>

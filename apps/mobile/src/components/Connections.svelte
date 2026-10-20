<script lang="ts">
  import { onMount } from 'svelte';
  import { ChatCircle, X } from 'phosphor-svelte';
  import { api, initials, money, type Account, type Job, type Conversation } from '../lib/api';
  let { account, onchat }: { account: Account; onchat: (conversation: Conversation) => void } = $props();
  type Row = { job: Job; companyName?: string; employeeName?: string; conversationId?: string | null; match?: { source: string; createdAt: string }; employee?: { userId: string; name: string; bio: string | null; categories: string[] } };
  const employer = $derived(account.user.profileType === 'employer');
  let segment = $state<'interests' | 'matches'>('matches');
  let rows = $state<Row[]>([]), selected = $state<Row | null>(null);
  let loading = $state(true), busy = $state(false), more = $state(false), error = $state('');
  let generation = 0, alive = true;
  async function load(append = false) {
    const token = ++generation; loading = true; error = '';
    try {
      const route = segment === 'matches' ? 'me/matches' : 'employer/interests';
      const data = await api<Row[]>(`${route}?limit=30&offset=${append ? rows.length : 0}`);
      if (alive && generation === token) { rows = append ? [...rows, ...data] : data; more = data.length === 30; }
    } catch(e) { if (alive && generation === token) error = (e as Error).message; }
    finally { if (alive && generation === token) loading = false; }
  }
  onMount(() => { void load(); return () => { alive = false; }; });
  function chat(row: Row) {
    if (!row.conversationId) return;
    onchat({ id: row.conversationId, jobId: row.job.id, jobRole: row.job.role, companyName: row.companyName ?? account.profile?.companyName ?? '', employeeName: row.employeeName ?? row.employee?.name ?? '' });
  }
  async function accept(row: Row) {
    if (!row.employee || busy) return;
    busy = true; error = '';
    try {
      const result = await api<{ conversation: { id: string } }>(`jobs/${row.job.id}/interests/${encodeURIComponent(row.employee.userId)}/accept`, {});
      if (!alive) return;
      selected = null; chat({ ...row, conversationId: result.conversation.id });
    } catch(e) { error = (e as Error).message; }
    finally { busy = false; }
  }
  function openDialog(node: HTMLDialogElement) { node.showModal(); }
</script>
<section class="connections">
  <h2>{employer ? 'Your connections' : 'Your possibilities'}</h2>
  <div class="segments connected-segments">{#each ['interests', 'matches'] as key}<button disabled={busy} aria-pressed={segment === key} onclick={() => { segment = key as typeof segment; rows = []; more = false; void load(); }}>{key === 'interests' ? employer ? 'Interests' : 'Interested' : 'Matches'}</button>{/each}</div>
  <p class="hint">{segment === 'matches' ? 'People you’ve matched with.' : employer ? 'People interested in your roles.' : 'Roles you’ve shown interest in.'}</p>
  {#if error && !selected}<p class="error" role="alert">{error}</p><button class="secondary" onclick={() => load()}>Retry</button>{/if}
  {#if loading && !rows.length}<p role="status">Loading connections…</p>
  {:else if !rows.length && !error}<div class="empty"><h3>{segment === 'matches' ? 'No matches yet.' : employer ? 'Your next hire starts here.' : 'Find something that feels right.'}</h3><p>{employer ? 'Applicants and matches will appear here when people connect with your jobs.' : 'Explore nearby jobs and show interest to start a connection.'}</p></div>
  {:else}{#each rows as row (`${row.job.id}-${row.employee?.userId ?? row.employeeName ?? ''}`)}
    {@const name = employer ? row.employeeName ?? row.employee?.name ?? 'Applicant' : row.companyName ?? ''}
    <article class="connection-row"><span class="avatar">{initials(name)}</span><div class="row-copy"><h3>{name}</h3><p>{row.job.role}</p><small>{row.match ? `Matched ${new Date(row.match.createdAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}` : employer ? 'Interested in your role' : `${money(row.job.hourlyPayMinor)} / hour`}</small></div>
      {#if row.conversationId}<button class="secondary chat-shortcut" onclick={() => chat(row)}><ChatCircle size={20} />Chat</button>{:else}<button class="link" onclick={() => { selected = row; }}>View</button>{/if}
    </article>
  {/each}{/if}
  {#if more}<button class="secondary full" disabled={loading} onclick={() => load(true)}>Load more</button>{/if}
</section>
{#if selected}
  <dialog class="sheet" use:openDialog onclose={() => selected = null} aria-label={employer ? 'Applicant details' : 'Saved job details'}>
    <button class="icon detail-close" aria-label="Close details" disabled={busy} onclick={() => selected = null}><X size={24} /></button>
    <h2>{employer ? selected.employee?.name ?? selected.employeeName : selected.job.role}</h2>
    <p>{employer ? selected.job.role : selected.companyName}</p>
    {#if employer && selected.employee}<p class="capitalize">{selected.employee.categories.join(' · ')}</p>{#if selected.employee.bio}<p>{selected.employee.bio}</p>{/if}
      <p>Accepting this interest creates a mutual match and opens a conversation.</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="primary" disabled={busy || !selected.job.isActive} onclick={() => selected && accept(selected)}>{busy ? 'Accepting…' : 'Accept interest'}</button>
      {#if !selected.job.isActive}<p>This job is inactive. Reactivate it in Jobs before accepting an applicant.</p>{/if}
    {:else}<p>{money(selected.job.hourlyPayMinor)} / hour · {selected.job.weeklyHoursMin}–{selected.job.weeklyHoursMax} hours/week</p><p>{selected.job.scheduleSummary}</p><p>{selected.job.description}</p>{/if}
  </dialog>
{/if}

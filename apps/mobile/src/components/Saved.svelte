<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { MapPin, CalendarBlank, Check, CaretRight, X, ChatCircle } from 'phosphor-svelte';
  import { api, money, type Account, type Conversation, type Job, type Point } from '../lib/api';
  let { account, point = null, ondiscover, onchat, segment = $bindable<'interested' | 'matches'>('interested') }: { account: Account; point?: Point | null; ondiscover: () => void; onchat: (value: Conversation) => void; segment?: 'interested' | 'matches' } = $props();
  type Row = Job & { conversationId?: string | null; match?: { source: string }; employeeName?: string };
  type Result = { job: Job; companyName: string; employeeName?: string; conversationId?: string | null; match?: { source: string } };
  let selected = $state<Row | null>(null), rows = $state<Row[]>([]), loading = $state(true), more = $state(false), error = $state('');
  let generation = 0, alive = true;
  async function load(append = false) {
    const token = ++generation; loading = true; error = '';
    try {
      const coordinates = point ? `&latitude=${point.latitude}&longitude=${point.longitude}` : '';
      const result = await api<Result[]>(`me/${segment === 'interested' ? 'interests' : 'matches'}?limit=30&offset=${append ? rows.length : 0}${coordinates}`);
      if (!alive || token !== generation) return;
      const data = result.map(({ job, ...rest }) => ({ ...job, ...rest }));
      rows = append ? [...rows, ...data] : data; more = data.length === 30;
    } catch(e) { if (alive && token === generation) error = (e as Error).message; }
    finally { if (alive && token === generation) loading = false; }
  }
  function change(value: typeof segment) { segment = value; }
  function chat(job: Row) { if (job.conversationId) onchat({ id: job.conversationId, jobId: job.id, jobRole: job.role, companyName: job.companyName ?? '', employeeName: job.employeeName ?? account.user.name }); }
  $effect(() => {
    const locationKey = `${point?.latitude},${point?.longitude},${segment}`;
    untrack(() => { rows = []; selected = null; more = false; void load(); });
  });
  onMount(() => () => { alive = false; generation++; });
  function show(node: HTMLDialogElement) { node.showModal(); }
</script>
<section class="screen-section saved-screen">
  <h1 class="screen-eyebrow">Saved</h1>
  <div class="segments connected-segments">
    <button aria-pressed={segment === 'interested'} onclick={() => change('interested')}>Interested</button>
    <button aria-pressed={segment === 'matches'} onclick={() => change('matches')}>Matches</button>
  </div>
  {#if loading && !rows.length}<p class="loading" role="status">Loading saved jobs…</p>
  {:else if error}<div class="empty" role="alert"><h2>We couldn't load your saved jobs.</h2><p>{error}</p><button class="secondary full" onclick={() => load()}>Retry</button></div>
  {:else if !rows.length}<div class="empty"><h2>{segment === 'matches' ? 'No matches yet.' : 'No interests yet.'}</h2><p>{segment === 'matches' ? 'Keep exploring jobs that fit.' : 'Jobs you like will appear here.'}</p><button class="secondary full" onclick={ondiscover}>Discover jobs</button></div>
  {:else}
    {#each rows as job}
      <article class="saved-job">
        <h2>{job.role}</h2>
        <div class="saved-company"><p>{job.companyName}</p><button class="link inline-icon" onclick={() => selected = job}>View details<CaretRight size={20} /></button></div>
        <p class="saved-pay">{money(job.hourlyPayMinor)} / hour</p>
        <p class="inline-icon"><MapPin size={20} weight="fill" />{job.distanceMeters === undefined ? 'Distance unavailable' : `${(job.distanceMeters / 1000).toFixed(1)} km away`}</p>
        <p class="inline-icon"><CalendarBlank size={20} weight="bold" />{job.scheduleSummary}</p>
        {#if job.conversationId}<button class="secondary chat-shortcut" onclick={() => chat(job)}><ChatCircle size={20} />Chat</button>{/if}
        {#if !job.isActive}<small>No longer available</small>{/if}
        <span class="match-status"><Check size={18} weight="bold" />{segment === 'matches' ? 'Mutual match' : 'Interested'}</span>
      </article>
    {/each}
    {#if more}<button class="secondary full" disabled={loading} onclick={() => load(true)}>Load more</button>{/if}
    <button class="link inline-icon discover-more" onclick={ondiscover}>Discover more jobs<CaretRight size={20} /></button>
  {/if}
</section>
{#if selected}
  <dialog class="sheet job-detail-sheet" use:show onclose={() => selected = null} aria-label="Saved job details">
    <button class="icon detail-close" aria-label="Close job details" onclick={() => selected = null}><X size={24} /></button>
    <p class="eyebrow capitalize">{selected.category}</p><h2 class="identity-title">{selected.role}</h2>
    <p>{selected.companyName}</p><p class="saved-pay">{money(selected.hourlyPayMinor)} / hour</p>
    <p>{selected.scheduleSummary}</p><p>{selected.weeklyHoursMin === selected.weeklyHoursMax ? selected.weeklyHoursMin : `${selected.weeklyHoursMin}–${selected.weeklyHoursMax}`} hours/week</p>
    <p>{selected.distanceMeters === undefined ? 'Distance unavailable' : `${(selected.distanceMeters / 1000).toFixed(1)} km away`}{#if selected.distanceMeters !== undefined && selected.distanceMeters > (account.preferences?.radiusMeters ?? 5000)} · Outside your current radius{/if}</p>
    <span class="match-status"><Check size={18} />{segment === 'matches' ? 'Mutual match' : 'Interested'}</span>
    <p>{selected.description}</p>{#if selected.conversationId}<button class="primary" onclick={() => selected && chat(selected)}>Open chat</button>{/if}
  </dialog>
{/if}

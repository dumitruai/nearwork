<script lang="ts">
  import { onMount } from 'svelte';
  import { registerBack } from '../lib/native';
  import { Plus, ArrowLeft } from 'phosphor-svelte';
  import { categories, availability } from '../../../shared/domain';
  import { api, money, type Account, type Job, type Category } from '../lib/api';
  let { account }: { account: Account } = $props();
  let jobs = $state<Job[]>([]), loading = $state(false), busy = $state(false), editing = $state(false), more = $state(false), error = $state('');
  let role = $state(''), category = $state<Category>('hospitality'), pay = $state(14.5), min = $state(20), max = $state(30), schedule = $state(''), description = $state(''), confirmed = $state(false);
  async function load(append = false) {
    loading = true; error = '';
    try {
      const rows = await api<Job[]>(`employer/jobs?limit=20&offset=${append ? jobs.length : 0}`);
      jobs = append ? [...jobs, ...rows] : rows; more = rows.length === 20;
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  onMount(() => { void load(); });
  onMount(() => registerBack(() => {
    if (!editing) return false;
    if (!busy) editing = false;
    return true;
  }));
  async function submit(event: SubmitEvent) {
    event.preventDefault(); if (busy) return;
    error = ''; if (min > max) { error = 'Maximum weekly hours must be at least the minimum.'; return; }
    if (!confirmed) { error = 'Confirm this job uses your saved workplace location.'; return; }
    busy = true;
    try {
      await api('jobs', { role: role.trim(), category, hourlyPayMinor: Math.round(pay * 100), currency: 'GBP',
        weeklyHoursMin: min, weeklyHoursMax: max, availability: [...availability], scheduleSummary: schedule.trim(),
        description: description.trim(), areaLabel: account.profile?.workplaceLabel,
        latitude: account.profile?.latitude, longitude: account.profile?.longitude });
      editing = false; role = ''; schedule = ''; description = ''; confirmed = false; await load();
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
  async function toggle(job: Job) {
    busy = true; error = '';
    try { await api(`jobs/${job.id}`, { isActive: !job.isActive }, 'PATCH'); await load(); }
    catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
</script>
<section class="screen-section">
  {#if editing}
    <button class="link inline-icon" disabled={busy} onclick={() => { editing = false; error = ''; }}><ArrowLeft size={20} />Your jobs</button><h1 class="form-title">Post a job</h1><p class="intro">Make room for your next teammate.</p>
    <form onsubmit={submit}><fieldset class="fields" disabled={busy}>
      <label>Role<input required maxlength="160" bind:value={role} placeholder="e.g. Barista" /></label>
      <label>Category<select bind:value={category}>{#each categories as item}<option value={item}>{item[0].toUpperCase() + item.slice(1)}</option>{/each}</select></label>
      <label>Pay per hour (£)<input type="number" min=".01" max="10000" step=".01" required bind:value={pay} /></label>
      <div class="choices"><label>Min hours/week<input type="number" min="1" max="168" required bind:value={min} /></label><label>Max hours/week<input type="number" min="1" max="168" required bind:value={max} /></label></div>
      <label>Days and hours<input required maxlength="500" placeholder="Mon, Wed, Fri · 07:00–15:00, or variable rota" bind:value={schedule} /></label>
      <label>About the role<textarea required maxlength="10000" rows="4" bind:value={description} placeholder="What will someone do? What should they know?"></textarea></label>
      <div><strong>Workplace</strong><p>{account.profile?.workplaceLabel}</p><label class="choice"><input type="checkbox" required bind:checked={confirmed} />This job is at this workplace.</label><small>Edit your profile first if the workplace needs to change.</small></div>
    </fieldset>{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="primary" disabled={busy}>{busy ? 'Posting…' : 'Post job'}</button></form>
  {:else}
    <h1 class="section-poster">Your jobs</h1><p class="intro">Find the people who make it work.</p>
    <button class="secondary full inline-icon" onclick={() => editing = true}><Plus size={22} />Post a job</button>
    {#if error}<p class="error" role="alert">{error}</p><button class="link" onclick={() => load()}>Retry</button>{/if}
    {#if loading && !jobs.length}<p role="status">Loading jobs…</p>{:else if !jobs.length && !error}<div class="empty"><h2>Your first hire starts here.</h2><p>Post a role to start receiving interest from people nearby.</p></div>
    {:else}{#each jobs as job (job.id)}<article class="owned-job"><div><span class="tag">{job.isActive ? 'Active' : 'Paused'}</span><h2>{job.role}</h2><p>{money(job.hourlyPayMinor)} / hour · {job.weeklyHoursMin}–{job.weeklyHoursMax} hours/week</p><p>{job.scheduleSummary}</p></div><button class="secondary full" disabled={busy} onclick={() => toggle(job)}>{job.isActive ? 'Pause listing' : 'Reactivate listing'}</button></article>{/each}{/if}
    {#if more}<button class="secondary full" disabled={loading} onclick={() => load(true)}>Load more jobs</button>{/if}
  {/if}
</section>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { registerBack } from '../lib/native';
  import { ArrowRight, MapPin } from 'phosphor-svelte';
  import { categories, availability } from '../../../shared/domain';
  import { api, type Account, type Category, type Point } from '../lib/api';
  import WorkplaceLocation from './WorkplaceLocation.svelte';
  let { account, oncomplete }: { account: Account; oncomplete: () => Promise<void> } = $props();
  // Each mount starts an editable draft; incoming refreshes must not erase edits.
  const initial = untrack(() => account);
  let name = $state(initial.profile ? initial.user.name : '');
  let selected = $state<Category[]>([...(initial.profile?.categories ?? [])]);
  let radius = $state(initial.preferences?.radiusMeters ?? 5000);
  let bio = $state(initial.profile?.bio ?? '');
  let company = $state(initial.profile?.companyName ?? '');
  let industry = $state(initial.profile?.industry ?? 'hospitality');
  let workplaceLabel = $state(initial.profile?.workplaceLabel ?? '');
  let point = $state<Point | null>(initial.profile?.latitude !== undefined && initial.profile.longitude !== undefined ? { latitude: initial.profile.latitude, longitude: initial.profile.longitude } : null);
  let locationOpen = $state(false);
  onMount(() => registerBack(() => {
    if (!locationOpen) return false;
    locationOpen = false;
    return true;
  }));
  let busy = $state(false);
  let error = $state('');
  const employer = $derived(account.user.profileType === 'employer');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';
    if (!employer && !selected.length) { error = 'Choose at least one kind of work.'; return; }
    if (employer && !point) { error = 'Choose and confirm your workplace location.'; return; }
    busy = true;
    try {
      await api('me/profile', employer ? { name: name.trim(), companyName: company.trim(), industry, workplaceLabel, latitude: point!.latitude, longitude: point!.longitude }
        : { name: name.trim(), categories: selected, bio: bio.trim() || null, availability: account.profile?.availability ?? [...availability] }, 'PUT');
      if (!employer) await api('me/preferences', { radiusMeters: radius, locationSource: account.preferences?.locationSource ?? null }, 'PUT');
      await oncomplete();
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
</script>

<section>
  <h1 class="form-title">{#if account.profile}Your profile{:else if employer}Build your <span>team.</span>{:else}Work your <span>way.</span>{/if}</h1>
  <p class="intro">{employer ? 'Tell candidates who they’ll work with.' : 'A few details to find roles that fit.'}</p>
  <form onsubmit={submit}>
    <fieldset disabled={busy} class="fields">
      {#if employer}<label>Company name<input required maxlength="160" autocomplete="organization" placeholder="e.g. Oak & Bean" bind:value={company} /></label>{/if}
      <label>Your name<input required pattern=".*\S.*" maxlength="80" autocomplete="name" placeholder="Your full name" bind:value={name} /></label>
      {#if employer}
        <label>Industry<select bind:value={industry}>{#each categories as category}<option value={category}>{category[0].toUpperCase() + category.slice(1)}</option>{/each}</select></label>
        <div><label for="workplace">Workplace location</label><button id="workplace" type="button" class="location-control" onclick={() => locationOpen = true}><MapPin size={22} />{workplaceLabel || 'Add workplace location'}</button><small>Used to show your jobs to people nearby.</small></div>
      {:else}
        <fieldset><legend>What work interests you?</legend><p class="hint">Choose one or more.</p><div class="choices">
          {#each categories as category}<label class:selected={selected.includes(category)} class="choice"><input type="checkbox" value={category} bind:group={selected} /><span class="capitalize">{category}</span></label>{/each}
        </div></fieldset>
        <fieldset><legend>Travel radius</legend><div class="radii">{#each [1000,5000,10000,20000] as value}<label class:selected={radius === value}><input type="radio" bind:group={radius} {value} /><span>{value / 1000} km</span></label>{/each}</div><small>Distances are straight-line estimates.</small></fieldset>
      {/if}
      {#if account.profile && !employer}<label>About you <span class="optional">(optional)</span><textarea rows="3" maxlength="1000" bind:value={bio}></textarea></label>{/if}
    </fieldset>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary" disabled={busy}>{busy ? 'Saving…' : account.profile ? 'Save changes' : employer ? 'Save profile' : 'Find jobs'}<ArrowRight size={24} /></button>
  </form>
</section>

{#if locationOpen}
  <WorkplaceLocation {point} label={workplaceLabel} oncancel={() => locationOpen = false}
    onconfirm={(value, label) => { point = value; workplaceLabel = label; locationOpen = false; }} />
{/if}

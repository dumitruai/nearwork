<script lang="ts">
  import WorkplaceLocation from './WorkplaceLocation.svelte';
  import { untrack } from 'svelte';
  import { ArrowLeft, Info, MapPin } from 'phosphor-svelte';
  import { api, formatLocation, type Account, type Point } from '../lib/api';
  import { locateWithLabel } from '../lib/location';
  let { account, point = null, oncancel, oncomplete }: { account: Account; point?: Point | null; oncancel?: () => void; oncomplete: (point: Point | null) => Promise<void> } = $props();
  let radius = $state(untrack(() => account.preferences?.radiusMeters ?? 5000));
  let candidate = $state<Point | null>(untrack(() => point));
  let pickerOpen = $state(false);
  let source = $state<'device' | 'manual'>(untrack(() => account.preferences?.locationSource ?? 'device'));
  let locating = $state(false), saving = $state(false), locationError = $state(''), error = $state('');
  async function useDevice() {
    locating = true; locationError = '';

    try { candidate = await locateWithLabel(); source = 'device'; }
    catch(e) { locationError = (e as Error).message; }
    finally { locating = false; }
  }

  async function apply() {
    if (saving || locating || !candidate) return;
    saving = true; error = '';
    try {
      await api('me/preferences', { radiusMeters: radius, locationSource: source,
        point: { latitude: candidate.latitude, longitude: candidate.longitude, label: source === 'manual' ? candidate.label : undefined } }, 'PUT');
      await oncomplete(candidate);
    } catch(e) { error = (e as Error).message; }
    finally { saving = false; }
  }
</script>
<section class="location-editor">
  <header class="editor-header">{#if oncancel}<button class="icon" disabled={saving} aria-label="Cancel location changes" onclick={oncancel}><ArrowLeft size={25} /></button>{/if}<h1>Location & distance</h1></header>
  <div class="editor-body">
    <p class="location-intro">Find work near your current location or an area you choose.</p>
    {#if locationError}<div class="permission-notice" role="alert"><Info size={25} /><strong>{locationError.includes('denied') ? 'Location permission is off.' : "We couldn't find your location."}</strong></div><p class="muted">{locationError}</p>
    {:else}<p class="muted">Use your device location or choose an address or map pin to find jobs within your travel radius.</p>{/if}
    <div class="current-location-card">
      <MapPin size={25} weight="fill" />
      <div class="location-copy" role="status">
        <strong>{candidate ? source === 'manual' ? candidate.label || 'Selected location' : formatLocation(candidate) : locating ? 'Finding your location…' : 'Current location needed'}</strong>
        <span>{candidate ? source === 'manual' ? 'Using your selected location' : candidate.label ? 'Using your current location' : 'Location found · Place name unavailable' : 'Search uses your device location'}</span>
      </div>
      <button class="link location-action" disabled={locating || saving} onclick={useDevice} aria-label={locationError ? 'Retry current location' : 'Refresh current location'}>{locating ? 'Locating…' : locationError ? 'Retry' : 'Use device location'}</button>
    </div>
    <button class="secondary full" disabled={locating || saving} onclick={() => pickerOpen = true}>Choose location manually</button>
    <fieldset class="radius-options" disabled={saving || locating}><legend>Travel radius</legend><div>{#each [1000,5000,10000,20000] as value}<label class:active={radius === value}><input type="radio" name="radius" value={value} bind:group={radius} />{value / 1000} km</label>{/each}</div></fieldset>
    <p class="hint">Distances are straight-line estimates, not travel time.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary" disabled={saving || locating || !candidate} onclick={apply}>{saving ? 'Applying…' : 'Apply'}</button>
    {#if oncancel}<button class="link full cancel-location" disabled={saving} onclick={oncancel}>Cancel</button>{/if}
  </div>
</section>

{#if pickerOpen}
  <WorkplaceLocation purpose="search" point={candidate} label={candidate?.label ?? ''} oncancel={() => pickerOpen = false}
    onconfirm={(value, label) => { candidate = { ...value, label: label || 'Selected location' }; source = 'manual'; locationError = ''; pickerOpen = false; }} />
{/if}

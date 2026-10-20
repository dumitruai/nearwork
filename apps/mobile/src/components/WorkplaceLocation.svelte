<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Crosshair, MagnifyingGlass, MapPin, X } from 'phosphor-svelte';
  import type { Map as LeafletMap, Marker, TileLayer } from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { locate, type Point } from '../lib/api';
  import { searchAddresses, type AddressResult } from '../lib/addressSearch';

  let { point, label, purpose = 'workplace', oncancel, onconfirm }: {
    purpose?: 'workplace' | 'search';
    point: Point | null;
    label: string;
    oncancel: () => void;
    onconfirm: (point: Point, label: string) => void;
  } = $props();
  let candidate = $state<Point | null>(untrack(() => point ? { ...point } : null));
  let workplaceLabel = $state(untrack(() => label));
  let mapNode: HTMLDivElement;
  let map: LeafletMap | undefined;
  let marker: Marker | undefined;
  let tiles: TileLayer | undefined;
  let ready = $state(false);
  let mapError = $state('');
  let locationError = $state('');
  let locating = $state(false);
  let query = $state('');
  let searching = $state(false);
  let searched = $state(false);
  let searchError = $state('');
  let results = $state<AddressResult[]>([]);
  let searchController: AbortController | undefined;
  let searchVersion = 0;
  let disposed = false;
  let selectionVersion = 0;
  let placePin: (point: Point) => void = () => {};

  function openDialog(node: HTMLDialogElement) { node.showModal(); }
  onMount(() => {
    void (async () => {
      try {
        const L = await import('leaflet');
        if (disposed) return;
        map = L.map(mapNode, {
          center: candidate ? [candidate.latitude, candidate.longitude] : [51.5074, -0.1278],
          zoom: candidate ? 16 : 11,
          minZoom: 2, maxZoom: 19, worldCopyJump: true,
          zoomAnimation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        map.attributionControl.setPrefix(false);
        tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
          maxZoom: 19,
        });
        tiles.on('tileerror', () => { mapError = 'Some map details couldn’t load. Check your connection and retry.'; });
        tiles.addTo(map);
        const icon = L.divIcon({
          className: 'workplace-pin',
          html: '<span class="workplace-pin-head"></span>',
          iconSize: [36, 44], iconAnchor: [18, 44],
        });
        placePin = (value) => {
          if (!map || disposed) return;
          selectionVersion++;
          const position = L.latLng(Math.max(-85, Math.min(85, value.latitude)), value.longitude).wrap();
          candidate = { latitude: position.lat, longitude: position.lng };
          if (marker) marker.setLatLng(position);
          else {
            marker = L.marker(position, { icon, draggable: true, title: 'Location pin. Drag to adjust.', alt: 'Selected location' }).addTo(map);
            marker.on('dragend', () => {
              const moved = marker!.getLatLng();
              placePin({ latitude: moved.lat, longitude: moved.lng });
            });
          }
        };
        map.on('click', (event) => placePin({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
        if (candidate) placePin(candidate);
        ready = true;
      } catch {
        mapError = 'The map couldn’t open. Close this picker and try again.';
      }
    })();
    return () => { disposed = true; selectionVersion++; searchVersion++; searchController?.abort(); map?.remove(); };
  });

  function resetSearch() {
    searchVersion++;
    searchController?.abort();
    searching = false; searched = false; results = []; searchError = '';
  }
  async function search(event: SubmitEvent) {
    event.preventDefault();
    if (!ready || searching || query.trim().length < 3) return;
    resetSearch();
    const version = searchVersion;
    const controller = new AbortController();
    searchController = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    searching = true;
    try {
      const found = await searchAddresses(query, controller.signal, import.meta.env.VITE_GEOCODING_URL || undefined);
      if (disposed || version !== searchVersion) return;
      results = found; searched = true;
    } catch {
      if (!disposed && version === searchVersion) searchError = 'Address search is unavailable. Try again, or choose a point on the map.';
    } finally {
      clearTimeout(timeout);
      if (!disposed && version === searchVersion) searching = false;
    }
  }
  function chooseAddress(result: AddressResult) {
    resetSearch();
    locationError = '';
    placePin(result);
    map?.setView([result.latitude, result.longitude], 17, { animate: false });
    workplaceLabel = result.address.slice(0, 160);
    query = result.address;
    // Bring the chosen point into view on short screens and give keyboard users
    // immediate access to fine adjustments.
    mapNode.focus();
    mapNode.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  async function useDevice() {
    const version = selectionVersion;
    locating = true; locationError = '';
    try {
      const value = await locate();
      // A later map selection or a closed picker must win over a delayed GPS result.
      if (disposed || version !== selectionVersion) return;
      placePin(value);
      map?.setView([value.latitude, value.longitude], 17, { animate: false });
    } catch (error) {
      if (!disposed) locationError = `${(error as Error).message} You can still choose a point on the map.`;
    } finally { if (!disposed) locating = false; }
  }
  function useCenter() {
    const center = map?.getCenter();
    if (center) placePin({ latitude: center.lat, longitude: center.lng });
  }
</script>

<dialog class="sheet workplace-sheet" use:openDialog oncancel={oncancel} aria-labelledby="workplace-title" aria-describedby="workplace-help">
  <div class="workplace-heading">
    <h2 id="workplace-title">{purpose === 'workplace' ? 'Pin your workplace.' : 'Choose your location.'}</h2>
    <button type="button" class="icon" aria-label="Cancel location changes" onclick={oncancel}><X size={23} /></button>
  </div>
  <p id="workplace-help" class="muted">Search for an address, then drag the pin to the exact spot.</p>
  <form class="address-search" role="search" aria-label="Find address" onsubmit={search}>
    <label for="workplace-search">Search address</label>
    <div class="address-search-row">
      <input id="workplace-search" type="search" bind:value={query} oninput={resetSearch} placeholder="Street, postcode or place" minlength="3" maxlength="250" autocomplete="off" aria-describedby="address-search-status" />
      <button class="secondary" type="submit" disabled={!ready || searching || query.trim().length < 3} aria-label={searching ? 'Searching addresses' : 'Search addresses'}><MagnifyingGlass size={21} /></button>
    </div>
    <p id="address-search-status" class="hint" role="status">{searching ? 'Searching addresses…' : searched ? results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'}. Choose an address below.` : 'No addresses found. Add a town or postcode, or use the map.' : 'Enter an address and press Search or Enter.'}</p>
  </form>
  {#if searchError}<p class="error" role="alert">{searchError}</p>{/if}
  {#if results.length}
    <ul class="address-results" aria-label="Address results">
      {#each results as result}
        <li><button type="button" onclick={() => chooseAddress(result)}><MapPin size={20} /><span><strong>{result.title}</strong><small>{result.address}</small></span></button></li>
      {/each}
    </ul>
  {/if}
  <p class="search-credit">Address data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a></p>
  <button type="button" class="secondary full" disabled={!ready || locating} onclick={useDevice}>
    <Crosshair size={21} />{locating ? 'Finding your location…' : 'Use my current location'}
  </button>
  {#if locationError}<p class="error" role="alert">{locationError}</p>{/if}
  <div class="workplace-map-frame">
    <div class="workplace-map" bind:this={mapNode} role="region" aria-label="Location map" aria-describedby="map-keyboard-help"></div>
    <span class="map-center" aria-hidden="true"></span>
    {#if !ready}<p class="map-loading" role="status">{mapError ? 'Map unavailable' : 'Loading map…'}</p>{/if}
  </div>
  {#if mapError}<p class="error" role="alert">{mapError}{#if ready}<button type="button" class="link" onclick={() => { mapError = ''; tiles?.redraw(); }}>Retry map</button>{/if}</p>{/if}
  <div class="map-selection">
    <span role="status"><MapPin size={18} weight="fill" />{candidate ? 'Location pin set' : 'Choose a point'}</span>
    <button type="button" class="link" disabled={!ready} onclick={useCenter}>Pin map center</button>
  </div>
  <p id="map-keyboard-help" class="hint">You can also use arrow keys on the map, then select “Pin map center”.</p>
  <label class="workplace-name">{purpose === 'workplace' ? 'Workplace name or address' : 'Location name or address (optional)'}
    <input bind:value={workplaceLabel} maxlength="160" placeholder="e.g. Oak & Bean, 24 High Street" autocomplete="street-address" />
  </label>
  <p class="hint workplace-label-help">{purpose === 'workplace' ? 'Shown to candidates. The pin sets the exact location.' : 'Find jobs within your travel radius of this pin.'}</p>
  <div class="workplace-actions">
    <button type="button" class="primary" disabled={!ready || !candidate || (purpose === 'workplace' && !workplaceLabel.trim()) || locating} onclick={() => candidate && onconfirm(candidate, workplaceLabel.trim())}>{purpose === 'workplace' ? 'Confirm workplace' : 'Confirm location'}</button>
    <button type="button" class="link full" onclick={oncancel}>Cancel</button>
  </div>
</dialog>

<style>
  .workplace-sheet { max-width:480px; padding:24px; scrollbar-color:var(--accent) var(--canvas); }
  .workplace-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .workplace-heading h2 { margin:0; font-size:26px; font-weight:900; letter-spacing:-.03em; }
  .workplace-heading .icon { flex-shrink:0; margin-right:-12px; }
  #workplace-help { margin:8px 0 18px; font-size:14px; }
  .address-search label { font-size:14px; }
  .address-search-row { display:flex; align-items:center; gap:8px; margin-top:8px; }
  .address-search-row input { min-width:0; margin-top:0; }
  .address-search-row button { flex:0 0 52px; height:54px; border-color:var(--ink); }
  .address-search .hint { margin:8px 0 0; font-size:12px; }
  .address-results { list-style:none; padding:0; margin:12px 0 0; max-height:220px; overflow:auto; border-block:1px solid var(--line); }
  .address-results li + li { border-top:1px solid var(--line); }
  .address-results button { display:flex; align-items:flex-start; gap:10px; padding:14px 4px; width:100%; min-height:48px; text-align:left; border:0; background:transparent; }
  .address-results button:hover,.address-results button:focus-visible { background:var(--selected); }
  .address-results button:focus-visible { outline-offset:-3px; }
  .address-results :global(svg) { flex-shrink:0; margin-top:2px; }
  .address-results span { min-width:0; overflow-wrap:anywhere; }
  .address-results strong { font-size:14px; }
  .address-results small { margin:4px 0 0; font-size:12px; }
  .search-credit { margin:8px 0 16px; color:var(--muted); font-size:11px; }
  .search-credit a { color:inherit; text-underline-offset:3px; }
  .workplace-map-frame { position:relative; margin-top:16px; border:1px solid var(--line); border-radius:12px; overflow:hidden; isolation:isolate; }
  .workplace-map { height:clamp(230px, 36dvh, 340px); background:var(--selected); font-family:inherit; }
  .map-loading { position:absolute; inset:0; z-index:500; display:grid; place-items:center; margin:0; background:var(--selected); color:var(--muted); }
  .map-center { position:absolute; top:50%; left:50%; width:14px; height:14px; transform:translate(-50%,-50%); z-index:450; pointer-events:none; }
  .map-center::before,.map-center::after { content:''; position:absolute; background:var(--ink); outline:1px solid var(--canvas); }
  .map-center::before { left:6px; top:0; width:2px; height:14px; }
  .map-center::after { top:6px; left:0; height:2px; width:14px; }
  .map-selection { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:13px; }
  .map-selection span { display:flex; align-items:center; gap:6px; font-weight:700; }
  .map-selection .link { font-size:13px; flex-shrink:0; }
  #map-keyboard-help { font-size:12px; margin:0 0 20px; }
  .workplace-name { display:block; font-size:14px; }
  .workplace-label-help { margin:8px 0 0; font-size:12px; }
  .workplace-actions { position:sticky; bottom:-24px; margin:16px -4px -24px; padding:12px 4px 8px; background:var(--canvas); z-index:600; }
  .primary { margin-top:0; font-size:19px; letter-spacing:1.5px; }
  input { caret-color:var(--ink); }
  input::selection { background:var(--selected); }
  .workplace-map :global(.leaflet-control-zoom) { border:1px solid var(--line); box-shadow:none; border-radius:9px; overflow:hidden; }
  .workplace-map :global(.leaflet-control-zoom a) { width:44px; height:44px; line-height:44px; background:var(--canvas); color:var(--ink); }
  .workplace-map :global(.leaflet-control-attribution) { background:var(--canvas); color:var(--muted); font-size:10px; }
  .workplace-map :global(.leaflet-control-attribution a) { color:var(--ink); }
  .workplace-map :global(.workplace-pin) { background:transparent; border:0; }
  .workplace-map :global(.workplace-pin-head) { display:block; width:34px; height:34px; background:var(--ink); border:3px solid var(--canvas); border-radius:50% 50% 50% 0; transform:rotate(-45deg); box-shadow:-2px 3px 6px #123d4333; }
  .workplace-map :global(.workplace-pin-head::after) { content:''; position:absolute; top:9px; left:9px; width:10px; height:10px; border-radius:50%; background:var(--canvas); }
  @media(max-width:380px) {
    .workplace-sheet { padding:18px; width:calc(100% - 20px); }
    .workplace-heading h2 { font-size:24px; }
    .workplace-actions { bottom:-18px; margin-bottom:-18px; }
  }
</style>

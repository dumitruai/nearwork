<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, ArrowRight } from 'phosphor-svelte';
  import Auth from './components/Auth.svelte';
  import Profile from './components/Profile.svelte';
  import Location from './components/Location.svelte';
  import Workspace from './components/Workspace.svelte';
  import Landing from './components/Landing.svelte';
  import { api, request, locate, ApiError, type Account, type Point, type Role } from './lib/api';
  import { registerBack, startNative } from './lib/native';
  import './styles.css';
  let screen = $state<'loading' | 'landing' | 'role' | 'signup' | 'signin' | 'profile' | 'location' | 'home'>('loading');
  let role = $state<Role | null>(null);
  let account = $state<Account | null>(null);
  let point = $state<Point | null>(null);
  let error = $state('');
  let busy = $state(false);
  let locationGeneration = 0;
  async function refreshLocation() {
    const token = ++locationGeneration;
    if (account?.user.profileType !== 'employee' || account.preferences?.locationSource !== 'device') return;
    const next = await locate(false).catch(() => null);
    if (token === locationGeneration) point = next;
  }
  async function restore() {
    error = '';
    try {
      const next = await api<Account>('me');
      account = next; role = next.user.profileType;
      if (next.preferences?.locationSource === 'manual' && next.preferences.latitude != null && next.preferences.longitude != null) {
        locationGeneration++;
        point = { latitude: next.preferences.latitude, longitude: next.preferences.longitude, label: next.preferences.locationLabel || 'Selected location' };
      }
      screen = !next.profile ? 'profile' : 'home';
      if (!point) void refreshLocation();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { locationGeneration++; account = null; point = null; role = null; screen = 'landing'; }
      else { error = (e as Error).message; throw e; }
    }
  }
  onMount(() => {
    if (window.location.pathname === '/welcome') screen = 'landing';
    if (new URLSearchParams(window.location.search).has('preview')) history.replaceState(null, '', '/');
    if (window.location.pathname !== '/welcome') void restore().catch(() => {});
    const removeBack = registerBack(() => {
      if (busy) return true;
      if (screen === 'signin' || screen === 'signup' || screen === 'role') { screen = 'landing'; error = ''; return true; }
      if (screen === 'location' && account?.profile) { screen = 'home'; return true; }
      return false;
    }, -100);
    const stopNative = startNative(() => { void refreshLocation(); });
    return () => { locationGeneration++; removeBack(); stopNative(); };
  });
  function start(roleChoice?: Role | null) {
    history.replaceState(null, '', '/');
    role = roleChoice ?? null; error = ''; screen = roleChoice === undefined ? 'role' : roleChoice ? 'signup' : 'signin';
  }
  async function refreshAccount() { account = await api<Account>('me'); }
  let confirmSignout = $state(false);
  function showDialog(node: HTMLDialogElement) { node.showModal(); }
  async function signout() {
    busy = true; error = '';
    try { await request('/api/auth/sign-out', {}); locationGeneration++; account = null; point = null; role = null; screen = 'landing'; confirmSignout = false; }
    catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
  const step = $derived(screen === 'role' ? '01 / 03' : screen === 'signup' ? '02 / 03' : screen === 'profile' && !account?.profile ? '03 / 03' : '');
</script>
<svelte:head><title>Nearwork — Your next move</title><meta name="description" content="Find nearby frontline work. Meet your next hire." /><meta name="theme-color" content="#FAF9F3" /></svelte:head>
{#if screen === 'landing'}
  <Landing onstart={start} onsignin={() => start(null)} />
{:else}
<main class:role-screen={screen === 'role'} class:employee-home={screen === 'home'}>
  {#if screen !== 'home'}<header>
    {#if screen === 'signup' || screen === 'signin'}<button class="icon back" aria-label="Back to welcome" onclick={() => { screen = 'landing'; error = ''; }}><ArrowLeft size={25} /></button>
    {:else if (screen === 'profile' || screen === 'location') && account?.profile}<button class="icon back" aria-label="Back to home" onclick={() => screen = 'home'}><ArrowLeft size={25} /></button>{/if}
    <span class="wordmark">nearwork.</span><span class="step">{step}</span>
  </header>{/if}
  {#if error}<div class="error" role="alert">{error}{#if screen === 'loading'}<button class="link" onclick={() => { void restore().catch(() => {}); }}>Retry connection</button>{/if}</div>{/if}
  {#if screen === 'loading'}<p class="loading" role="status">{error ? 'Your account will load when the connection is restored.' : 'Getting things ready…'}</p>
  {:else if screen === 'role'}
    <section class="role-hero"><h1 class="poster"><span class="ink next">YOUR NEXT</span><br /><span class="ink move">MOVE</span><br /><span>STARTS HERE.</span></h1><p class="intro">Find work. Meet your next hire.</p></section>
    <fieldset class="roles"><legend>Choose your side</legend>
      <label class:selected={role === 'employee'} class="role-option"><span><strong>Find a job</strong><small>Employee</small></span><input type="radio" name="role" value="employee" bind:group={role} /></label>
      <label class:selected={role === 'employer'} class="role-option"><span><strong>Find your people</strong><small>Employer</small></span><input type="radio" name="role" value="employer" bind:group={role} /></label>
    </fieldset>
    <button class="primary" disabled={!role} onclick={() => screen = 'signup'}>Continue<ArrowRight size={26} /></button>
    <p class="footer-copy">Already registered? <button class="link" onclick={() => screen = 'signin'}>Sign in</button></p>
  {:else if screen === 'signup' || screen === 'signin'}
    {#key screen}<Auth {role} signingIn={screen === 'signin'} oncomplete={restore} onmode={() => screen = screen === 'signin' ? 'role' : 'signin'} />{/key}
  {:else if account}
    {#if screen === 'profile'}<Profile {account} oncomplete={restore} />
    {:else if screen === 'location'}<Location {account} {point} oncomplete={async (value) => { locationGeneration++; point = value; await restore(); }} />
    {:else}<Workspace {account} {point} onrefresh={refreshAccount} onpoint={value => { locationGeneration++; point = value; }} onsignout={() => confirmSignout = true} />{/if}
    {#if screen !== 'home'}<button class="link signout" disabled={busy} onclick={() => confirmSignout = true}>{busy ? 'Signing out…' : 'Sign out'}</button>{/if}
  {/if}
</main>
{/if}

{#if confirmSignout}<dialog class="sheet" use:showDialog onclose={() => confirmSignout = false} aria-labelledby="signout-title"><h2 id="signout-title">Sign out?</h2><p>You can come back whenever you’re ready.</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<button class="secondary full" disabled={busy} onclick={() => confirmSignout = false}>Cancel</button><button class="primary" disabled={busy} onclick={signout}>{busy ? 'Signing out…' : 'Sign out'}</button></dialog>{/if}

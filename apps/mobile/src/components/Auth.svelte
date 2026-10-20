<script lang="ts">
  import { ArrowRight, Eye, EyeSlash } from 'phosphor-svelte';
  import { request, type Role } from '../lib/api';
  let { role, signingIn, oncomplete, onmode }: { role: Role | null; signingIn: boolean; oncomplete: () => Promise<void>; onmode: () => void } = $props();
  let email = $state('');
  let password = $state('');
  let visible = $state(false);
  let busy = $state(false);
  let error = $state('');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true; error = '';
    try {
      await request(`/api/auth/${signingIn ? 'sign-in' : 'sign-up'}/email`, signingIn
        ? { email: email.trim(), password }
        : { email: email.trim(), password, profileType: role, name: 'New member' });
      password = '';
      await oncomplete();
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
</script>

<section class="auth">
  <h1 class="poster compact">{signingIn ? 'WELCOME' : 'MAKE IT'}<br /><span>{signingIn ? 'BACK.' : 'OFFICIAL.'}</span></h1>
  <p class="intro">{signingIn ? 'Your next move is waiting.' : 'Create your account to get started.'}</p>
  <form onsubmit={submit}>
    <fieldset disabled={busy} class="fields">
      <label>Email<input type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254" bind:value={email} /></label>
      <label>Password
        <div class="password">
          <input type={visible ? 'text' : 'password'} autocomplete={signingIn ? 'current-password' : 'new-password'} placeholder={signingIn ? 'Your password' : 'Create a password'} required minlength={signingIn ? 1 : 10} maxlength="128" bind:value={password} aria-describedby="password-help" />
          <button class="icon" type="button" aria-label={visible ? 'Hide password' : 'Show password'} onclick={() => visible = !visible}>{#if visible}<EyeSlash size={24} />{:else}<Eye size={24} />{/if}</button>
        </div>
        <small id="password-help">{signingIn ? 'Use the password for your Nearwork account.' : 'At least 10 characters.'}</small>
      </label>
    </fieldset>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary" disabled={busy}>{busy ? 'Please wait…' : signingIn ? 'Sign in' : 'Create account'}<ArrowRight size={24} /></button>
  </form>
  <p class="footer-copy">{signingIn ? 'New to Nearwork?' : 'Already registered?'} <button class="link" disabled={busy} onclick={onmode}>{signingIn ? 'Create account' : 'Sign in'}</button></p>
</section>

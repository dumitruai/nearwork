<script lang="ts">
  import { ArrowRight, DownloadSimple, MapPin, Briefcase, CalendarBlank, Heart, X } from 'phosphor-svelte';
  import type { Role } from '../lib/api';
  let { onstart, onsignin }: { onstart: (role: Role) => void; onsignin: () => void } = $props();
  let guideOpen = $state(false);
  function showGuide(node: HTMLDialogElement) { node.showModal(); }
  const steps = [
    { title: 'Set your area', copy: 'Choose your location and how far you want to travel.' },
    { title: 'Find your fit', copy: 'Explore nearby jobs and show interest in the ones you like.' },
    { title: 'Match and chat', copy: 'When you both show interest, start a conversation.' },
  ];
</script>

<div class="landing">
  <header class="landing-header">
    <a class="wordmark" href="/welcome" aria-label="Nearwork home">nearwork.</a>
    <nav aria-label="Landing navigation"><a href="#how-it-works">How it works</a><button onclick={() => onstart('employer')}>For employers</button></nav>
    <button class="landing-signin" onclick={onsignin}>Sign in</button>
  </header>
  <main class="landing-main">
    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="landing-pitch">
        <h1 id="landing-title">GOOD WORK.<br />GOOD PEOPLE.<br /><span>CLOSER.</span></h1>
        <p class="landing-intro">Find nearby jobs, show your interest,<br class="landing-desktop-break" /> and start a conversation when you match.</p>
        <div class="landing-actions">
          <button class="landing-cta filled" onclick={() => onstart('employee')}>Find work<ArrowRight size={26} /></button>
          <button class="landing-cta" onclick={() => onstart('employer')}>Start hiring<ArrowRight size={26} /></button>
        </div>
        <div class="landing-download">
          <h2>Also on Android</h2>
          <a class="landing-apk" href="https://nearwork-web.vercel.app/downloads/nearwork.apk" download="nearwork.apk" aria-describedby="apk-note"><DownloadSimple size={27} />Download Android APK</a>
          <p id="apk-note">Android preview build. Allow installation from your browser when prompted.</p>
          <button class="landing-guide-link" onclick={() => guideOpen = true}>Reviewer guide<ArrowRight size={18} /></button>
        </div>
      </div>
      <aside class="landing-preview" aria-label="Sample job preview">
        <p class="landing-eyebrow">A look inside Nearwork.</p>
        <article class="landing-job">
          <p class="landing-category">Hospitality</p>
          <h2>BARISTA</h2><p class="landing-company">Oak &amp; Bean</p>
          <p class="landing-pay">£14.50 / hour</p>
          <div class="landing-job-details">
            <p><MapPin size={26} weight="fill" /><span>1.2 km away</span></p>
            <p><Briefcase size={26} weight="fill" /><span>Part-time · 24 hours/week</span></p>
            <p><CalendarBlank size={26} weight="bold" /><span>Mon, Wed, Fri · 07:00–15:00</span></p>
          </div>
          <p class="landing-job-description">Training provided. Join a small neighbourhood café.</p>
          <div class="landing-job-actions" aria-hidden="true"><span><X size={30} weight="bold" /></span><span><Heart size={30} weight="bold" /></span></div>
        </article>
      </aside>
    </section>
    <section id="how-it-works" class="landing-steps" aria-label="How it works">
      <div>{#each steps as step, i}<article><span class="landing-step-number">0{i + 1}</span><div><h2>{step.title}</h2><p>{step.copy}</p></div></article>{/each}</div>
    </section>
  </main>
  <footer class="landing-footer">
    <div><span class="wordmark">nearwork.</span><p>Good work. Closer.</p><small>Nearwork · Prototype</small></div>
    <nav aria-label="Sample footer controls">{#each ['About', 'Contact', 'Privacy', 'Terms'] as label}<button type="button" aria-label={`${label} (sample control)`}>{label}</button>{/each}</nav>
  </footer>
</div>
{#if guideOpen}
  <dialog class="sheet landing-reviewer" use:showGuide onclose={() => guideOpen = false} aria-labelledby="reviewer-title">
    <button class="icon" aria-label="Close reviewer guide" onclick={() => guideOpen = false}><X size={24} /></button>
    <p class="landing-eyebrow">Nearwork · Prototype</p><h2 id="reviewer-title">Reviewer guide</h2>
    <h3>Getting started</h3><p>Create your own account with Find work or Start hiring. Use separate accounts to review both roles. No shared demo credentials are published.</p>
    <h3>Worker walkthrough</h3><p>Set up your profile, choose job categories and a location, then browse nearby jobs. Pass or show interest, revisit roles in Saved, and chat after a match.</p>
    <h3>Employer walkthrough</h3><p>Set up a company profile, post a job, review incoming interests, and accept an applicant to open a conversation. Manage listings in Jobs and conversations in Chats.</p>
    <h3>Android installation</h3><p>The APK download is not available yet. Once a build is provided, download it on Android and allow installation from your browser if prompted.</p>
    <h3>Simulated behavior and limitations</h3><p>This prototype includes generated nearby jobs, test applicants and automated replies. These are simulations, not real hiring activity. Saving a worker location generates nearby jobs; posting a job generates test applicants. Automated participants can use AI replies, with scripted replies as a fallback.</p><p>Message popups are in-app notifications. The sample job on this landing page is illustrative. About, Contact, Privacy and Terms are sample controls.</p>
    <button class="primary full" onclick={() => guideOpen = false}>Got it</button>
  </dialog>
{/if}

<style>
  .landing{background:var(--canvas);min-height:100dvh;color:var(--ink);display:flex;flex-direction:column}
  .landing-header{width:100%;max-width:1160px;margin:0 auto;padding:18px 0 20px;min-height:0;justify-content:space-between}
  .landing nav{margin-bottom:0}
  .landing a{color:inherit;text-decoration:none}
  .landing-header nav{display:flex;align-items:center;gap:36px}
  .landing-header button{border:0;background:none;padding:12px 0}
  .landing-signin{font-weight:700}
  .landing-main{padding:0;max-width:none;min-height:0;margin:0;background:transparent;border-radius:0;box-shadow:none;flex:1;display:flex;flex-direction:column}
  .landing-hero{width:100%;max-width:1160px;margin:0 auto;flex:1;display:grid;align-content:center;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:64px;padding:10px 0 22px}
  .landing h1{font-family:Anton,'Arial Narrow',sans-serif;font-size:clamp(68px,7.65vw,112px);font-weight:400;line-height:1.02;letter-spacing:-2.5px;margin:0;width:80%;transform:scaleX(1.25);transform-origin:left}
  .landing h1 span{color:var(--accent)}
  .landing-intro{font-size:25px;line-height:1.35;letter-spacing:-.8px;color:var(--muted);margin:18px 0 22px}
  .landing-actions{display:flex;gap:18px}
  .landing-cta{display:flex;justify-content:space-between;align-items:center;gap:16px;flex:1;border:1px solid var(--ink);border-radius:5px;background:transparent;min-height:62px;padding:14px 23px;text-transform:uppercase;font-size:19px;letter-spacing:1.4px;font-weight:700}
  .landing-cta.filled{background:var(--ink);color:var(--canvas)}
  .landing-cta:hover{background:var(--selected)}
  .landing-cta.filled:hover{background:var(--accent)}
  .landing-download{margin-top:20px}
  .landing-download h2,.landing-eyebrow,.landing-category{font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;margin:0 0 10px}
  .landing-apk{display:flex;align-items:center;gap:22px;min-height:48px;border:1px solid var(--line);background:var(--selected);border-radius:5px;padding:8px 22px;font-size:16px;font-weight:700;width:340px;max-width:100%}
  .landing-apk{text-decoration:none;color:var(--ink)}
  .landing-apk:hover{background:var(--line)}
  .landing-download>p{font-size:13px;color:var(--muted);line-height:1.5;max-width:540px;margin:7px 0 3px}
  .landing-guide-link{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0;border:0;background:none;text-decoration:underline;text-underline-offset:3px}
  .landing-preview{padding-top:8px}
  .landing-preview>.landing-eyebrow{margin-left:16px}
  .landing-job{position:relative;background:#fff;border:2px solid var(--ink);border-radius:8px;padding:26px 28px 18px;box-shadow:16px 16px 0 var(--selected)}
  .landing-category{color:var(--accent);font-size:12px;margin-bottom:8px}
  .landing-job h2{font-family:Anton,'Arial Narrow',sans-serif;font-weight:400;line-height:1.05;font-size:72px;letter-spacing:-1px;margin:0;transform:scaleX(1.15);transform-origin:left}
  .landing-company{font-size:27px;font-weight:700;margin:2px 0 4px;letter-spacing:-1px}
  .landing-pay{font-family:Anton,'Arial Narrow',sans-serif;font-size:50px;color:var(--accent);margin:0 0 20px;white-space:nowrap;letter-spacing:-.7px}
  .landing-job-details{border-block:1px solid var(--line);padding:13px 0}
  .landing-job-details p{display:flex;align-items:center;gap:20px;font-size:20px;color:var(--muted);line-height:1.5;margin:9px 0}
  .landing-job-details :global(svg){flex-shrink:0;color:var(--ink)}
  .landing-job-description{font-size:20px;line-height:1.4;color:var(--muted);margin:14px 0}
  .landing-job-actions{display:flex;justify-content:center;gap:28px}
  .landing-job-actions span{display:flex;align-items:center;justify-content:center;border:2px solid var(--ink);border-radius:50%;width:64px;height:64px}
  .landing-job-actions span:last-child{background:var(--ink);color:#fff}
  .landing-steps{background:var(--selected);padding:16px 24px;scroll-margin-top:20px}
  .landing-steps>div{max-width:1220px;margin:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .landing-steps article{background:var(--canvas);border:1px solid var(--line);border-radius:7px;padding:14px 28px}
  .landing-step-number{font-family:Anton,sans-serif;font-size:20px;color:var(--accent)}
  .landing-steps h2{font-family:Anton,sans-serif;text-transform:uppercase;font-size:32px;font-weight:400;margin:3px 0 2px;line-height:1.15}
  .landing-steps p{font-size:18px;line-height:1.35;color:var(--muted);margin:0}
  .landing-footer{width:100%;max-width:1220px;padding:18px 8px 22px;margin:0 auto;display:flex;justify-content:space-between;align-items:flex-start;gap:32px}
  .landing-footer .wordmark{font-size:25px}
  .landing-footer p{margin:3px 0 8px;font-size:16px}
  .landing-footer small{color:var(--muted);font-size:12px}
  .landing-footer nav{display:flex;gap:8px}
  .landing-footer button{min-width:105px;min-height:44px;background:transparent;border:1px solid var(--ink);border-radius:4px;font-size:13px}
  .landing-reviewer{max-width:620px;max-height:85dvh;overflow:auto}
  .landing-reviewer>.icon{float:right}
  .landing-reviewer h2{font-family:Anton,sans-serif;font-size:36px;font-weight:400}
  .landing-reviewer h3{margin-bottom:5px}
  .landing-reviewer p{line-height:1.6;color:var(--muted)}
  @media(max-width:1250px){.landing-header,.landing-hero{width:calc(100% - 80px);margin-inline:40px}.landing-hero{gap:40px}.landing-intro{font-size:22px}.landing-pay{font-size:40px}.landing-job{padding:24px}.landing-footer{padding-inline:32px}}
  @media(max-width:760px){
    .landing-header{width:calc(100% - 48px);margin:0 24px;padding:22px 0 18px;border-bottom:1px solid var(--line)}
    .landing-header nav{display:none}
    .landing-header .wordmark{font-size:28px}
    .landing-hero{width:100%;margin:0;padding:24px 24px 32px;display:flex;flex-direction:column;gap:30px}
    .landing h1{font-size:clamp(46px,11.5vw,84px);letter-spacing:-1.5px;line-height:1.04}
    .landing-intro{font-size:18px;letter-spacing:-.4px;margin:17px 0 21px}
    .landing-desktop-break{display:none}
    .landing-actions{flex-direction:column;gap:12px}
    .landing-cta{min-height:54px;font-size:17px;padding:12px 20px;justify-content:center;position:relative}
    .landing-cta :global(svg){position:absolute;right:18px}
    .landing-download{margin-top:22px}
    .landing-apk{width:100%;justify-content:center;font-size:16px}
    .landing-download>p{font-size:13px}
    .landing-guide-link{min-height:44px}
    .landing-preview{padding:0 9px 0 0}
    .landing-preview>.landing-eyebrow{margin-left:0;font-size:11px}
    .landing-job{padding:20px 18px 16px;box-shadow:9px 10px 0 var(--selected)}
    .landing-job h2{font-size:49px}
    .landing-company{font-size:22px}
    .landing-pay{font-size:35px;margin-bottom:14px}
    .landing-job-details{padding:8px 0}
    .landing-job-details p{font-size:14px;gap:12px;margin:9px 0}
    .landing-job-details :global(svg){width:22px;height:22px}
    .landing-job-description{font-size:16px}
    .landing-job-actions span{width:55px;height:55px}
    .landing-steps{padding:0 16px 22px;background:var(--canvas)}
    .landing-steps>div{grid-template-columns:1fr;gap:10px}
    .landing-steps article{display:flex;align-items:flex-start;gap:22px;padding:14px 16px}
    .landing-step-number{font-family:Inter,sans-serif;font-size:21px;font-weight:700;padding-top:2px}
    .landing-steps h2{font-size:24px;margin:0 0 4px}
    .landing-steps p{font-size:15px}
    .landing-footer{border-top:1px solid var(--line);padding:22px 16px;display:grid;grid-template-columns:1fr 1.5fr;gap:16px}
    .landing-footer nav{display:grid;grid-template-columns:1fr 1fr;width:100%;gap:10px}
    .landing-footer button{min-width:0}
    .landing-footer p{font-size:14px}
    .landing-footer .wordmark{font-size:26px}
  }
  @media(max-width:360px){.landing-footer{grid-template-columns:1fr}.landing h1{font-size:42px}}
</style>

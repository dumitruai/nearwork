<script lang="ts">
  import { MagnifyingGlass, BookmarkSimple, ChatCircle, User, Briefcase } from 'phosphor-svelte';
  import type { Role } from '../lib/api';
  let { role, active, disabled = false, unreadCount = 0, interestCount = 0, onchange }: { role: Role; active: string; disabled?: boolean; unreadCount?: number; interestCount?: number; onchange: (tab: string) => void } = $props();
  const destinations = $derived(role === 'employee'
    ? [{ key: 'discover', label: 'Discover', icon: MagnifyingGlass }, { key: 'saved', label: 'Saved', icon: BookmarkSimple }, { key: 'chats', label: 'Chats', icon: ChatCircle }, { key: 'profile', label: 'Profile', icon: User }]
    : [{ key: 'jobs', label: 'Jobs', icon: Briefcase }, { key: 'chats', label: 'Chats', icon: ChatCircle }, { key: 'profile', label: 'Profile', icon: User }]);
</script>
<nav class="bottom-nav" aria-label="Main navigation">
  {#each destinations as item}
    {@const count = item.key === 'chats' ? unreadCount : role === 'employer' && item.key === 'profile' ? interestCount : 0}
    <button aria-current={active === item.key ? 'page' : undefined} aria-label={item.key === 'chats' && unreadCount > 0 ? `Chats, ${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}` : item.key === 'profile' && interestCount > 0 && role === 'employer' ? `Profile, ${interestCount} pending interests` : item.label} {disabled} onclick={() => onchange(item.key)}><span class="nav-icon"><item.icon size={25} />{#if count > 0}<span class="nav-unread-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>{/if}</span>{item.label}</button>{/each}
</nav>

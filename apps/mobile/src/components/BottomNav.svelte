<script lang="ts">
  import { MagnifyingGlass, BookmarkSimple, ChatCircle, User, Briefcase } from 'phosphor-svelte';
  import type { Role } from '../lib/api';
  let { role, active, disabled = false, unreadCount = 0, onchange }: { role: Role; active: string; disabled?: boolean; unreadCount?: number; onchange: (tab: string) => void } = $props();
  const destinations = $derived(role === 'employee'
    ? [{ key: 'discover', label: 'Discover', icon: MagnifyingGlass }, { key: 'saved', label: 'Saved', icon: BookmarkSimple }, { key: 'chats', label: 'Chats', icon: ChatCircle }, { key: 'profile', label: 'Profile', icon: User }]
    : [{ key: 'jobs', label: 'Jobs', icon: Briefcase }, { key: 'chats', label: 'Chats', icon: ChatCircle }, { key: 'profile', label: 'Profile', icon: User }]);
</script>
<nav class="bottom-nav" aria-label="Main navigation">
  {#each destinations as item}<button aria-current={active === item.key ? 'page' : undefined} aria-label={item.key === 'chats' && unreadCount > 0 ? `Chats, ${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}` : item.label} {disabled} onclick={() => onchange(item.key)}><span class="nav-icon"><item.icon size={25} />{#if item.key === 'chats' && unreadCount > 0}<span class="nav-unread-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>{/if}</span>{item.label}</button>{/each}
</nav>

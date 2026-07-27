import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import "./App.css";
import owlivionIcon from "./assets/owlivion-logo.svg";
import { Settings } from "./pages/Settings";
import { Filters } from "./pages/Filters";
import { AIReplyModal } from "./components/AIReplyModal";
import { Compose } from "./components/Compose";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { Welcome } from "./components/Welcome";
import { AddAccountModal } from "./components/settings/AddAccountModal";
import SearchFiltersComponent from "./components/SearchFilters";
import { EmailView } from "./components/EmailView";
import { ContextMenu, useContextMenu } from "./components/ContextMenu";
import { summarizeEmail, analyzePhishing, detectEmailTracking, type PhishingAnalysis, type TrackingAnalysis } from "./services/geminiService";
import { requestNotificationPermission, showNewEmailNotification, playNotificationSound } from "./services/notificationService";
import { listDrafts, getDraft, deleteDraft, saveDraft } from "./services/draftService";
import type { DraftEmail, EmailAddress, Account, ImapFolder, DraftListItem, SearchFilters, Settings as SettingsType } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { isMobile } from "./hooks/usePlatform";
import { MobileLayout } from "./layouts/MobileLayout";
import { MobileEmailList } from "./components/mobile/MobileEmailList";
import { MobileEmailView } from "./components/mobile/MobileEmailView";
import { MobileDrawer } from "./components/mobile/MobileDrawer";
import { MobileBottomNav } from "./components/mobile/MobileBottomNav";
import { useMobileNavigation } from "./stores/mobileNavigationStore";
import { LanguageProvider, useTranslation } from "./i18n";

// DOMPurify config & sanitizeEmailHtml moved to ./components/EmailView.tsx

// Simple Icon Components
const Icons = {
  Mail: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  Inbox: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>,
  Send: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
  Star: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  StarFilled: () => <svg className="w-4 h-4 fill-yellow-500 text-yellow-500" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Archive: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
  File: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Search: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Reply: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
  ReplyAll: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6M7 10h10a8 8 0 018 8v2M7 10l6 6m-6-6l6-6" /></svg>,
  Forward: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>,
  Sparkles: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  Paperclip: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>,
  ChevronDown: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,
  ChevronUp: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>,
  ChevronRight: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  Folder: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
  Command: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z" /></svg>,
  Image: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  ShieldCheck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  X: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  Settings: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Filter: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>,
  MailOpen: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" /></svg>,
  MailUnread: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /><circle cx="18" cy="5" r="3" fill="currentColor" /></svg>,
  Summarize: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Refresh: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
};

// Types
interface Email {
  id: string;
  from: { name: string; email: string };
  to: EmailAddress[];
  subject: string;
  preview: string;
  body: string;
  bodyHtml?: string;
  bodyText?: string;
  date: Date;
  read: boolean;
  starred: boolean;
  hasAttachments: boolean;
  hasImages: boolean;
  accountId?: string; // NEW: Account ID for unified inbox
  attachments?: Array<{
    index: number;
    filename: string;
    contentType: string;
    size: number;
    isInline: boolean;
    contentId?: string;
  }>;
  archived?: boolean;
  deleted?: boolean;
  isDraft?: boolean;
  snoozedUntil?: number; // Unix timestamp ms — hidden until expiry
}


// Parse email ID - unified inbox uses "accountId-uid" format
function parseEmailId(id: string, selectedAccountId: number | null | 'all'): { accountId: string; uid: number } {
  if (selectedAccountId === 'all') {
    const dashIdx = id.indexOf('-');
    if (dashIdx > 0) {
      return { accountId: id.substring(0, dashIdx), uid: parseInt(id.substring(dashIdx + 1)) };
    }
  }
  return { accountId: selectedAccountId?.toString() || '', uid: parseInt(id) };
}

// ─── Snooze Storage ─────────────────────────────────────────────────────────

const SNOOZE_KEY = 'owlmail-snoozed';

function getSnoozed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; }
}

function snoozeEmail(id: string, until: number) {
  const s = getSnoozed(); s[id] = until; localStorage.setItem(SNOOZE_KEY, JSON.stringify(s));
}

function unsnoozeEmail(id: string) {
  const s = getSnoozed(); delete s[id]; localStorage.setItem(SNOOZE_KEY, JSON.stringify(s));
}

function isSnoozedNow(id: string): boolean {
  const t = getSnoozed()[id]; return !!t && t > Date.now();
}

// ─── Label Storage ───────────────────────────────────────────────────────────

type EmailLabel = 'work' | 'personal' | 'important' | 'finance' | 'later';

const LABEL_COLORS: Record<EmailLabel, { dot: string; name: string }> = {
  work:      { dot: '#3b82f6', name: 'İş' },
  personal:  { dot: '#22c55e', name: 'Kişisel' },
  important: { dot: '#ef4444', name: 'Önemli' },
  finance:   { dot: '#f59e0b', name: 'Finans' },
  later:     { dot: '#a855f7', name: 'Sonra' },
};

const LABEL_KEY = 'owlmail-labels';

function getLabels(): Record<string, EmailLabel> {
  try { return JSON.parse(localStorage.getItem(LABEL_KEY) || '{}'); } catch { return {}; }
}

function setEmailLabel(id: string, label: EmailLabel | null) {
  const m = getLabels();
  if (label === null) delete m[id]; else m[id] = label;
  localStorage.setItem(LABEL_KEY, JSON.stringify(m));
}

function getEmailLabel(id: string): EmailLabel | null {
  return getLabels()[id] || null;
}

// ─── Accent Theme ────────────────────────────────────────────────────────────

type AccentTheme = 'violet' | 'blue' | 'emerald' | 'rose' | 'amber' | 'cyan';

const ACCENT_THEMES: Record<AccentTheme, { rgb: string; name: string; hex: string }> = {
  violet:  { rgb: '139 92 246',  name: 'Mor',   hex: '#8b5cf6' },
  blue:    { rgb: '59 130 246',  name: 'Mavi',  hex: '#3b82f6' },
  emerald: { rgb: '16 185 129',  name: 'Yeşil', hex: '#10b981' },
  rose:    { rgb: '244 63 94',   name: 'Kırmızı', hex: '#f43f5e' },
  amber:   { rgb: '245 158 11',  name: 'Turuncu', hex: '#f59e0b' },
  cyan:    { rgb: '6 182 212',   name: 'Cyan',  hex: '#06b6d4' },
};

function applyAccentTheme(theme: AccentTheme) {
  document.documentElement.style.setProperty('--owl-accent', ACCENT_THEMES[theme].rgb);
  localStorage.setItem('owlmail-accent-theme', theme);
}

function getStoredAccentTheme(): AccentTheme {
  const stored = localStorage.getItem('owlmail-accent-theme') as AccentTheme | null;
  return stored && ACCENT_THEMES[stored] ? stored : 'violet';
}

// ─── Session Start Time (for "Yeni" badge) ───────────────────────────────────
const SESSION_START = Date.now();

// ─── Search History ──────────────────────────────────────────────────────────
const SEARCH_HISTORY_KEY = 'owlmail-search-history';
function getSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch { return []; }
}
function addSearchHistory(query: string) {
  if (!query.trim() || query.trim().length < 2) return;
  const hist = getSearchHistory().filter(q => q !== query.trim()).slice(0, 8);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify([query.trim(), ...hist]));
}
function clearSearchHistory() { localStorage.removeItem(SEARCH_HISTORY_KEY); }

// ─── Pin Storage ────────────────────────────────────────────────────────────

const PIN_KEY = 'owlmail-pinned';

function getPinned(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PIN_KEY) || '[]')); } catch { return new Set(); }
}

function togglePin(id: string) {
  const pins = getPinned();
  if (pins.has(id)) pins.delete(id); else pins.add(id);
  localStorage.setItem(PIN_KEY, JSON.stringify([...pins]));
}

function isPinned(id: string): boolean { return getPinned().has(id); }

// ─── Follow-up Reminder Storage ─────────────────────────────────────────────

const FOLLOWUP_KEY = 'owlmail-followups';
type FollowupEntry = { days: number; dueDate: number; subject: string };

function getFollowups(): Record<string, FollowupEntry> {
  try { return JSON.parse(localStorage.getItem(FOLLOWUP_KEY) || '{}'); } catch { return {}; }
}

function setFollowup(id: string, days: number, subject: string) {
  const f = getFollowups();
  f[id] = { days, dueDate: Date.now() + days * 86400000, subject };
  localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(f));
}

function clearFollowup(id: string) {
  const f = getFollowups(); delete f[id];
  localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(f));
}

function getFollowup(id: string): FollowupEntry | null { return getFollowups()[id] || null; }
function isFollowupDue(id: string): boolean { const f = getFollowup(id); return f ? Date.now() >= f.dueDate : false; }

// ─── Email Notes Storage ─────────────────────────────────────────────────────

const NOTE_KEY = 'owlmail-notes';

function getNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '{}'); } catch { return {}; }
}

function saveNote(id: string, text: string) {
  const n = getNotes();
  if (text.trim()) n[id] = text.trim(); else delete n[id];
  localStorage.setItem(NOTE_KEY, JSON.stringify(n));
}

function getNote(id: string): string { return getNotes()[id] || ''; }

// ─── Emoji Reactions ─────────────────────────────────────────────────────────

const REACTION_KEY = 'owlmail-reactions';
const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '👀', '🔥'];

function getReactions(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(REACTION_KEY) || '{}'); } catch { return {}; }
}

function toggleReaction(emailId: string, emoji: string) {
  const r = getReactions();
  const list = r[emailId] || [];
  const idx = list.indexOf(emoji);
  if (idx >= 0) list.splice(idx, 1); else list.push(emoji);
  if (list.length === 0) delete r[emailId]; else r[emailId] = list;
  localStorage.setItem(REACTION_KEY, JSON.stringify(r));
}

function getEmailReactions(emailId: string): string[] { return getReactions()[emailId] || []; }

// ─── Task Storage ─────────────────────────────────────────────────────────────

const TASK_KEY = 'owlmail-tasks';

interface EmailTask {
  id: string;
  emailId: string;
  subject: string;
  note: string;
  createdAt: number;
  dueDate?: number;
  completed: boolean;
}

function getTasks(): EmailTask[] {
  try { return JSON.parse(localStorage.getItem(TASK_KEY) || '[]'); } catch { return []; }
}

function createTask(emailId: string, subject: string, note: string, dueDate?: number): EmailTask {
  const task: EmailTask = { id: `task-${Date.now()}`, emailId, subject, note, createdAt: Date.now(), dueDate, completed: false };
  const tasks = getTasks();
  tasks.unshift(task);
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
  return task;
}

function toggleTaskComplete(id: string) {
  const tasks = getTasks().map(t => t.id === id ? { ...t, completed: !t.completed } : t);
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
}

function deleteTask(id: string) {
  const tasks = getTasks().filter(t => t.id !== id);
  localStorage.setItem(TASK_KEY, JSON.stringify(tasks));
}

// ─── Scheduled Send Storage ──────────────────────────────────────────────────

const SCHEDULED_KEY = 'owlmail-scheduled';

interface ScheduledEmail {
  id: string;
  draft: DraftEmail;
  sendAt: number;
  subject: string;
  toEmail: string;
  accountId?: string;
}

function getScheduled(): ScheduledEmail[] {
  try { return JSON.parse(localStorage.getItem(SCHEDULED_KEY) || '[]'); } catch { return []; }
}

function addScheduled(draft: DraftEmail, sendAt: number): ScheduledEmail {
  const item: ScheduledEmail = {
    id: `sched-${Date.now()}`,
    draft,
    sendAt,
    subject: draft.subject || '(Konu yok)',
    toEmail: draft.to?.[0]?.email || '',
  };
  const list = getScheduled();
  list.push(item);
  localStorage.setItem(SCHEDULED_KEY, JSON.stringify(list));
  return item;
}

function removeScheduled(id: string) {
  const list = getScheduled().filter(s => s.id !== id);
  localStorage.setItem(SCHEDULED_KEY, JSON.stringify(list));
}

// Helper Functions
function formatDate(date: Date, t: (key: string) => string, lang: string): string {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return t('app.yesterday');
  if (days < 7) return date.toLocaleDateString(locale, { weekday: "short" });
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// Extract domain from email address
function getEmailDomain(email: string): string {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : '';
}

// Generate consistent color from email address (for account badges)
function getAccountColor(email: string): string {
  // Hash function for consistent color generation
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert to HSL for better color distribution
  const hue = Math.abs(hash) % 360;
  const saturation = 65; // Medium saturation
  const lightness = 55; // Medium lightness

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Get company logo URL from domain
function getCompanyLogoUrl(email: string): string | null {
  const domain = getEmailDomain(email);
  if (!domain) return null;

  // Special case: OwlMail domains - use our logo!
  if (domain === 'owlivion.com' || domain === 'owlcrypt.com') {
    return owlivionIcon; // Use the OwlMail logo imported at the top
  }

  // Skip personal email providers - show initials instead
  const personalDomains = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'yandex.com', 'mail.ru'];
  if (personalDomains.includes(domain)) return null;

  // Use Google Favicon API (reliable and free)
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

// Account Badge Component (for unified inbox) - Gradient Style
function AccountBadge({
  accountEmail,
  accountName: _accountName,
  size = 'sm'
}: {
  accountEmail: string;
  accountName?: string;
  size?: 'xs' | 'sm';
}) {
  const color = getAccountColor(accountEmail);
  // Extract domain name: info@owlivion.com → "owlivion"
  const displayText = accountEmail.split('@')[1]?.split('.')[0] || accountEmail.split('@')[0];

  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5'
  };

  // Generate lighter color for gradient
  const lighterColor = (() => {
    const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (hslMatch) {
      const [, h, s, l] = hslMatch;
      return `hsl(${h}, ${s}%, ${Math.min(parseInt(l) + 15, 75)}%)`;
    }
    return color;
  })();

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold transition-all hover:scale-105 ${sizeClasses[size]}`}
      style={{
        background: `linear-gradient(135deg, ${color}18 0%, ${lighterColor}25 100%)`,
        color: color,
        boxShadow: `0 1px 3px ${color}20, 0 0 0 1px ${color}15 inset`
      }}
    >
      {/* Dot indicator with subtle glow */}
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 4px ${color}60`
        }}
      />
      <span className="truncate max-w-[100px]">{displayText}</span>
    </span>
  );
}

// Company Avatar Component with logo fallback
function CompanyAvatar({ email, name, size = 'md', unread = false }: {
  email: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  unread?: boolean;
}) {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = getCompanyLogoUrl(email);
  const domain = getEmailDomain(email);
  const isOwlivionDomain = domain === 'owlivion.com' || domain === 'owlcrypt.com';

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  const baseClasses = `${sizeClasses[size]} rounded-full flex items-center justify-center font-medium shrink-0`;

  // Show logo if available and not errored
  if (logoUrl && !logoError) {
    return (
      <div className={`${baseClasses} ${isOwlivionDomain ? 'bg-owl-accent/10 p-1.5' : 'bg-owl-surface p-1'} border border-owl-border/50`}>
        <img
          src={logoUrl}
          alt={name}
          className={`w-full h-full object-contain ${isOwlivionDomain ? '' : 'rounded-full'}`}
          onError={() => setLogoError(true)}
        />
      </div>
    );
  }

  // Fallback to initials
  return (
    <div className={`${baseClasses} ${unread ? "bg-owl-accent text-white" : "bg-owl-bg text-owl-text-secondary"}`}>
      {getInitials(name)}
    </div>
  );
}

// Helper to get icon for folder type
function getFolderIcon(folderType: string, name: string): React.ReactElement {
  const type = folderType.toLowerCase();
  const nameLower = name.toLowerCase();

  if (type === 'inbox' || nameLower === 'inbox') return <Icons.Inbox />;
  if (type === 'sent' || nameLower.includes('sent')) return <Icons.Send />;
  if (type === 'drafts' || nameLower.includes('draft')) return <Icons.File />;
  if (type === 'trash' || nameLower.includes('trash') || nameLower.includes('deleted')) return <Icons.Trash />;
  if (type === 'archive' || nameLower.includes('archive')) return <Icons.Archive />;
  if (type === 'spam' || type === 'junk' || nameLower.includes('spam') || nameLower.includes('junk')) return <Icons.ShieldCheck />;
  if (type === 'starred' || nameLower.includes('starred') || nameLower.includes('flagged')) return <Icons.Star />;
  return <Icons.Mail />; // Default folder icon
}

// Build folder tree from flat list
interface FolderTreeNode {
  folder: ImapFolder;
  children: FolderTreeNode[];
}

function buildFolderTree(folders: ImapFolder[]): FolderTreeNode[] {
  const tree: FolderTreeNode[] = [];
  const nodeMap = new Map<string, FolderTreeNode>();

  // Sort folders by path to ensure parents come before children
  const sortedFolders = [...folders].sort((a, b) => a.path.localeCompare(b.path));

  for (const folder of sortedFolders) {
    const node: FolderTreeNode = { folder, children: [] };
    nodeMap.set(folder.path, node);

    // Find parent by checking delimiter
    const delimiter = folder.delimiter || '/';
    const lastDelimiterIndex = folder.path.lastIndexOf(delimiter);

    if (lastDelimiterIndex > 0) {
      const parentPath = folder.path.substring(0, lastDelimiterIndex);
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(node);
        continue;
      }
    }

    tree.push(node);
  }

  return tree;
}

// Folder Tree Item Component
function FolderTreeItem({
  node,
  level,
  activeFolder,
  onFolderChange,
}: {
  node: FolderTreeNode;
  level: number;
  activeFolder: string;
  onFolderChange: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(level === 0);
  const hasChildren = node.children.length > 0;
  const isActive = activeFolder === node.folder.path;

  return (
    <div>
      <button
        onClick={() => {
          if (node.folder.is_selectable) {
            onFolderChange(node.folder.path);
          }
          if (hasChildren) {
            setExpanded(!expanded);
          }
        }}
        className={`w-full flex items-center gap-2 py-1.5 rounded-lg transition-all text-sm ${
          isActive
            ? "bg-owl-accent/15 text-owl-accent font-medium"
            : "text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text"
        }`}
        style={{ paddingLeft: `${12 + level * 16}px`, paddingRight: '12px' }}
      >
        {hasChildren && (
          <span className="w-4 h-4 flex items-center justify-center">
            {expanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        {getFolderIcon(node.folder.folder_type, node.folder.name)}
        <span className="flex-1 truncate text-left">{node.folder.name}</span>
        {node.folder.unread_count > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            isActive ? "bg-owl-accent text-white" : "bg-owl-bg"
          }`}>
            {node.folder.unread_count}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.folder.path}
              node={child}
              level={level + 1}
              activeFolder={activeFolder}
              onFolderChange={onFolderChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Mail Panel Component
function MailPanel({
  emails,
  selectedId,
  onSelect,
  activeFolder,
  onFolderChange,
  onSettingsClick,
  onComposeClick,
  onSyncClick,
  onOsintClick: _onOsintClick,
  isSyncing,
  searchQuery,
  onSearchChange,
  searchFilters,
  onSearchFiltersChange,
  onAdvancedSearch,
  accounts,
  selectedAccountId,
  onAccountChange,
  imapFolders,
  isLoadingFolders,
  onToggleStar,
  onDeleteDraft,
  drafts,
  isLoadingDrafts: _isLoadingDrafts,
  onFiltersClick,
  isSearching,
  searchResultsCount,
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionChange,
  onEmailContextMenu,
  selectedEmails,
  onBulkToggle,
  onBulkSelectAll,
  onBulkClear,
  onBulkAction,
  conversationView,
  compactView,
  collapsed = false,
  onToggleCollapse,
  panelWidth = 380,
  currentTheme = 'dark',
  onThemeToggle,
  onMarkAllRead,
}: {
  emails: Email[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeFolder: string;
  onFolderChange: (path: string) => void;
  onSettingsClick: () => void;
  onFiltersClick: () => void;
  onComposeClick: () => void;
  onSyncClick: () => void;
  onOsintClick: () => void;
  isSyncing: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchFilters: SearchFilters;
  onSearchFiltersChange: (filters: SearchFilters) => void;
  onAdvancedSearch: () => void;
  isSearching?: boolean;
  searchResultsCount?: number;
  accounts: Account[];
  selectedAccountId: number | null | 'all';
  onAccountChange: (id: number | 'all') => void;
  imapFolders: ImapFolder[];
  isLoadingFolders: boolean;
  onToggleStar: (emailId: string) => void;
  onDeleteDraft?: (draftId: number) => void;
  drafts: DraftListItem[];
  isLoadingDrafts: boolean;
  sortBy: 'date' | 'account' | 'unread' | 'priority';
  onSortByChange: (sort: 'date' | 'account' | 'unread' | 'priority') => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (dir: 'asc' | 'desc') => void;
  onEmailContextMenu?: (e: React.MouseEvent, email: Email) => void;
  selectedEmails: Set<string>;
  onBulkToggle: (id: string) => void;
  onBulkSelectAll: (ids: string[]) => void;
  onBulkClear: () => void;
  onBulkAction: (action: 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'delete') => void;
  conversationView: boolean;
  compactView: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  panelWidth?: number;
  currentTheme?: 'dark' | 'light';
  onThemeToggle?: () => void;
  onMarkAllRead?: () => void;
}) {
  const { t, lang } = useTranslation();
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [showAllFolders, setShowAllFolders] = useState(false);
  const [quickFilter, setQuickFilter] = useState<'all' | 'unread' | 'starred' | 'attachments' | `label:${EmailLabel}`>('all');
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const [labelOpenId, setLabelOpenId] = useState<string | null>(null);
  const [followupOpenId, setFollowupOpenId] = useState<string | null>(null);
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [reactionOpenId, setReactionOpenId] = useState<string | null>(null);
  const [inboxTab, setInboxTab] = useState<'all' | 'primary' | 'newsletter' | 'notification' | 'promotion'>('all');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);

  // Search history dropdown
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistoryList, setSearchHistoryList] = useState<string[]>(() => getSearchHistory());

  // Hover preview card
  const [hoverPreview, setHoverPreview] = useState<{ email: Email; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize subject for thread grouping
  const normalizeSubject = (subject: string) =>
    subject.replace(/^(Re|Fwd?|AW|Yw|SV|Ref|TR|İleti|Yanıt|İlti):\s*/gi, '').trim().toLowerCase();

  // Group emails into threads
  interface Thread { key: string; emails: Email[]; latestEmail: Email; unreadCount: number; }
  const groupIntoThreads = (emailList: Email[]): Thread[] => {
    const map = new Map<string, Email[]>();
    for (const e of emailList) {
      const key = normalizeSubject(e.subject) || e.subject.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, emails]) => {
      const sorted = [...emails].sort((a, b) => b.date.getTime() - a.date.getTime());
      return { key, emails: sorted, latestEmail: sorted[0], unreadCount: emails.filter(e => !e.read).length };
    }).sort((a, b) => b.latestEmail.date.getTime() - a.latestEmail.date.getTime());
  };
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Close sort menu on outside click
  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sortMenuOpen]);

  const selectedAccount = typeof selectedAccountId === 'number' ? accounts.find(a => a.id === selectedAccountId) : undefined;

  // Build folder tree
  const folderTree = useMemo(() => buildFolderTree(imapFolders), [imapFolders]);

  // Get main folders (INBOX, Draft, Sent, Trash) for quick access tabs
  const mainFolders = useMemo(() => {
    const folders: { [key: string]: { path: string; name: string; type: string; icon: React.ReactElement; count: number } } = {};

    for (const folder of imapFolders) {
      const type = folder.folder_type.toLowerCase();
      const nameLower = folder.name.toLowerCase();

      if ((type === 'inbox' || nameLower === 'inbox') && !folders.inbox) {
        folders.inbox = { path: folder.path, name: 'INBOX', type: 'inbox', icon: <Icons.Inbox />, count: folder.unread_count };
      } else if ((type === 'drafts' || nameLower.includes('draft')) && !folders.drafts) {
        folders.drafts = { path: folder.path, name: 'Draft', type: 'drafts', icon: <Icons.File />, count: folder.total_count };
      } else if ((type === 'sent' || nameLower.includes('sent')) && !folders.sent) {
        folders.sent = { path: folder.path, name: 'Sent', type: 'sent', icon: <Icons.Send />, count: 0 };
      } else if ((type === 'trash' || nameLower.includes('trash') || nameLower.includes('deleted')) && !folders.trash) {
        folders.trash = { path: folder.path, name: 'Trash', type: 'trash', icon: <Icons.Trash />, count: 0 };
      }
    }

    // Return in order: INBOX, Draft, Sent, Trash
    const ordered = [];
    if (folders.inbox) ordered.push(folders.inbox);
    if (folders.drafts) ordered.push(folders.drafts);
    if (folders.sent) ordered.push(folders.sent);
    if (folders.trash) ordered.push(folders.trash);

    // If no IMAP folders, show default static folders
    if (ordered.length === 0) {
      return [
        { path: 'INBOX', name: 'INBOX', type: 'inbox', icon: <Icons.Inbox />, count: emails.filter(e => !e.read).length },
        { path: 'Drafts', name: 'Draft', type: 'drafts', icon: <Icons.File />, count: 0 },
        { path: 'Sent', name: 'Sent', type: 'sent', icon: <Icons.Send />, count: 0 },
        { path: 'Trash', name: 'Trash', type: 'trash', icon: <Icons.Trash />, count: 0 },
      ];
    }

    return ordered;
  }, [imapFolders, emails]);

  // Static starred folder (filtered locally)
  const starredFolder = { path: '__starred__', name: 'Starred', type: 'starred', icon: <Icons.Star />, count: emails.filter(e => e.starred).length };

  // Get active folder name for display
  const activeFolderName = useMemo(() => {
    if (activeFolder === '__starred__') return 'Starred';
    if (activeFolder === '__snoozed__') return 'Ertelendi';
    if (activeFolder === '__followup__') return 'Takip';
    if (activeFolder === '__scheduled__') return 'Zamanlanmış';
    const folder = imapFolders.find(f => f.path === activeFolder);
    return folder?.name || 'Inbox';
  }, [activeFolder, imapFolders]);

  // Check if current folder is drafts
  const isDraftsFolder = useMemo(() => {
    return imapFolders.find(f => f.path === activeFolder)?.folder_type.toLowerCase() === 'drafts' ||
           activeFolder.toLowerCase().includes('draft');
  }, [activeFolder, imapFolders]);

  // Classify email into inbox category
  const classifyEmail = (email: Email): 'primary' | 'newsletter' | 'notification' | 'promotion' => {
    const from = email.from.email.toLowerCase();
    const subj = email.subject.toLowerCase();
    const preview = email.preview.toLowerCase();

    // Newsletter patterns
    const isNewsletter =
      /newsletter|weekly|digest|bulletin|subscribe|noreply.*news|news.*noreply/.test(from) ||
      /newsletter|unsubscribe|weekly digest|monthly report/.test(subj + preview) ||
      /unsubscribe|manage preferences|view in browser|view online/.test(preview);

    // Notification patterns
    const isNotification =
      /notification|noreply|no-reply|alert|donotreply|do-not-reply|automated|system@|security@/.test(from) ||
      /verification|password reset|security alert|login|otp|doğrulama|kod:|your code|two.factor|2fa/.test(subj + preview);

    // Promotion patterns
    const isPromotion =
      /promo|deals|offers|marketing|coupon|discount|sales@|shop@|store@|billing@|receipts@|orders@/.test(from) ||
      /sale|% off|discount|limited time|exclusive offer|coupon|order confirmed|receipt|invoice|shipment|shipped/.test(subj + preview);

    if (isNotification) return 'notification';
    if (isNewsletter) return 'newsletter';
    if (isPromotion) return 'promotion';
    return 'primary';
  };

  // Filter emails based on folder
  const filteredEmails = useMemo(() => {
    // Scheduled send virtual folder — show as pseudo-emails
    if (activeFolder === '__scheduled__') {
      return getScheduled().map((s): Email => ({
        id: s.id,
        from: { name: 'Ben', email: s.draft.to?.[0]?.email || '' },
        to: s.draft.to || [],
        subject: s.subject,
        preview: `Gönderilecek: ${new Date(s.sendAt).toLocaleString('tr-TR')}`,
        body: '',
        date: new Date(s.sendAt),
        read: false,
        starred: false,
        hasAttachments: false,
        hasImages: false,
        isDraft: false,
        deleted: false,
      }));
    }

    // If we're in the Drafts folder, convert drafts to Email format
    if (isDraftsFolder) {
      let result = drafts.map((draft): Email => {
        const toAddresses = JSON.parse(draft.toAddresses || '[]') as EmailAddress[];
        const toPreview = toAddresses.length > 0 ? toAddresses[0].email : t('mailPanel.noRecipient');

        return {
          id: `draft-${draft.id}`,
          from: { name: t('mailPanel.draft'), email: '' },
          to: toAddresses,
          subject: draft.subject || t('mailPanel.noSubject'),
          preview: `${t('mailPanel.recipientPrefix')} ${toPreview}`,
          body: '',
          bodyHtml: '',
          bodyText: '',
          date: new Date(draft.updatedAt),
          read: true,
          starred: false,
          hasAttachments: false,
          hasImages: false,
          isDraft: true,
        };
      });

      // Search filter for drafts
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        result = result.filter(e =>
          e.subject.toLowerCase().includes(query) ||
          e.preview.toLowerCase().includes(query)
        );
      }

      return result;
    }

    // Regular email filtering
    let result = emails;

    // Starred is a local filter
    if (activeFolder === '__starred__') {
      result = result.filter(e => e.starred && !e.deleted);
    } else {
      // For other folders, just filter out deleted (unless we're in trash)
      const isTrash = activeFolder.toLowerCase().includes('trash') || activeFolder.toLowerCase().includes('deleted');
      if (!isTrash) {
        result = result.filter(e => !e.deleted);
      }
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.subject.toLowerCase().includes(query) ||
        e.from.name.toLowerCase().includes(query) ||
        e.from.email.toLowerCase().includes(query) ||
        e.body.toLowerCase().includes(query)
      );
    }

    // Snooze filter — hide snoozed emails unless in __snoozed__ virtual folder
    if (activeFolder === '__snoozed__') {
      result = result.filter(e => isSnoozedNow(e.id));
    } else if (activeFolder === '__followup__') {
      result = result.filter(e => !!getFollowup(e.id));
    } else {
      result = result.filter(e => !isSnoozedNow(e.id));
    }

    // Quick filter chips (local, instant)
    if (quickFilter === 'unread') result = result.filter(e => !e.read);
    if (quickFilter === 'starred') result = result.filter(e => e.starred);
    if (quickFilter === 'attachments') result = result.filter(e => e.hasAttachments);
    if (quickFilter.startsWith('label:')) {
      const lbl = quickFilter.slice(6) as EmailLabel;
      result = result.filter(e => getEmailLabel(e.id) === lbl);
    }

    // Smart inbox tab filter (only for INBOX-like folders)
    const isInboxFolder = activeFolder.toLowerCase() === 'inbox' || activeFolder === 'INBOX' || activeFolder === '__all__';
    if (isInboxFolder && inboxTab !== 'all') {
      result = result.filter(e => classifyEmail(e) === inboxTab);
    }

    // Apply sorting
    const dir = sortDirection === 'desc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = b.date.getTime() - a.date.getTime();
          break;
        case 'unread':
          if (a.read !== b.read) { cmp = a.read ? 1 : -1; break; }
          cmp = b.date.getTime() - a.date.getTime();
          break;
        case 'account':
          if (a.accountId !== b.accountId) { cmp = (a.accountId || '').localeCompare(b.accountId || ''); break; }
          cmp = b.date.getTime() - a.date.getTime();
          break;
        case 'priority':
        default:
          if (a.read !== b.read) { cmp = a.read ? 1 : -1; break; }
          if (a.starred !== b.starred) { cmp = a.starred ? -1 : 1; break; }
          cmp = b.date.getTime() - a.date.getTime();
          break;
      }
      return cmp * dir;
    });

    // Pinned emails always float to top
    const pinned = result.filter(e => isPinned(e.id));
    const unpinned = result.filter(e => !isPinned(e.id));
    return pinned.length > 0 ? [...pinned, ...unpinned] : result;
  }, [emails, activeFolder, searchQuery, isDraftsFolder, drafts, sortBy, sortDirection, quickFilter, inboxTab]);

  // ── Collapsed icon rail ──────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="sidebar-panel flex flex-col items-center py-3 gap-1 border-r border-owl-border/30" style={{ width: 52 }}>
        <button onClick={onToggleCollapse} title="Genişlet" className="mb-1 p-1.5 rounded-lg hover:bg-owl-surface-2 transition-colors">
          <img src={owlivionIcon} alt="OwlMail" className="h-5 w-5 object-contain logo-glow" />
        </button>
        <button onClick={onComposeClick} title="Compose (C)" className="action-btn text-owl-accent hover:text-owl-accent/80 mb-1">
          <Icons.Plus />
        </button>
        <div className="w-6 h-px bg-owl-border/40 my-0.5" />
        {mainFolders.map(folder => {
          const isActive = activeFolder === folder.path;
          return (
            <button key={folder.path} onClick={() => onFolderChange(folder.path)}
              title={folder.name}
              className={`relative action-btn ${isActive ? 'text-owl-accent bg-owl-surface-2' : 'text-owl-text-secondary hover:text-owl-text'}`}
            >
              {folder.icon}
              {folder.count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-owl-accent text-white text-[8px] flex items-center justify-center font-bold leading-none">
                  {folder.count > 9 ? '9+' : folder.count}
                </span>
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={onSettingsClick} title="Ayarlar" className="action-btn text-owl-text-secondary hover:text-owl-text">
          <Icons.Settings />
        </button>
        <button onClick={onToggleCollapse} title="Genişlet"
          className="action-btn text-owl-text-secondary/50 hover:text-owl-text-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-panel flex flex-col" style={{ width: panelWidth, minWidth: 260, maxWidth: 600, flexShrink: 0 }}>
      {/* Header */}
      <div className="panel-header px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <img src={owlivionIcon} alt="OwlMail" className="h-7 w-auto object-contain logo-glow" />
            <div className="flex flex-col leading-none">
              <span className="font-bold text-[15px] tracking-tight text-owl-text">
                Owl<span className="text-owl-accent">Mail</span>
              </span>
              <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-owl-text-secondary/50 mt-0.5">by Owlivion</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {onToggleCollapse && (
              <button onClick={onToggleCollapse} className="action-btn text-owl-text-secondary/50 hover:text-owl-text-secondary" title="Daralt">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            <button
              onClick={onSyncClick}
              disabled={isSyncing}
              className="action-btn"
              title={t('sidebar.sync')}
            >
              <span className={isSyncing ? 'sync-spinning block' : 'block'}>
                <Icons.Refresh />
              </span>
            </button>
            <button
              onClick={onComposeClick}
              className="btn-compose flex items-center gap-1.5 text-white py-1.5 px-3.5 rounded-lg text-sm font-medium"
            >
              <Icons.Plus />
              <span>Compose</span>
              <kbd className="text-[10px] bg-white/15 px-1.5 py-0.5 rounded font-mono ml-0.5">C</kbd>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="search-bar flex items-center gap-2.5 px-3 py-2">
            <span className="text-owl-text-secondary/70 shrink-0">
              <Icons.Search />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search emails..."
              className="flex-1 bg-transparent text-sm text-owl-text placeholder-owl-text-secondary/60 focus:outline-none min-w-0"
              onFocus={() => { setSearchFocused(true); setSearchHistoryList(getSearchHistory()); }}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  addSearchHistory(searchQuery);
                  setSearchFocused(false);
                }
              }}
            />
            {searchQuery ? (
              <button
                onClick={() => { onSearchChange(''); }}
                className="text-owl-text-secondary/50 hover:text-owl-text-secondary transition-colors shrink-0"
              >
                <Icons.X />
              </button>
            ) : (
              <kbd className="text-[10px] text-owl-text-secondary/50 bg-owl-surface-2/80 px-1.5 py-0.5 rounded font-mono shrink-0">/</kbd>
            )}
          </div>

          {/* Search History Dropdown */}
          {searchFocused && !searchQuery && searchHistoryList.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 dropdown-panel shadow-owl-lg overflow-hidden mx-2">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-owl-border/30">
                <span className="text-[10px] uppercase tracking-wider text-owl-text-secondary/50 font-semibold">Son Aramalar</span>
                <button
                  onClick={() => { clearSearchHistory(); setSearchHistoryList([]); }}
                  className="text-[10px] text-owl-text-secondary/40 hover:text-red-400 transition-colors"
                >
                  Temizle
                </button>
              </div>
              {searchHistoryList.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { onSearchChange(q); addSearchHistory(q); setSearchFocused(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text transition-colors text-left"
                >
                  <svg className="w-3.5 h-3.5 shrink-0 text-owl-text-secondary/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span className="truncate">{q}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Advanced Search Filters */}
        <SearchFiltersComponent
          filters={searchFilters}
          onChange={onSearchFiltersChange}
          onSearch={onAdvancedSearch}
          folders={imapFolders.map(f => ({
            id: 0,
            name: f.name,
            folderType: f.folder_type
          }))}
        />

        {/* Smart Inbox Tabs — only for INBOX */}
        {(activeFolder.toUpperCase() === 'INBOX' || activeFolder === 'INBOX') && (() => {
          const tabs = [
            { key: 'all' as const, label: 'Tümü', icon: null },
            { key: 'primary' as const, label: 'Birincil', icon: '🏠' },
            { key: 'newsletter' as const, label: 'Haberler', icon: '📰' },
            { key: 'notification' as const, label: 'Bildirimler', icon: '🔔' },
            { key: 'promotion' as const, label: 'Promosyonlar', icon: '🛍️' },
          ] as const;
          const counts = Object.fromEntries(
            tabs.slice(1).map(t => [t.key, emails.filter(e => !e.deleted && classifyEmail(e) === t.key).length])
          ) as Record<string, number>;
          return (
            <div className="border-b border-owl-border/40">
              <div className="flex overflow-x-auto" style={{scrollbarWidth:'none'}}>
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setInboxTab(tab.key)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
                      inboxTab === tab.key
                        ? 'border-owl-accent text-owl-accent'
                        : 'border-transparent text-owl-text-secondary hover:text-owl-text hover:border-owl-border'
                    }`}
                  >
                    {tab.icon && <span>{tab.icon}</span>}
                    {tab.label}
                    {tab.key !== 'all' && counts[tab.key] > 0 && (
                      <span className={`text-[10px] px-1.5 py-px rounded-full font-semibold ${
                        inboxTab === tab.key ? 'bg-owl-accent/20 text-owl-accent' : 'bg-owl-surface-2 text-owl-text-secondary'
                      }`}>
                        {counts[tab.key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Quick filter chips */}
        <div className="flex items-center gap-1.5 px-3 pb-3 overflow-x-auto" style={{scrollbarWidth:'none'}}>
          {([
            { key: 'all', label: 'Tümü', dot: null },
            { key: 'unread', label: 'Okunmadı', dot: null },
            { key: 'starred', label: 'Yıldızlı', dot: null },
            { key: 'attachments', label: 'Eklentili', dot: null },
          ] as const).map(chip => (
            <button
              key={chip.key}
              onClick={() => setQuickFilter(chip.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                quickFilter === chip.key
                  ? 'bg-owl-accent text-white shadow-sm'
                  : 'bg-owl-surface text-owl-text-secondary hover:bg-owl-surface-2 hover:text-owl-text border border-owl-border/50'
              }`}
            >
              {chip.label}
            </button>
          ))}
          {/* Label filter chips */}
          {(Object.entries(LABEL_COLORS) as [EmailLabel, { dot: string; name: string }][]).map(([key, cfg]) => {
            const chipKey = `label:${key}` as const;
            const isActive = quickFilter === chipKey;
            return (
              <button
                key={key}
                onClick={() => setQuickFilter(isActive ? 'all' : chipKey)}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? 'text-white shadow-sm border-transparent'
                    : 'bg-owl-surface text-owl-text-secondary hover:bg-owl-surface-2 hover:text-owl-text border-owl-border/50'
                }`}
                style={isActive ? { background: cfg.dot, borderColor: cfg.dot } : {}}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot }} />
                {cfg.name}
              </button>
            );
          })}
        </div>

        {/* Account Selector */}
        {accounts.length > 1 && (
          <div className="relative mt-3">
            <button
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-owl-bg rounded-lg text-sm text-owl-text hover:bg-owl-surface-2 transition-colors"
            >
              <div className="flex items-center gap-2">
                {selectedAccountId === 'all' ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-owl-accent/20 flex items-center justify-center text-xs text-owl-accent">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <span className="truncate font-medium">{t('app.allAccounts')}</span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 rounded-full bg-owl-accent/20 flex items-center justify-center text-xs text-owl-accent font-medium">
                      {selectedAccount?.email?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span className="truncate">{selectedAccount?.email || t('app.selectAccount')}</span>
                  </>
                )}
              </div>
              <svg className={`w-4 h-4 text-owl-text-secondary transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {accountDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 dropdown-panel z-50">
                {/* All Accounts Option */}
                {accounts.length > 1 && (
                  <>
                    <button
                      onClick={() => {
                        onAccountChange('all');
                        setAccountDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        selectedAccountId === 'all'
                          ? 'bg-owl-accent/10 text-owl-accent'
                          : 'text-owl-text hover:bg-owl-bg'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        selectedAccountId === 'all'
                          ? 'bg-owl-accent/20 text-owl-accent'
                          : 'bg-owl-surface-2 text-owl-text-secondary'
                      }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{t('app.allAccounts')}</div>
                        <div className="text-xs text-owl-text-secondary">{accounts.length} {t('app.accountsUnifiedView')}</div>
                      </div>
                      {selectedAccountId === 'all' && (
                        <svg className="w-4 h-4 text-owl-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="border-t border-owl-border my-1"></div>
                  </>
                )}

                {/* Individual Accounts */}
                {accounts.map(account => (
                  <button
                    key={account.id}
                    onClick={() => {
                      onAccountChange(account.id);
                      setAccountDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      account.id === selectedAccountId
                        ? 'bg-owl-accent/10 text-owl-accent'
                        : 'text-owl-text hover:bg-owl-bg'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      account.id === selectedAccountId
                        ? 'bg-owl-accent/20 text-owl-accent'
                        : 'bg-owl-surface-2 text-owl-text-secondary'
                    }`}>
                      {account.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 truncate">
                      <div className="font-medium">{account.displayName || account.email}</div>
                      <div className="text-xs text-owl-text-secondary">{account.email}</div>
                    </div>
                    {account.id === selectedAccountId && (
                      <svg className="w-4 h-4 text-owl-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Folder Tabs */}
      <div className="px-3 py-2 border-b border-owl-border/40">
        <div className="flex items-center gap-0.5">
          {/* Main folders */}
          {mainFolders.slice(0, 4).map((folder) => {
            const isActive = activeFolder === folder.path;
            return (
              <button
                key={folder.path}
                onClick={() => onFolderChange(folder.path)}
                className={`folder-tab flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] ${
                  isActive
                    ? "folder-tab-active font-semibold"
                    : "text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text"
                }`}
                title={folder.name}
              >
                {folder.icon}
                {isActive && <span>{folder.name}</span>}
                {folder.count > 0 && (
                  <span className={`text-[10px] min-w-[16px] text-center px-1 py-px rounded-full leading-tight tabular-nums ${
                    isActive
                      ? "bg-owl-accent text-white font-bold"
                      : "bg-owl-surface-2 text-owl-text-secondary"
                  }`}>
                    {folder.count > 99 ? '99+' : folder.count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Starred */}
          {(() => {
            const isActive = activeFolder === '__starred__';
            return (
              <button
                onClick={() => onFolderChange('__starred__')}
                className={`folder-tab flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] ${
                  isActive
                    ? "folder-tab-active font-semibold"
                    : "text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text"
                }`}
                title="Starred"
              >
                {starredFolder.icon}
                {isActive && <span>Starred</span>}
                {starredFolder.count > 0 && (
                  <span className={`text-[10px] min-w-[16px] text-center px-1 py-px rounded-full leading-tight ${
                    isActive ? "bg-owl-accent text-white font-bold" : "bg-owl-surface-2 text-owl-text-secondary"
                  }`}>
                    {starredFolder.count}
                  </span>
                )}
              </button>
            );
          })()}

          {/* Snoozed */}
          {(() => {
            const isActive = activeFolder === '__snoozed__';
            const snoozed = getSnoozed();
            const count = Object.values(snoozed).filter(t => t > Date.now()).length;
            if (count === 0 && !isActive) return null;
            return (
              <button
                onClick={() => onFolderChange('__snoozed__')}
                className={`folder-tab flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] ${
                  isActive
                    ? "folder-tab-active font-semibold"
                    : "text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text"
                }`}
                title="Snoozed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {isActive && <span>Ertelendi</span>}
                {count > 0 && (
                  <span className={`text-[10px] min-w-[16px] text-center px-1 py-px rounded-full leading-tight ${
                    isActive ? "bg-owl-accent text-white font-bold" : "bg-owl-surface-2 text-owl-text-secondary"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })()}

          {/* Follow-up reminders */}
          {(() => {
            const isActive = activeFolder === '__followup__';
            const followups = getFollowups();
            const dueCount = Object.values(followups).filter(f => Date.now() >= f.dueDate).length;
            const totalCount = Object.keys(followups).length;
            if (totalCount === 0 && !isActive) return null;
            return (
              <button
                onClick={() => onFolderChange('__followup__')}
                className={`folder-tab flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] ${
                  isActive
                    ? "folder-tab-active font-semibold"
                    : "text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text"
                }`}
                title="Takip"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                {isActive && <span>Takip</span>}
                {totalCount > 0 && (
                  <span className={`text-[10px] min-w-[16px] text-center px-1 py-px rounded-full leading-tight ${
                    dueCount > 0 ? 'bg-orange-500 text-white font-bold' : isActive ? 'bg-owl-accent text-white font-bold' : 'bg-owl-surface-2 text-owl-text-secondary'
                  }`}>
                    {totalCount}
                  </span>
                )}
              </button>
            );
          })()}

          {/* Scheduled Send */}
          {(() => {
            const isActive = activeFolder === '__scheduled__';
            const count = getScheduled().length;
            if (count === 0 && !isActive) return null;
            return (
              <button
                onClick={() => onFolderChange('__scheduled__')}
                className={`folder-tab flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] ${
                  isActive ? "folder-tab-active font-semibold" : "text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text"
                }`}
                title="Zamanlanmış"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {isActive && <span>Zamanlanmış</span>}
                {count > 0 && (
                  <span className={`text-[10px] min-w-[16px] text-center px-1 py-px rounded-full leading-tight ${
                    isActive ? 'bg-owl-accent text-white font-bold' : 'bg-owl-surface-2 text-owl-text-secondary'
                  }`}>{count}</span>
                )}
              </button>
            );
          })()}

          <div className="flex-1" />

          {/* All Folders toggle */}
          <button
            onClick={() => setShowAllFolders(!showAllFolders)}
            className={`folder-tab flex items-center gap-1 px-2 py-1.5 text-[13px] ${
              showAllFolders ? "text-owl-text bg-owl-surface-2/60" : "text-owl-text-secondary hover:text-owl-text hover:bg-owl-surface-2/60"
            }`}
            title="All Folders"
          >
            <Icons.Folder />
            {showAllFolders ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
          </button>
        </div>
      </div>

      {/* Expandable All Folders Panel */}
      {showAllFolders && (
        <div className="border-b border-owl-border bg-owl-bg/50 max-h-[300px] overflow-y-auto">
          {isLoadingFolders ? (
            <div className="flex items-center justify-center py-4 text-owl-text-secondary text-sm">
              <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('app.foldersLoading')}
            </div>
          ) : folderTree.length === 0 ? (
            <div className="text-center py-4 text-owl-text-secondary text-sm">
              {t('app.noFolders')}
            </div>
          ) : (
            <div className="py-2">
              {folderTree.map((node) => (
                <FolderTreeItem
                  key={node.folder.path}
                  node={node}
                  level={0}
                  activeFolder={activeFolder}
                  onFolderChange={(path) => {
                    onFolderChange(path);
                    setShowAllFolders(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {/* Bulk action bar — shown when emails are selected */}
          {selectedEmails.size > 0 && (
            <div className="mx-1 mb-2 rounded-xl border border-owl-accent/30 bg-owl-accent/10 backdrop-blur-sm animate-scale-in">
              <div className="flex items-center gap-1 px-3 py-2">
                <span className="text-xs font-semibold text-owl-accent mr-1">{selectedEmails.size} seçili</span>
                <div className="flex-1 flex items-center gap-0.5 flex-wrap">
                  <button onClick={() => onBulkAction('read')} className="px-2 py-1 rounded-lg text-xs text-owl-text hover:bg-owl-accent/20 hover:text-owl-accent transition-colors" title="Okundu işaretle">Okundu</button>
                  <button onClick={() => onBulkAction('unread')} className="px-2 py-1 rounded-lg text-xs text-owl-text hover:bg-owl-accent/20 hover:text-owl-accent transition-colors" title="Okunmadı işaretle">Okunmadı</button>
                  <button onClick={() => onBulkAction('star')} className="px-2 py-1 rounded-lg text-xs text-owl-text hover:bg-yellow-400/20 hover:text-yellow-400 transition-colors" title="Yıldız ekle">
                    <svg className="inline w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z"/></svg>
                  </button>
                  <button onClick={() => onBulkAction('archive')} className="px-2 py-1 rounded-lg text-xs text-owl-text hover:bg-owl-accent/20 hover:text-owl-accent transition-colors" title="Arşivle">
                    <svg className="inline w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                  </button>
                  <button onClick={() => onBulkAction('delete')} className="px-2 py-1 rounded-lg text-xs text-owl-text hover:bg-red-500/20 hover:text-red-400 transition-colors" title="Sil">
                    <svg className="inline w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
                <button onClick={onBulkClear} className="ml-auto p-1 rounded-lg text-owl-text-secondary hover:text-owl-text hover:bg-owl-bg transition-colors" title="Seçimi temizle">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-2 py-2">
            <div className="section-label text-owl-text-secondary flex items-center gap-2">
              {activeFolderName}
              {filteredEmails.length > 0 && (
                <button
                  onClick={() =>
                    selectedEmails.size === filteredEmails.length
                      ? onBulkClear()
                      : onBulkSelectAll(filteredEmails.map(e => e.id))
                  }
                  className="text-[11px] text-owl-accent/70 hover:text-owl-accent transition-colors font-normal"
                >
                  {selectedEmails.size === filteredEmails.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-owl-text-secondary">
                {isSearching ? (
                  'Searching...'
                ) : searchQuery && searchResultsCount !== undefined ? (
                  `${searchResultsCount} results`
                ) : (
                  `${filteredEmails.length} emails`
                )}
              </span>
              {/* Mark all read button */}
              {filteredEmails.some(e => !e.read) && onMarkAllRead && (
                <button
                  onClick={onMarkAllRead}
                  className="p-1 rounded hover:bg-owl-bg text-owl-text-secondary hover:text-owl-accent transition-colors"
                  title="Tümünü okundu işaretle"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4" />
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                  </svg>
                </button>
              )}
              {/* Sort button */}
              <div className="relative" ref={sortMenuRef}>
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className="p-1 rounded hover:bg-owl-bg text-owl-text-secondary hover:text-owl-text transition-colors"
                  title={t('mailPanel.sort')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 4h10M4 7h6M6 10h2" />
                  </svg>
                </button>
                {sortMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 dropdown-panel z-50 py-1">
                    {([
                      { value: 'priority', label: t('mailPanel.priority') },
                      { value: 'date', label: t('mailPanel.byDate') },
                      { value: 'unread', label: t('mailPanel.unreadFirst') },
                      { value: 'account', label: t('mailPanel.byAccount') },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { onSortByChange(opt.value); setSortMenuOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          sortBy === opt.value
                            ? 'text-owl-accent bg-owl-accent/10'
                            : 'text-owl-text hover:bg-owl-bg'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <div className="border-t border-owl-border my-1" />
                    <button
                      onClick={() => { onSortDirectionChange(sortDirection === 'desc' ? 'asc' : 'desc'); setSortMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-owl-text hover:bg-owl-bg transition-colors flex items-center justify-between"
                    >
                      <span>{sortDirection === 'desc' ? t('mailPanel.newestFirst') : t('mailPanel.oldestFirst')}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        {sortDirection === 'desc' ? (
                          <path d="M6 2v8M3 7l3 3 3-3" />
                        ) : (
                          <path d="M6 10V2M3 5l3-3 3 3" />
                        )}
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {(() => {
            const renderEmailItem = (email: Email) => {
            const isSelected = selectedId === email.id;
            const isUnread = !email.read;
            const isBulkSelected = selectedEmails.has(email.id);
            const emailLabel = getEmailLabel(email.id);
            return (
              <button
                key={email.accountId ? `${email.accountId}-${email.id}` : email.id}
                onClick={(e) => {
                  if (e.shiftKey || selectedEmails.size > 0) {
                    onBulkToggle(email.id);
                  } else {
                    onSelect(email.id);
                  }
                }}
                onContextMenu={onEmailContextMenu ? (e) => onEmailContextMenu(e, email) : undefined}
                onMouseEnter={(e) => {
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  hoverTimerRef.current = setTimeout(() => {
                    setHoverPreview({ email, x: rect.right + 8, y: rect.top });
                  }, 450);
                }}
                onMouseLeave={() => {
                  if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
                  setHoverPreview(null);
                }}
                className={`email-item w-full text-left mb-1 ${
                  isSelected ? 'email-item-selected' : ''
                } ${isBulkSelected && !isSelected ? 'email-item-bulk-selected' : ''} ${isUnread && !isSelected ? 'email-item-unread' : ''} ${isPinned(email.id) ? 'email-item-pinned' : ''}`}
              >
                {isPinned(email.id) && (
                  <div className="absolute top-0 left-0 w-0.5 h-full bg-owl-accent rounded-l opacity-60" />
                )}
                <div className={`flex items-start gap-3 ${compactView ? 'px-2 py-1.5' : 'p-3'}`}>
                  {/* Avatar with checkbox overlay on hover/bulk-select */}
                  <div className="relative shrink-0 group/avatar">
                    <div
                      className={`absolute inset-0 z-10 flex items-center justify-center rounded-full transition-opacity ${
                        isBulkSelected ? 'opacity-100' : 'opacity-0 group-hover/avatar:opacity-100'
                      }`}
                      onClick={(e) => { e.stopPropagation(); onBulkToggle(email.id); }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        isBulkSelected
                          ? 'bg-owl-accent text-white shadow-md shadow-owl-accent/40'
                          : 'bg-owl-bg/80 border-2 border-owl-border text-transparent hover:border-owl-accent'
                      }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      </div>
                    </div>
                    <div className={`${isBulkSelected ? 'opacity-30' : ''} transition-opacity`}>
                      <div className={isUnread && !isSelected ? 'avatar-unread rounded-full' : ''}>
                        <CompanyAvatar
                          email={email.from.email}
                          name={email.from.name}
                          size="md"
                          unread={isUnread}
                        />
                      </div>
                    </div>
                    {isUnread && !isBulkSelected && <span className="unread-dot" />}
                    {/* Label dot */}
                    {emailLabel && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-owl-surface z-20"
                        style={{ background: LABEL_COLORS[emailLabel].dot }}
                        title={LABEL_COLORS[emailLabel].name}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Sender + Date */}
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={`text-[13px] truncate ${isUnread ? 'font-bold text-owl-text' : 'font-medium text-owl-text/90'}`}>
                          {email.from.name || email.from.email}
                        </span>
                        {(() => {
                          if (selectedAccountId !== 'all' || !email.accountId) return null;
                          const account = accounts.find(a => a.id.toString() === email.accountId || a.id === parseInt(email.accountId || '0'));
                          if (!account) return null;
                          return (
                            <AccountBadge
                              accountEmail={account.email}
                              accountName={account.displayName}
                              size="xs"
                            />
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {/* "Yeni" badge: unread + arrived after session start */}
                        {isUnread && email.date.getTime() > SESSION_START && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-owl-accent text-white animate-pulse">
                            Yeni
                          </span>
                        )}
                        <span className={`text-[11px] tabular-nums ${isUnread ? 'text-owl-accent font-semibold' : 'text-owl-text-secondary/70'}`}>
                          {formatDate(email.date, t, lang)}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Subject */}
                    <div className={`text-[13px] truncate leading-snug ${isUnread ? 'subject-unread' : 'text-owl-text-secondary/80 font-normal'}`}>
                      {email.subject || t('mailPanel.noSubject')}
                    </div>

                    {/* Row 3: Preview + icons */}
                    <div className="flex items-center gap-1.5 mt-0.5 group/row3">
                      <span className="text-[12px] text-owl-text-secondary/55 truncate flex-1 leading-snug">
                        {email.preview}
                      </span>
                      {email.id.startsWith('sched-') && (
                        <span className="text-owl-accent/60 shrink-0 text-[11px] font-medium flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </span>
                      )}
                      {!email.id.startsWith('sched-') && email.hasAttachments && (
                        <span className="text-owl-text-secondary/40 shrink-0">
                          <Icons.Paperclip />
                        </span>
                      )}
                      {getNote(email.id) && (
                        <span className="text-yellow-400/60 shrink-0" title="Not var">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </span>
                      )}
                      {isFollowupDue(email.id) && (
                        <span className="text-orange-400 shrink-0" title="Takip süresi doldu">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                        </span>
                      )}
                      {!isFollowupDue(email.id) && getFollowup(email.id) && (
                        <span className="text-owl-accent/50 shrink-0" title={`Takip: ${getFollowup(email.id)!.days} gün`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                        </span>
                      )}
                      {email.isDraft ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            const draftId = parseInt(email.id.replace('draft-', ''));
                            if (onDeleteDraft && window.confirm(t('mailPanel.confirmDeleteDraft'))) {
                              onDeleteDraft(draftId);
                            }
                          }}
                          className="shrink-0 p-0.5 rounded cursor-pointer text-owl-text-secondary/40 hover:text-red-500 transition-colors"
                          title={t('mailPanel.deleteDraft')}
                        >
                          <Icons.Trash />
                        </span>
                      ) : (
                        <>
                          {/* Pin button */}
                          <span
                            onClick={(e) => { e.stopPropagation(); togglePin(email.id); forceUpdate(n => n + 1); }}
                            className={`shrink-0 p-0.5 rounded cursor-pointer transition-colors ${isPinned(email.id) ? 'text-owl-accent' : 'text-owl-text-secondary/30 hover:text-owl-accent'}`}
                            title={isPinned(email.id) ? 'Sabitlemeyi kaldır' : 'Sabitle'}
                          >
                            <svg className="w-3.5 h-3.5" fill={isPinned(email.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                            </svg>
                          </span>
                          {/* Label picker */}
                          <div className="relative shrink-0">
                            <span
                              onClick={(e) => { e.stopPropagation(); setLabelOpenId(labelOpenId === email.id ? null : email.id); setSnoozeOpenId(null); }}
                              className="p-0.5 rounded cursor-pointer transition-colors block"
                              title="Etiketle"
                              style={{ color: emailLabel ? LABEL_COLORS[emailLabel].dot : undefined }}
                            >
                              <svg className="w-3.5 h-3.5" fill={emailLabel ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/>
                              </svg>
                            </span>
                            {labelOpenId === email.id && (
                              <div
                                className="absolute bottom-full right-0 mb-1 w-36 dropdown-panel z-50 py-1.5 animate-scale-in"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-2.5 pb-1 text-[10px] uppercase tracking-wider text-owl-text-secondary/60 font-semibold">Etiket</div>
                                {(Object.entries(LABEL_COLORS) as [EmailLabel, { dot: string; name: string }][]).map(([lbl, cfg]) => (
                                  <button
                                    key={lbl}
                                    onClick={() => { setEmailLabel(email.id, emailLabel === lbl ? null : lbl); setLabelOpenId(null); forceUpdate(n => n + 1); }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-owl-text hover:bg-owl-bg transition-colors"
                                  >
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cfg.dot }} />
                                    {cfg.name}
                                    {emailLabel === lbl && <svg className="ml-auto w-3 h-3 text-owl-accent" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                  </button>
                                ))}
                                {emailLabel && (
                                  <button
                                    onClick={() => { setEmailLabel(email.id, null); setLabelOpenId(null); forceUpdate(n => n + 1); }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-owl-text-secondary hover:bg-owl-bg transition-colors border-t border-owl-border mt-1"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                    Kaldır
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Snooze button */}
                          <div className="relative shrink-0">
                            <span
                              onClick={(e) => { e.stopPropagation(); setSnoozeOpenId(snoozeOpenId === email.id ? null : email.id); }}
                              className="p-0.5 rounded cursor-pointer text-owl-text-secondary/30 hover:text-owl-accent transition-colors block"
                              title="Ertele"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                            </span>
                            {snoozeOpenId === email.id && (
                              <div
                                className="absolute bottom-full right-0 mb-1 w-40 dropdown-panel z-50 py-1 animate-scale-in"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {[
                                  { label: '1 saat', ms: 60 * 60 * 1000 },
                                  { label: '3 saat', ms: 3 * 60 * 60 * 1000 },
                                  { label: 'Yarın sabah', ms: (() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0); return d.getTime() - Date.now(); })() },
                                  { label: 'Pazartesi', ms: (() => { const d = new Date(); const days = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate()+days); d.setHours(9,0,0,0); return d.getTime() - Date.now(); })() },
                                ].map(opt => (
                                  <button
                                    key={opt.label}
                                    onClick={() => {
                                      snoozeEmail(email.id, Date.now() + opt.ms);
                                      setSnoozeOpenId(null);
                                      forceUpdate(n => n + 1);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-owl-text hover:bg-owl-bg transition-colors"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                                {isSnoozedNow(email.id) && (
                                  <button
                                    onClick={() => { unsnoozeEmail(email.id); setSnoozeOpenId(null); forceUpdate(n => n + 1); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-owl-bg transition-colors border-t border-owl-border mt-1"
                                  >
                                    Ertelemeyi kaldır
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Follow-up reminder button */}
                          <div className="relative shrink-0">
                            <span
                              onClick={(e) => { e.stopPropagation(); setFollowupOpenId(followupOpenId === email.id ? null : email.id); setSnoozeOpenId(null); setLabelOpenId(null); setNoteOpenId(null); }}
                              className={`p-0.5 rounded cursor-pointer transition-colors block ${getFollowup(email.id) ? (isFollowupDue(email.id) ? 'text-orange-400' : 'text-owl-accent/70') : 'text-owl-text-secondary/30 hover:text-orange-400'}`}
                              title="Takip hatırlatıcısı"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                              </svg>
                            </span>
                            {followupOpenId === email.id && (
                              <div className="absolute bottom-full right-0 mb-1 w-44 dropdown-panel z-50 py-1.5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                                <div className="px-2.5 pb-1 text-[10px] uppercase tracking-wider text-owl-text-secondary/60 font-semibold">Takip Et</div>
                                {[
                                  { label: '1 gün sonra', days: 1 },
                                  { label: '3 gün sonra', days: 3 },
                                  { label: '1 hafta sonra', days: 7 },
                                  { label: '2 hafta sonra', days: 14 },
                                ].map(opt => (
                                  <button key={opt.days} onClick={() => { setFollowup(email.id, opt.days, email.subject); setFollowupOpenId(null); forceUpdate(n => n + 1); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-owl-text hover:bg-owl-bg transition-colors">
                                    {opt.label}
                                  </button>
                                ))}
                                {getFollowup(email.id) && (
                                  <button onClick={() => { clearFollowup(email.id); setFollowupOpenId(null); forceUpdate(n => n + 1); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-owl-bg transition-colors border-t border-owl-border mt-1">
                                    Hatırlatıcıyı kaldır
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Note button */}
                          <div className="relative shrink-0">
                            <span
                              onClick={(e) => { e.stopPropagation(); const existing = getNote(email.id); setNoteText(existing); setNoteOpenId(noteOpenId === email.id ? null : email.id); setFollowupOpenId(null); setSnoozeOpenId(null); setLabelOpenId(null); }}
                              className={`p-0.5 rounded cursor-pointer transition-colors block ${getNote(email.id) ? 'text-yellow-400/80 hover:text-yellow-400' : 'text-owl-text-secondary/30 hover:text-yellow-400'}`}
                              title="Not ekle"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                            </span>
                            {noteOpenId === email.id && (
                              <div className="absolute bottom-full right-0 mb-1 w-56 dropdown-panel z-50 p-2.5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                                <div className="text-[10px] uppercase tracking-wider text-owl-text-secondary/60 font-semibold mb-1.5">Not</div>
                                <textarea
                                  autoFocus
                                  value={noteText}
                                  onChange={(e) => setNoteText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { saveNote(email.id, noteText); setNoteOpenId(null); forceUpdate(n => n + 1); } if (e.key === 'Escape') { setNoteOpenId(null); } }}
                                  placeholder="Bu email hakkında not..."
                                  className="w-full h-20 bg-owl-bg text-owl-text text-xs rounded px-2 py-1.5 border border-owl-border/60 focus:border-owl-accent/50 focus:outline-none resize-none placeholder:text-owl-text-secondary/40"
                                />
                                <div className="flex items-center justify-between mt-1.5 gap-2">
                                  <span className="text-[10px] text-owl-text-secondary/40">⌘↵ kaydet</span>
                                  <div className="flex gap-1">
                                    {getNote(email.id) && <button onClick={() => { saveNote(email.id, ''); setNoteOpenId(null); forceUpdate(n => n + 1); }} className="px-2 py-1 text-[11px] text-red-400 hover:bg-owl-bg rounded transition-colors">Sil</button>}
                                    <button onClick={() => { saveNote(email.id, noteText); setNoteOpenId(null); forceUpdate(n => n + 1); }} className="px-2 py-1 text-[11px] bg-owl-accent text-white rounded hover:bg-owl-accent/90 transition-colors">Kaydet</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Star button */}
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStar(email.id);
                            }}
                            className={`shrink-0 p-0.5 rounded cursor-pointer transition-colors ${
                              email.starred
                                ? 'text-yellow-400 hover:text-yellow-300'
                                : 'text-owl-text-secondary/30 hover:text-yellow-400'
                            }`}
                            title={email.starred ? t('mailPanel.removeStar') : t('mailPanel.addStar')}
                          >
                            {email.starred ? <Icons.StarFilled /> : <Icons.Star />}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Row 4: Emoji Reactions */}
                    {(() => {
                      const reactions = getEmailReactions(email.id);
                      if (reactions.length === 0 && reactionOpenId !== email.id) return null;
                      return (
                        <div className="flex items-center gap-1 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {reactions.map(emoji => (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); toggleReaction(email.id, emoji); forceUpdate(n => n + 1); }}
                              className="text-[13px] px-1.5 py-0.5 rounded-full bg-owl-surface-2/80 border border-owl-border/40 hover:border-owl-accent/40 hover:bg-owl-accent/10 transition-all leading-none"
                              title={`${emoji} reaksiyonunu kaldır`}
                            >
                              {emoji}
                            </button>
                          ))}
                          {reactionOpenId === email.id && (
                            <div className="flex items-center gap-0.5 bg-owl-surface border border-owl-border/60 rounded-full px-1 py-0.5 shadow-owl-md">
                              {REACTION_EMOJIS.map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={(e) => { e.stopPropagation(); toggleReaction(email.id, emoji); setReactionOpenId(null); forceUpdate(n => n + 1); }}
                                  className={`text-[14px] px-1 py-0.5 rounded-full hover:scale-125 transition-transform leading-none ${reactions.includes(emoji) ? 'opacity-50' : ''}`}
                                  title={emoji}
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button onClick={(e) => { e.stopPropagation(); setReactionOpenId(null); }}
                                className="ml-0.5 text-owl-text-secondary/40 hover:text-owl-text-secondary text-[11px] px-1">✕</button>
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setReactionOpenId(reactionOpenId === email.id ? null : email.id); }}
                            className="text-[11px] px-1.5 py-0.5 rounded-full border border-owl-border/30 text-owl-text-secondary/40 hover:text-owl-text-secondary hover:border-owl-border/60 transition-all leading-none"
                            title="Reaksiyon ekle"
                          >
                            {reactionOpenId === email.id ? '–' : '+😊'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </button>
            );
            }; // close renderEmailItem

            if (!conversationView) {
              // Date grouping
              const now = new Date();
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
              const yesterdayStart = todayStart - 86400000;
              const weekStart = todayStart - 6 * 86400000;
              const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
              const dateGroups: { label: string; emails: Email[] }[] = [
                { label: 'Bugün', emails: [] },
                { label: 'Dün', emails: [] },
                { label: 'Bu Hafta', emails: [] },
                { label: 'Bu Ay', emails: [] },
                { label: 'Daha Önce', emails: [] },
              ];
              filteredEmails.forEach(e => {
                const t = e.date.getTime();
                if (t >= todayStart) dateGroups[0].emails.push(e);
                else if (t >= yesterdayStart) dateGroups[1].emails.push(e);
                else if (t >= weekStart) dateGroups[2].emails.push(e);
                else if (t >= monthStart) dateGroups[3].emails.push(e);
                else dateGroups[4].emails.push(e);
              });
              const activeGroups = dateGroups.filter(g => g.emails.length > 0);
              // Only show grouping headers when there are multiple groups
              if (activeGroups.length <= 1) {
                return <>{filteredEmails.map((e) => renderEmailItem(e))}</>;
              }
              return (
                <>
                  {activeGroups.map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 z-[4] bg-owl-bg/95 backdrop-blur-sm">
                        <span className="text-[10px] font-semibold text-owl-text-secondary/50 uppercase tracking-[0.12em]">{group.label}</span>
                        <div className="flex-1 h-px bg-owl-border/25" />
                        <span className="text-[10px] text-owl-text-secondary/35">{group.emails.length}</span>
                      </div>
                      {group.emails.map((e) => renderEmailItem(e))}
                    </div>
                  ))}
                </>
              );
            }

            // Thread/conversation view
            const threads = groupIntoThreads(filteredEmails);
            return (
              <>
                {threads.map(thread => {
                  const isExpanded = expandedThreads.has(thread.key) || thread.emails.length === 1;
                  if (isExpanded) {
                    return (
                      <div key={thread.key} className="thread-group mb-1">
                        {thread.emails.length > 1 && (
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-owl-border/20 bg-owl-surface/30 sticky top-0 z-[5]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-owl-accent/70 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h11"/></svg>
                              <span className="text-[12px] font-semibold text-owl-text truncate">
                                {normalizeSubject(thread.latestEmail.subject) || thread.latestEmail.subject}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-[11px] text-owl-text-secondary/60">{thread.emails.length} mesaj</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedThreads(prev => { const n = new Set(prev); n.delete(thread.key); return n; }); }}
                                className="p-0.5 rounded hover:bg-owl-surface-2 text-owl-text-secondary/50 hover:text-owl-text-secondary transition-colors"
                                title="Konuyu daralt"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m18 15-6-6-6 6"/></svg>
                              </button>
                            </div>
                          </div>
                        )}
                        <div className={thread.emails.length > 1 ? 'border-l-2 border-owl-accent/20 ml-4' : ''}>
                          {thread.emails.map((e) => renderEmailItem(e))}
                        </div>
                      </div>
                    );
                  }
                  // Collapsed thread summary
                  const uniqueSenders = [...new Set(thread.emails.map(e => e.from.name || e.from.email))].slice(0, 3);
                  const hasUnread = thread.unreadCount > 0;
                  return (
                    <button
                      key={thread.key}
                      onClick={() => setExpandedThreads(prev => new Set([...prev, thread.key]))}
                      className={`email-item w-full text-left mb-1 ${hasUnread ? 'email-item-unread' : ''}`}
                    >
                      <div className={`flex items-start gap-3 ${compactView ? 'px-2 py-1.5' : 'px-3 py-3'}`}>
                        <div className="relative shrink-0">
                          <div className="relative w-8 h-8">
                            {thread.emails.length > 1 && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-owl-bg bg-owl-surface-2 z-0" />
                            )}
                            <div className="relative z-10">
                              <CompanyAvatar email={thread.latestEmail.from.email} name={thread.latestEmail.from.name} size="md" />
                            </div>
                          </div>
                          {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-owl-accent z-20" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-[13px] truncate ${hasUnread ? 'font-bold text-owl-text' : 'text-owl-text/80'}`}>
                              {uniqueSenders.join(', ')}
                            </span>
                            <div className="flex items-center gap-1.5 ml-2 shrink-0">
                              <span className="text-[10px] px-1.5 py-px rounded-full bg-owl-surface-2 text-owl-text-secondary font-semibold border border-owl-border/40">{thread.emails.length}</span>
                              <span className={`text-[11px] tabular-nums ${hasUnread ? 'text-owl-accent font-semibold' : 'text-owl-text-secondary/60'}`}>{formatDate(thread.latestEmail.date, t, lang)}</span>
                            </div>
                          </div>
                          <div className={`text-[13px] truncate leading-snug mb-0.5 ${hasUnread ? 'font-semibold text-owl-text' : 'text-owl-text/75'}`}>
                            {normalizeSubject(thread.latestEmail.subject) || thread.latestEmail.subject}
                          </div>
                          <span className="text-[12px] text-owl-text-secondary/55 truncate block leading-snug">
                            {thread.latestEmail.from.name}: {thread.latestEmail.preview}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            );
          })()}
          {filteredEmails.length === 0 && (() => {
            const isInbox = activeFolder.toUpperCase() === 'INBOX' || activeFolder === 'INBOX';
            const hasEmails = emails.length > 0;
            const isInboxZero = isInbox && hasEmails && !searchQuery;
            return (
              <div className="flex flex-col items-center justify-center py-12 text-owl-text-secondary gap-3">
                {isInboxZero ? (
                  <>
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-owl-accent/20 to-owl-accent/5 flex items-center justify-center animate-bounce-slow">
                        <span className="text-3xl">🦉</span>
                      </div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-owl-text/80">Inbox Zero! 🎉</p>
                      <p className="text-[12px] text-owl-text-secondary/50 mt-0.5">Tüm emailler okundu. Harika iş!</p>
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      {['⭐', '🎊', '✨', '🚀', '💎'].map((emoji, i) => (
                        <span key={i} className="text-lg animate-bounce-slow" style={{ animationDelay: `${i * 0.15}s` }}>{emoji}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-owl-surface-2 flex items-center justify-center opacity-60">
                      <Icons.Mail />
                    </div>
                    <p className="text-sm opacity-60">{t('app.noEmailsInFolder')}</p>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Stats Strip */}
      {(() => {
        const today = new Date(); today.setHours(0,0,0,0);
        const todayEmails = emails.filter(e => e.date >= today);
        const unreadToday = todayEmails.filter(e => !e.read).length;
        const senderCounts: Record<string, number> = {};
        emails.forEach(e => { const s = e.from.email; senderCounts[s] = (senderCounts[s] || 0) + 1; });
        const topSender = Object.entries(senderCounts).sort((a,b) => b[1]-a[1])[0];
        return (
          <div className="px-3 pt-2 pb-1 border-t border-owl-border/20 flex items-center gap-3 text-[10px] text-owl-text-secondary/50">
            <span className="flex items-center gap-1">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span>Bugün: <strong className="text-owl-text-secondary/70">{todayEmails.length}</strong></span>
            </span>
            {unreadToday > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-owl-accent/60 inline-block" />
                <span><strong className="text-owl-accent/70">{unreadToday}</strong> yeni</span>
              </span>
            )}
            {topSender && (
              <span className="truncate flex-1 text-right" title={`En çok: ${topSender[0]}`}>
                {topSender[0].split('@')[0]} <strong className="text-owl-text-secondary/70">({topSender[1]})</strong>
              </span>
            )}
          </div>
        );
      })()}

      {/* Account Info Footer */}
      <div className="panel-footer px-3 py-2.5">
        <div className="flex items-center gap-2.5 px-1">
          {/* Avatar with gradient ring */}
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', boxShadow: '0 0 0 2px rgba(139,92,246,0.25)' }}>
              {selectedAccount?.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || selectedAccount?.email?.charAt(0).toUpperCase() || '?'}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-owl-bg" />
          </div>

          {/* Account name/email */}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-owl-text truncate leading-tight">
              {selectedAccount?.displayName || t('app.selectAccount')}
            </div>
            <div className="text-[11px] text-owl-text-secondary/60 truncate leading-tight mt-0.5">
              {selectedAccount?.email || ''}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onFiltersClick}
              className="action-btn"
              title={t('sidebar.filters')}
            >
              <Icons.Filter />
            </button>
            {/* Dark/Light theme toggle */}
            {onThemeToggle && (
              <button
                onClick={onThemeToggle}
                className="action-btn"
                title={currentTheme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
              >
                {currentTheme === 'dark' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 010 10 5 5 0 010-10z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={onSettingsClick}
              className="action-btn"
              title={t('sidebar.settings')}
            >
              <Icons.Settings />
            </button>
          </div>
        </div>
      </div>

      {/* Hover Preview Card */}
      {hoverPreview && (() => {
        const safeX = Math.min(hoverPreview.x, window.innerWidth - 308);
        const safeY = Math.min(hoverPreview.y, window.innerHeight - 180);
        return (
          <div
            className="fixed z-[400] w-72 dropdown-panel shadow-owl-lg pointer-events-none animate-scale-in"
            style={{ left: safeX, top: safeY }}
          >
            <div className="p-3.5">
              <p className="text-sm font-semibold text-owl-text leading-snug line-clamp-2 mb-1.5">
                {hoverPreview.email.subject}
              </p>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[11px] text-owl-text-secondary/80 font-medium truncate">
                  {hoverPreview.email.from.name}
                </span>
                <span className="text-owl-border/60">·</span>
                <span className="text-[11px] text-owl-text-secondary/50 shrink-0">
                  {hoverPreview.email.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p className="text-xs text-owl-text-secondary/60 leading-relaxed line-clamp-3">
                {hoverPreview.email.preview}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Command Palette
function CommandPalette({ isOpen, onClose, onCommand }: { isOpen: boolean; onClose: () => void; onCommand: (cmd: string) => void }) {
  const [query, setQuery] = useState("");
  const { t } = useTranslation();

  if (!isOpen) return null;

  const commands = [
    { id: "compose", name: t('commands.newEmail'), shortcut: "C", icon: <Icons.Plus /> },
    { id: "search", name: t('commands.searchCmd'), shortcut: "/", icon: <Icons.Search /> },
    { id: "reply", name: t('commands.replyCmd'), shortcut: "R", icon: <Icons.Reply /> },
    { id: "replyAll", name: t('commands.replyAllCmd'), shortcut: "A", icon: <Icons.ReplyAll /> },
    { id: "forward", name: t('commands.forwardCmd'), shortcut: "F", icon: <Icons.Forward /> },
    { id: "archive", name: t('commands.archiveCmd'), shortcut: "E", icon: <Icons.Archive /> },
    { id: "delete", name: t('commands.deleteCmd'), shortcut: "#", icon: <Icons.Trash /> },
    { id: "star", name: t('commands.starCmd'), shortcut: "S", icon: <Icons.Star /> },
    { id: "markUnread", name: t('commands.markUnreadCmd'), shortcut: "U", icon: <Icons.MailUnread /> },
    { id: "aiReply", name: t('commands.aiReplyCmd'), shortcut: "G", icon: <Icons.Sparkles /> },
    { id: "shortcuts", name: t('commands.shortcutsHelp'), shortcut: "?", icon: <Icons.Command /> },
  ];

  const filteredCommands = query
    ? commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : commands;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="w-[500px] rounded-2xl overflow-hidden dropdown-panel" style={{boxShadow:'0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.15)'}} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-4 py-3 border-b border-owl-border/50">
          <Icons.Command />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('app.searchCommand')}
            className="flex-1 ml-3 bg-transparent text-owl-text placeholder-owl-text-secondary focus:outline-none"
            autoFocus
          />
        </div>
        <div className="py-2 max-h-[300px] overflow-y-auto">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => { onCommand(cmd.id); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-owl-surface-2 transition-colors"
            >
              <span className="text-owl-text-secondary">{cmd.icon}</span>
              <span className="text-owl-text flex-1 text-left">{cmd.name}</span>
              <kbd className="px-2 py-1 text-xs bg-owl-bg rounded text-owl-text-secondary">{cmd.shortcut}</kbd>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main App
type Page = 'mail' | 'settings' | 'filters';
type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

function App() {
  // Mobile navigation (hook must be before any conditional returns)
  const mobileNav = useMobileNavigation();
  const mobile = isMobile();
  const { t: _tApp, lang: appLang } = useTranslation();

  const contextMenu = useContextMenu();
  const [currentPage, setCurrentPage] = useState<Page>('mail');
  const [activeFolder, setActiveFolder] = useState("INBOX");
  const [emails, setEmails] = useState<Email[]>([]);  // Start empty - no mock data
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Search state (FTS5 backend + Advanced Filters)
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [, setSearchTime] = useState<number>(0); // Track search performance

  // Unified Inbox state
  const [sortBy, setSortBy] = useState<'date' | 'account' | 'unread' | 'priority'>('date'); // DEFAULT: date (newest first)
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc'); // DEFAULT: newest/unread first
  const [accountFetchStatuses, setAccountFetchStatuses] = useState<any[]>([]); // Track account fetch status for error display

  // Log account fetch errors (TODO: Add UI banner for failed accounts)
  useEffect(() => {
    const failedAccounts = accountFetchStatuses.filter(s => !s.success);
    if (failedAccounts.length > 0) {
      console.warn('[Multi-Account] Some accounts failed to fetch:', failedAccounts);
    }
  }, [accountFetchStatuses]);

  // Account state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null | 'all'>(null);
  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [_isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // IMAP Folders state
  const [imapFolders, setImapFolders] = useState<ImapFolder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  // Drafts state
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const knownEmailIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  // Email cache: per account+folder (key = "accountId:folderPath")
  const emailCache = useRef<Map<string, Email[]>>(new Map());
  const cacheKey = (accountId: number | string, folder: string) => `${accountId}:${folder}`;

  // Settings state for API keys and auto-sync
  const [geminiApiKey, setGeminiApiKey] = useState<string | undefined>(undefined);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(5); // minutes
  const [autoPhishingDetection, setAutoPhishingDetection] = useState(true);
  const [autoMarkReadDelay, setAutoMarkReadDelay] = useState(2); // seconds
  const [appSettings, setAppSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // Apply dark/light theme to document
  useEffect(() => {
    const theme = appSettings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [appSettings.theme]);

  // Load settings from localStorage
  const loadSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem('owlivion-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        setGeminiApiKey(settings.geminiApiKey);
        setAutoSyncEnabled(settings.autoSyncEnabled ?? false);
        setAutoSyncInterval(settings.autoSyncInterval ?? 5);
        setAutoPhishingDetection(settings.autoPhishingDetection ?? true);
        setAutoMarkReadDelay(settings.autoMarkReadDelay ?? 2);
        setAppSettings({ ...DEFAULT_SETTINGS, ...settings });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  // Load on mount + listen for storage changes (from Settings page)
  useEffect(() => {
    loadSettings();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'owlivion-settings') loadSettings();
    };
    // Custom event for same-tab changes
    const handleSettingsUpdate = () => loadSettings();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('owlivion-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('owlivion-settings-updated', handleSettingsUpdate);
    };
  }, [loadSettings]);

  // Fetch folders for an account
  const fetchFolders = useCallback(async (accountId: number) => {
    setIsLoadingFolders(true);
    try {
      const { listFolders } = await import('./services/mailService');
      const folders = await listFolders(accountId.toString());
      console.log('Fetched IMAP folders:', folders);
      setImapFolders(folders);
    } catch (err) {
      console.error('Failed to fetch folders:', err);
      setImapFolders([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  // Search handler (backend FTS5)
  const handleSearch = useCallback(async (query: string, accountId: number) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const { searchEmails } = await import('./services/mailService');
      const results = await searchEmails(accountId.toString(), query, activeFolder);

      // Convert EmailSummary[] to Email[] format
      const mappedResults: Email[] = results.map(result => ({
        id: result.uid.toString(),
        from: {
          name: result.fromName || result.fromAddress,
          email: result.fromAddress,
        },
        to: [],
        subject: result.subject,
        preview: result.preview,
        body: result.preview,
        date: new Date(result.date),
        read: result.isRead,
        starred: result.isStarred,
        hasAttachments: result.hasAttachments,
        hasImages: result.hasInlineImages,
      }));

      setSearchResults(mappedResults);
      console.log(`FTS5 search returned ${mappedResults.length} results`);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [activeFolder]);

  // Advanced search handler with filters
  const handleAdvancedSearch = useCallback(async () => {
    if (!selectedAccountId) return;

    // Check if there are any filters (query or other filters)
    const hasFilters = searchFilters.query?.trim() ||
                      Object.keys(searchFilters).some(key =>
                        key !== 'query' && searchFilters[key as keyof SearchFilters] !== undefined
                      );

    if (!hasFilters) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const { searchEmailsAdvanced } = await import('./services/mailService');
      const result = await searchEmailsAdvanced(
        selectedAccountId.toString(),
        searchFilters,
        100,
        0
      );

      // Convert EmailSummary[] to Email[] format
      const mappedResults: Email[] = result.emails.map(email => ({
        id: email.uid.toString(),
        from: {
          name: email.fromName || email.fromAddress,
          email: email.fromAddress,
        },
        to: [],
        subject: email.subject,
        preview: email.preview,
        body: email.preview,
        date: new Date(email.date),
        read: email.isRead,
        starred: email.isStarred,
        hasAttachments: email.hasAttachments,
        hasImages: email.hasInlineImages,
      }));

      setSearchResults(mappedResults);
      setSearchTime(result.searchTime);
      console.log(`Advanced search returned ${mappedResults.length} results (${result.searchTime}ms)`);
    } catch (error) {
      console.error('Advanced search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [selectedAccountId, searchFilters]);

  // Debounced search (wait 300ms after user stops typing)
  const debouncedSearch = useMemo(() => {
    let timeoutId: number | undefined;
    return (query: string, accountId: number) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        handleSearch(query, accountId);
      }, 300);
    };
  }, [handleSearch]);

  // Function to reload accounts from database (used after settings changes)
  const mapAccount = (acc: any): Account => ({
    id: acc.id,
    email: acc.email,
    displayName: acc.displayName || acc.display_name || acc.email,
    imapHost: acc.imapHost || acc.imap_host,
    imapPort: acc.imapPort || acc.imap_port,
    imapSecurity: acc.imapSecurity || acc.imap_security,
    imapUsername: acc.imapUsername || acc.imap_username,
    smtpHost: acc.smtpHost || acc.smtp_host,
    smtpPort: acc.smtpPort || acc.smtp_port,
    smtpSecurity: acc.smtpSecurity || acc.smtp_security,
    smtpUsername: acc.smtpUsername || acc.smtp_username,
    oauthProvider: acc.oauthProvider || acc.oauth_provider,
    isActive: acc.isActive ?? acc.is_active ?? true,
    isDefault: acc.isDefault ?? acc.is_default ?? true,
    signature: acc.signature || '',
    syncDays: acc.syncDays || acc.sync_days || 30,
    acceptInvalidCerts: acc.acceptInvalidCerts ?? acc.accept_invalid_certs ?? false,
    createdAt: acc.createdAt || acc.created_at || new Date().toISOString(),
    updatedAt: acc.updatedAt || acc.updated_at || new Date().toISOString(),
  });

  const reloadAccounts = useCallback(async () => {
    try {
      const { listAccounts } = await import('./services/mailService');
      const dbAccounts = await listAccounts();
      if (dbAccounts && dbAccounts.length > 0) {
        const frontendAccounts: Account[] = dbAccounts.map(mapAccount);
        setAccounts(frontendAccounts);
        console.log('Accounts reloaded from DB');
      }
    } catch (err) {
      console.error('Failed to reload accounts:', err);
    }
  }, []);

  // Load accounts from database on startup
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const { listAccounts, connectAccount, listEmails, listFolders } = await import('./services/mailService');
        const dbAccounts = await listAccounts();
        console.log('Loaded accounts from DB:', dbAccounts);

        if (dbAccounts && dbAccounts.length > 0) {
          // Convert database accounts to frontend Account type
          const frontendAccounts: Account[] = dbAccounts.map(mapAccount);

          setAccounts(frontendAccounts);

          // Set selected account to the default one or first one
          const defaultAccount = frontendAccounts.find(a => a.isDefault) || frontendAccounts[0];
          setSelectedAccountId(defaultAccount.id);

          // Connect to first account and load emails
          const firstAccount = defaultAccount;
          try {
            await connectAccount(firstAccount.id.toString());
            console.log('Connected to account:', firstAccount.email);

            // Fetch IMAP folders
            try {
              const folders = await listFolders(firstAccount.id.toString());
              console.log('Fetched IMAP folders:', folders);
              setImapFolders(folders);
            } catch (folderErr) {
              console.error('Failed to fetch folders:', folderErr);
            }

            // Load emails (page is 0-indexed)
            try {
              const result = await listEmails(firstAccount.id.toString(), 0, 500, 'INBOX');
              console.log('listEmails result:', result);
              console.log('Result keys:', result ? Object.keys(result) : 'null');

              if (result && result.emails && result.emails.length > 0) {
                console.log('Raw emails from backend, count:', result.emails.length);
                console.log('First email keys:', Object.keys(result.emails[0]));
                console.log('First email:', JSON.stringify(result.emails[0], null, 2));

                const loadedEmails: Email[] = result.emails.map((e: any, idx: number) => {
                  const emailId = e.uid?.toString() || e.id?.toString() || idx.toString();
                  // Track known emails on initial load
                  knownEmailIds.current.add(emailId);
                  console.log(`Mapping email ${idx}: uid=${e.uid}, subject=${e.subject}`);
                  return {
                    id: emailId,
                    from: { name: e.fromName || e.from || '', email: e.from || '' },
                    to: [{ name: '', email: '' }],
                    subject: e.subject || '(Konu yok)',
                    preview: e.preview || '',
                    body: e.bodyText || e.preview || '',
                    bodyHtml: e.bodyHtml,
                    bodyText: e.bodyText,
                    date: new Date(e.date || Date.now()),
                    read: e.isRead ?? false,
                    starred: e.isStarred ?? false,
                    hasAttachments: e.hasAttachments ?? false,
                    hasImages: false,
                  };
                });
                console.log('Mapped emails count:', loadedEmails.length);
                // Save to cache
                emailCache.current.set(cacheKey(firstAccount.id, 'INBOX'), loadedEmails);
                setEmails(loadedEmails);
                isInitialLoad.current = false;
                console.log('State updated with emails, cached for account:', firstAccount.id);
              } else {
                console.log('No emails in result or result is empty');
                console.log('result:', result);
              }
            } catch (emailErr) {
              console.error('Error loading emails:', emailErr);
              // Show error to user
              const errorMessage = emailErr instanceof Error ? emailErr.message : String(emailErr);
              if (window.confirm(_tApp('appErrors.emailsLoadFailed').replace('{error}', errorMessage))) {
                // Reconnect attempt
                try {
                  await connectAccount(firstAccount.id.toString());
                  // Retry loading emails
                  const retryResult = await listEmails(firstAccount.id.toString(), 0, 500, 'INBOX');
                  if (retryResult && retryResult.emails) {
                    const loadedEmails: Email[] = retryResult.emails.map((e: any, idx: number) => ({
                      id: e.uid?.toString() || e.id?.toString() || idx.toString(),
                      from: { name: e.fromName || e.from || '', email: e.from || '' },
                      to: [{ name: '', email: '' }],
                      subject: e.subject || '(Konu yok)',
                      preview: e.preview || '',
                      body: e.bodyText || e.preview || '',
                      bodyHtml: e.bodyHtml,
                      bodyText: e.bodyText,
                      date: new Date(e.date || Date.now()),
                      read: e.isRead ?? false,
                      starred: e.isStarred ?? false,
                      hasAttachments: e.hasAttachments ?? false,
                      hasImages: false,
                    }));
                    emailCache.current.set(cacheKey(firstAccount.id, 'INBOX'), loadedEmails);
                    setEmails(loadedEmails);
                  }
                } catch (retryErr) {
                  console.error('Reconnect failed:', retryErr);
                  alert(_tApp('appErrors.reconnectFailed'));
                }
              }
            }
          } catch (connectErr) {
            console.error('Failed to connect/load emails:', connectErr);
          }
        }
      } catch (err) {
        console.error('Failed to load accounts:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, []);

  // Request notification permission on startup
  useEffect(() => {
    const initNotifications = async () => {
      try {
        const granted = await requestNotificationPermission();
        setNotificationsEnabled(granted);
        console.log('Notification permission:', granted ? 'granted' : 'denied');
      } catch (err) {
        console.error('Failed to request notification permission:', err);
      }
    };
    initNotifications();
  }, []);

  // Listen for system tray events
  useEffect(() => {
    let unlisten1: (() => void) | null = null;
    let unlisten2: (() => void) | null = null;

    const setupTrayListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        // Listen for "New Email" tray menu click
        unlisten1 = await listen('tray:new-email', () => {
          console.log('Tray: New Email clicked');
          openCompose('new');
        });

        // Listen for "Settings" tray menu click
        unlisten2 = await listen('tray:settings', () => {
          console.log('Tray: Settings clicked');
          setCurrentPage('settings');
        });

        console.log('System tray event listeners initialized');
      } catch (err) {
        console.error('Failed to setup tray listeners:', err);
      }
    };

    setupTrayListeners();

    // Cleanup listeners on unmount
    return () => {
      if (unlisten1) unlisten1();
      if (unlisten2) unlisten2();
    };
  }, []);

  // Check for new emails and show notifications
  const checkForNewEmails = useCallback(async () => {
    if (!selectedAccountId || accounts.length === 0) return;

    try {
      const { listEmails } = await import('./services/mailService');
      const result = await listEmails(selectedAccountId.toString(), 0, 500, 'INBOX');

      if (result && result.emails) {
        const newEmails: Email[] = [];

        result.emails.forEach((e: any) => {
          const emailId = e.uid?.toString() || e.id?.toString();
          if (emailId && !knownEmailIds.current.has(emailId)) {
            // This is a new email
            if (!isInitialLoad.current && notificationsEnabled) {
              const senderName = e.fromName || e.from || 'Bilinmeyen';
              const subject = e.subject || '(Konu yok)';
              showNewEmailNotification(senderName, subject, e.preview);
            }
            knownEmailIds.current.add(emailId);
            newEmails.push({
              id: emailId,
              from: { name: e.fromName || e.from || '', email: e.from || '' },
              to: [{ name: '', email: '' }],
              subject: e.subject || '(Konu yok)',
              preview: e.preview || '',
              body: e.bodyText || '',
              bodyHtml: e.bodyHtml,
              bodyText: e.bodyText,
              date: new Date(e.date || Date.now()),
              read: e.isRead ?? false,
              starred: e.isStarred ?? false,
              hasAttachments: e.hasAttachments ?? false,
              hasImages: false,
            });
          }
        });

        if (newEmails.length > 0 && !isInitialLoad.current) {
          console.log('Found', newEmails.length, 'new emails');
          setEmails(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const uniqueNewEmails = newEmails.filter(e => !existingIds.has(e.id));
            const updatedEmails = [...uniqueNewEmails, ...prev];
            // Update cache
            if (selectedAccountId && typeof selectedAccountId === 'number') {
              emailCache.current.set(cacheKey(selectedAccountId, 'INBOX'), updatedEmails);
            }
            return updatedEmails;
          });
        }

        isInitialLoad.current = false;
      }
    } catch (err) {
      console.error('Error checking for new emails:', err);
    }
  }, [selectedAccountId, accounts, notificationsEnabled]);

  // Poll for new emails based on auto-sync settings
  useEffect(() => {
    if (!selectedAccountId || accounts.length === 0 || !autoSyncEnabled) return;

    // Initialize known email IDs from current emails
    emails.forEach(e => knownEmailIds.current.add(e.id));

    // Convert interval from minutes to milliseconds
    const intervalMs = autoSyncInterval * 60 * 1000;

    const pollInterval = setInterval(() => {
      checkForNewEmails();
    }, intervalMs);

    return () => clearInterval(pollInterval);
  }, [selectedAccountId, accounts, checkForNewEmails, emails, autoSyncEnabled, autoSyncInterval]);

  // Sync emails handler - fetches from IMAP and updates cache
  const handleSync = useCallback(async () => {
    if (isSyncing || accounts.length === 0 || !selectedAccountId) return;
    setIsSyncing(true);
    try {
      const { connectAccount, listEmails } = await import('./services/mailService');
      const account = accounts.find(a => a.id === selectedAccountId) || accounts[0];

      await connectAccount(account.id.toString());

      const folderToSync = activeFolder === '__starred__' ? 'INBOX' : activeFolder;
      const result = await listEmails(account.id.toString(), 0, 500, folderToSync);

      if (result && result.emails) {
        // Preserve already-fetched email bodies from current state
        const existingBodies = new Map<string, { body: string; bodyHtml?: string; bodyText?: string; hasImages: boolean }>();
        emails.forEach(e => {
          if (e.bodyHtml || (e.body && e.body.length > 200)) {
            existingBodies.set(e.id, { body: e.body, bodyHtml: e.bodyHtml, bodyText: e.bodyText, hasImages: e.hasImages });
          }
        });

        let newEmailCount = 0;
        const loadedEmails: Email[] = result.emails.map((e: any) => {
          const emailId = e.uid?.toString() || e.id?.toString();

          if (emailId && !knownEmailIds.current.has(emailId)) {
            newEmailCount++;
            knownEmailIds.current.add(emailId);
            if (newEmailCount === 1 && notificationsEnabled) {
              showNewEmailNotification(e.fromName || e.from || 'Bilinmeyen', e.subject || '(Konu yok)', e.preview);
            } else if (newEmailCount > 1 && notificationsEnabled) {
              playNotificationSound();
            }
          }

          // Merge with existing body data if available
          const existing = existingBodies.get(emailId);

          return {
            id: emailId,
            from: { name: e.fromName || e.from || '', email: e.from || '' },
            to: [{ name: '', email: '' }],
            subject: e.subject || '(Konu yok)',
            preview: e.preview || '',
            body: existing?.body || e.bodyText || '',
            bodyHtml: existing?.bodyHtml || e.bodyHtml,
            bodyText: existing?.bodyText || e.bodyText,
            date: new Date(e.date || Date.now()),
            read: e.isRead ?? false,
            starred: e.isStarred ?? false,
            hasAttachments: e.hasAttachments ?? false,
            hasImages: existing?.hasImages || false,
          };
        });

        // Update cache
        const key = typeof selectedAccountId === 'number'
          ? cacheKey(selectedAccountId, folderToSync)
          : cacheKey('all', folderToSync);
        emailCache.current.set(key, loadedEmails);
        setEmails(loadedEmails);
        console.log('Synced:', loadedEmails.length, 'New:', newEmailCount);
      }
    } catch (err) {
      console.error('Sync failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`Senkronizasyon basarisiz: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  }, [accounts, isSyncing, selectedAccountId, notificationsEnabled, activeFolder, emails]);

  // Handle account change
  const handleAccountChange = useCallback(async (accountId: number | 'all') => {
    if (accountId === selectedAccountId) return;

    setSelectedAccountId(accountId);
    setSelectedEmail(null);
    setActiveFolder('INBOX'); // Reset to inbox when switching accounts

    // Handle "All Accounts" unified inbox
    if (accountId === 'all') {
      // Check unified cache
      const key = cacheKey('all', 'INBOX');
      const cached = emailCache.current.get(key);
      if (cached && cached.length > 0) {
        console.log('Using cached unified inbox:', cached.length);
        setEmails(cached);
        knownEmailIds.current = new Set(cached.map(e => e.id));
        isInitialLoad.current = false;
        setImapFolders([]);
        return;
      }

      setEmails([]);
      knownEmailIds.current = new Set();
      isInitialLoad.current = true;
      setImapFolders([]);

      try {
        setIsSyncing(true);
        const { listAllAccountsEmails } = await import('./services/mailService');

        const result = await listAllAccountsEmails(0, 500, 'INBOX', sortBy);

        if (result && result.emails) {
          const loadedEmails: Email[] = result.emails.map((e: any) => {
            const emailId = e.uid?.toString() || e.id?.toString();
            const uniqueId = e.accountId ? `${e.accountId}-${emailId}` : emailId;
            knownEmailIds.current.add(uniqueId);
            return {
              id: uniqueId,
              from: { name: e.fromName || e.from || '', email: e.from || '' },
              to: [{ name: '', email: '' }],
              subject: e.subject || '(Konu yok)',
              preview: e.preview || '',
              body: e.bodyText || '',
              bodyHtml: e.bodyHtml,
              bodyText: e.bodyText,
              date: new Date(e.date || Date.now()),
              read: e.isRead ?? false,
              starred: e.isStarred ?? false,
              hasAttachments: e.hasAttachments ?? false,
              hasImages: false,
              accountId: e.accountId,
            };
          });

          emailCache.current.set(key, loadedEmails);
          setEmails(loadedEmails);
          setAccountFetchStatuses(result.accountResults || []);
          isInitialLoad.current = false;
        }
      } catch (err) {
        console.error('Failed to load unified inbox:', err);
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    // Single account logic - check cache
    const key = cacheKey(accountId, 'INBOX');
    const cachedEmails = emailCache.current.get(key);
    if (cachedEmails && cachedEmails.length > 0) {
      console.log('Using cached emails for', key, 'count:', cachedEmails.length);
      setEmails(cachedEmails);
      knownEmailIds.current = new Set(cachedEmails.map(e => e.id));
      isInitialLoad.current = false;
      fetchFolders(accountId);
      return;
    }

    // No cache - fetch from server
    setEmails([]);
    knownEmailIds.current = new Set();
    isInitialLoad.current = true;

    try {
      setIsSyncing(true);
      const { connectAccount, listEmails, listFolders } = await import('./services/mailService');

      await connectAccount(accountId.toString());

      try {
        const folders = await listFolders(accountId.toString());
        setImapFolders(folders);
      } catch (folderErr) {
        console.error('Failed to fetch folders:', folderErr);
      }

      const result = await listEmails(accountId.toString(), 0, 500, 'INBOX');

      if (result && result.emails) {
        const loadedEmails: Email[] = result.emails.map((e: any) => {
          const emailId = e.uid?.toString() || e.id?.toString();
          knownEmailIds.current.add(emailId);
          return {
            id: emailId,
            from: { name: e.fromName || e.from || '', email: e.from || '' },
            to: [{ name: '', email: '' }],
            subject: e.subject || '(Konu yok)',
            preview: e.preview || '',
            body: e.bodyText || '',
            bodyHtml: e.bodyHtml,
            bodyText: e.bodyText,
            date: new Date(e.date || Date.now()),
            read: e.isRead ?? false,
            starred: e.isStarred ?? false,
            hasAttachments: e.hasAttachments ?? false,
            hasImages: false,
            accountId: accountId.toString(),
          };
        });
        emailCache.current.set(key, loadedEmails);
        setEmails(loadedEmails);
        isInitialLoad.current = false;
      }
    } catch (err) {
      console.error('Failed to switch account:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [selectedAccountId, fetchFolders, sortBy]);

  // Handle folder change - use cache first, fetch from IMAP only if needed
  const handleFolderChange = useCallback(async (folderPath: string) => {
    console.log('handleFolderChange called with:', folderPath, 'current activeFolder:', activeFolder);

    setActiveFolder(folderPath);
    setSelectedEmail(null);

    // Starred is filtered locally, not a real folder
    if (folderPath === '__starred__') {
      return;
    }

    if (!selectedAccountId || accounts.length === 0) {
      return;
    }

    // Check if this is the Drafts folder
    const isDraftsFolder = imapFolders.find(f => f.path === folderPath)?.folder_type.toLowerCase() === 'drafts' ||
                           folderPath.toLowerCase().includes('draft');

    if (isDraftsFolder) {
      try {
        setIsLoadingDrafts(true);
        const accountToUse = typeof selectedAccountId === 'number' ? selectedAccountId : accounts[0]?.id;
        if (!accountToUse) { setDrafts([]); return; }
        const draftList = await listDrafts(accountToUse);
        setDrafts(draftList);
        setEmails([]);
      } catch (err) {
        console.error('Failed to load drafts:', err);
        setDrafts([]);
      } finally {
        setIsLoadingDrafts(false);
      }
      return;
    }

    // Check cache first
    const accountId = typeof selectedAccountId === 'number' ? selectedAccountId : selectedAccountId;
    const key = cacheKey(accountId, folderPath);
    const cached = emailCache.current.get(key);
    if (cached && cached.length > 0) {
      console.log('Using cached emails for', key, 'count:', cached.length);
      setEmails(cached);
      return;
    }

    // No cache - fetch from IMAP
    try {
      setIsSyncing(true);
      const { listEmails } = await import('./services/mailService');

      const result = await listEmails(selectedAccountId.toString(), 0, 500, folderPath);

      if (result && result.emails) {
        const loadedEmails: Email[] = result.emails.map((e: any) => {
          const emailId = e.uid?.toString() || e.id?.toString();
          return {
            id: emailId,
            from: { name: e.fromName || e.from || '', email: e.from || '' },
            to: [{ name: '', email: '' }],
            subject: e.subject || '(Konu yok)',
            preview: e.preview || '',
            body: e.bodyText || '',
            bodyHtml: e.bodyHtml,
            bodyText: e.bodyText,
            date: new Date(e.date || Date.now()),
            read: e.isRead ?? false,
            starred: e.isStarred ?? false,
            hasAttachments: e.hasAttachments ?? false,
            hasImages: false,
          };
        });
        emailCache.current.set(key, loadedEmails);
        setEmails(loadedEmails);
        console.log('Fetched & cached emails for', key, 'count:', loadedEmails.length);
      } else {
        setEmails([]);
      }
    } catch (err) {
      console.error('Failed to fetch folder:', err);
      setEmails([]);
    } finally {
      setIsSyncing(false);
    }
  }, [selectedAccountId, accounts, imapFolders]);

  // Modal states
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiReplyOpen, setAiReplyOpen] = useState(false);
  const [aiGeneratedReply, setAiGeneratedReply] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('new');
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [draftToEdit, setDraftToEdit] = useState<DraftEmail | null>(null);

  // Undo Send state
  const [pendingSend, setPendingSend] = useState<{ draft: DraftEmail; secondsLeft: number } | null>(null);
  const pendingSendTimerRef = useRef<{ countdown: ReturnType<typeof setInterval>; commit: ReturnType<typeof setTimeout> } | null>(null);

  // Focus Mode (Zen/distraction-free reading)
  const [focusMode, setFocusMode] = useState(false);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => {
    const t = getStoredAccentTheme();
    applyAccentTheme(t);
    return t;
  });
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [, schedForceUpdate] = useState(0);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [taskCreationEmail, setTaskCreationEmail] = useState<{ id: string; subject: string } | null>(null);
  const [taskNote, setTaskNote] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [, taskForceUpdate] = useState(0);
  const [mailPanelCollapsed, setMailPanelCollapsed] = useState(() => localStorage.getItem('owlmail-panel-collapsed') === 'true');
  const [mailPanelWidth, setMailPanelWidth] = useState(() => Math.min(600, Math.max(260, parseInt(localStorage.getItem('owlmail-panel-width') || '380'))));
  const dividerDragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Email states
  // Auto-trust own account emails so signatures/images always show
  const ownEmails = useMemo(() => accounts.map(a => a.email), [accounts]);
  const [trustedSenders, setTrustedSenders] = useState<string[]>([]);
  const [loadedImageEmails, setLoadedImageEmails] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [fetchedEmailIds, setFetchedEmailIds] = useState<Set<string>>(new Set());
  const [phishingResults, setPhishingResults] = useState<Record<string, PhishingAnalysis>>({});
  const [analyzingPhishingId, setAnalyzingPhishingId] = useState<string | null>(null);
  const [phishingWarningCollapsed, setPhishingWarningCollapsed] = useState<Record<string, boolean>>({}); // Track collapsed state per email
  const [trackingResults, setTrackingResults] = useState<Record<string, TrackingAnalysis>>({});

  // Check if user has any accounts configured
  const hasAccounts = accounts.length > 0;

  // Get current account (for Compose signature)
  const currentAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0] || null;

  const currentEmail = emails.find((e) => e.id === selectedEmail) || null;
  const isTrustedSender = currentEmail ? (trustedSenders.includes(currentEmail.from.email) || ownEmails.includes(currentEmail.from.email)) : false;
  const showImages = selectedEmail ? loadedImageEmails.includes(selectedEmail) : false;

  // Fetch full email content when selected
  useEffect(() => {
    if (!selectedEmail || accounts.length === 0 || !selectedAccountId) return;
    if (fetchedEmailIds.has(selectedEmail)) return; // Already fetched

    const fetchEmailContent = async () => {
      try {
        const { getEmail } = await import('./services/mailService');
        const { accountId: resolvedAccountId, uid } = parseEmailId(selectedEmail, selectedAccountId);
        if (isNaN(uid) || !resolvedAccountId) return;

        console.log('Fetching full email content for UID:', uid, 'account:', resolvedAccountId);
        const fullEmail = await getEmail(resolvedAccountId, uid, 'INBOX');
        console.log('Full email fetched:', fullEmail);

        // Mark as fetched
        setFetchedEmailIds(prev => new Set([...prev, selectedEmail]));

        // Check if email has images
        const hasImages = fullEmail.bodyHtml ? /<img[^>]+src=/i.test(fullEmail.bodyHtml) : false;

        // Update the email in state and cache with full content
        setEmails(prev => {
          const updated = prev.map(e => {
            if (e.id === selectedEmail) {
              return {
                ...e,
                body: fullEmail.bodyText || fullEmail.bodyHtml || e.body,
                bodyText: fullEmail.bodyText,
                bodyHtml: fullEmail.bodyHtml,
                hasImages,
              };
            }
            return e;
          });
          // Update cache with body content
          if (typeof selectedAccountId === 'number') {
            const key = cacheKey(selectedAccountId, activeFolder === '__starred__' ? 'INBOX' : activeFolder);
            emailCache.current.set(key, updated);
          }
          return updated;
        });
      } catch (err) {
        console.error('Failed to fetch email content:', err);
      }
    };

    fetchEmailContent();
  }, [selectedEmail, accounts, fetchedEmailIds, selectedAccountId, activeFolder]);

  // Get visible emails for navigation
  const visibleEmails = useMemo(() => {
    // If searching, use backend FTS5 search results
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults;
    }

    // If searching but no results yet (or empty search), continue with normal flow
    if (searchQuery.trim() && searchResults.length === 0 && !isSearching) {
      return []; // Empty results when search is done
    }

    // Otherwise, use regular filtered emails
    let result = emails;
    switch (activeFolder) {
      case "__starred__": result = result.filter(e => e.starred && !e.deleted); break;
      case "__archive__": result = result.filter(e => e.archived && !e.deleted); break;
      case "__trash__": result = result.filter(e => e.deleted); break;
      default: result = result.filter(e => !e.archived && !e.deleted);
    }

    // Apply sorting
    const dir = sortDirection === 'desc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = b.date.getTime() - a.date.getTime();
          break;
        case 'unread':
          if (a.read !== b.read) { cmp = a.read ? 1 : -1; break; }
          cmp = b.date.getTime() - a.date.getTime();
          break;
        case 'account':
          if (a.accountId !== b.accountId) { cmp = (a.accountId || '').localeCompare(b.accountId || ''); break; }
          cmp = b.date.getTime() - a.date.getTime();
          break;
        case 'priority':
        default:
          if (a.read !== b.read) { cmp = a.read ? 1 : -1; break; }
          if (a.starred !== b.starred) { cmp = a.starred ? -1 : 1; break; }
          cmp = b.date.getTime() - a.date.getTime();
          break;
      }
      return cmp * dir;
    });

    return result;
  }, [emails, activeFolder, searchQuery, searchResults, isSearching, sortBy, sortDirection]);

  // Handle search input changes
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);

    // Update search filters with new query
    setSearchFilters(prev => ({ ...prev, query: query.trim() || undefined }));

    // Trigger debounced backend search (only for single account)
    if (selectedAccountId && typeof selectedAccountId === 'number' && query.trim()) {
      debouncedSearch(query, selectedAccountId);
    } else {
      // Clear search results if query is empty
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [selectedAccountId, debouncedSearch]);

  // Auto-analyze phishing when email is selected
  useEffect(() => {
    if (!currentEmail || !currentEmail.id) return;
    // Skip if auto-detection is disabled in settings
    if (!autoPhishingDetection) return;
    // Skip if already analyzed
    if (phishingResults[currentEmail.id]) return;
    // Skip if currently analyzing
    if (analyzingPhishingId === currentEmail.id) return;

    const analyzeEmail = async () => {
      setAnalyzingPhishingId(currentEmail.id);
      try {
        const result = await analyzePhishing(
          {
            from: currentEmail.from,
            subject: currentEmail.subject,
            body: currentEmail.body,
            bodyHtml: currentEmail.bodyHtml,
          },
          'tr',
          geminiApiKey || undefined
        );
        setPhishingResults(prev => ({ ...prev, [currentEmail.id]: result }));
      } catch (err) {
        console.error('Phishing analysis failed:', err);
        // On error, set a default low-risk result
        setPhishingResults(prev => ({
          ...prev,
          [currentEmail.id]: {
            isPhishing: false,
            riskLevel: 'low',
            score: 0,
            reasons: [],
            recommendations: [],
          },
        }));
      } finally {
        setAnalyzingPhishingId(null);
      }
    };

    analyzeEmail();
  }, [currentEmail?.id, currentEmail?.from, currentEmail?.subject, currentEmail?.body, currentEmail?.bodyHtml, phishingResults, analyzingPhishingId, geminiApiKey, autoPhishingDetection]);

  // Auto-detect tracking when email is selected
  useEffect(() => {
    if (!currentEmail || !currentEmail.id) return;
    // Skip if already analyzed
    if (trackingResults[currentEmail.id]) return;
    // Only analyze if email has HTML content
    if (!currentEmail.bodyHtml) return;

    const result = detectEmailTracking(currentEmail.bodyHtml, appLang as 'tr' | 'en');
    setTrackingResults(prev => ({ ...prev, [currentEmail.id]: result }));
  }, [currentEmail?.id, currentEmail?.bodyHtml, trackingResults, appLang]);

  // Email actions
  const handleToggleStar = useCallback(async (emailId?: string) => {
    const targetId = emailId || selectedEmail;
    if (!targetId || !selectedAccountId) return;

    const email = emails.find(e => e.id === targetId);
    if (!email) return;

    const newStarred = !email.starred;

    // Optimistic update
    setEmails(prev => prev.map(e => e.id === targetId ? { ...e, starred: newStarred } : e));

    // Call backend
    try {
      const { markEmailStarred } = await import('./services/mailService');
      const { accountId: resolvedAccountId, uid } = parseEmailId(targetId, selectedAccountId);
      await markEmailStarred(resolvedAccountId, uid, newStarred, activeFolder);
    } catch (err) {
      console.error('Failed to toggle star:', err);
      // Revert on error
      setEmails(prev => prev.map(e => e.id === targetId ? { ...e, starred: !newStarred } : e));
    }
  }, [selectedEmail, selectedAccountId, emails, activeFolder]);

  const handleToggleRead = useCallback(async () => {
    if (!selectedEmail || !selectedAccountId) return;

    const email = emails.find(e => e.id === selectedEmail);
    if (!email) return;

    const newRead = !email.read;

    // Optimistic update
    setEmails(prev => prev.map(e => e.id === selectedEmail ? { ...e, read: newRead } : e));

    // Call backend
    try {
      const { markEmailRead } = await import('./services/mailService');
      const { accountId: resolvedAccountId, uid } = parseEmailId(selectedEmail, selectedAccountId);
      await markEmailRead(resolvedAccountId, uid, newRead, activeFolder);
    } catch (err) {
      console.error('Failed to toggle read:', err);
      // Revert on error
      setEmails(prev => prev.map(e => e.id === selectedEmail ? { ...e, read: !newRead } : e));
    }
  }, [selectedEmail, selectedAccountId, emails, activeFolder]);

  const handleArchive = useCallback(async () => {
    if (!selectedEmail || !selectedAccountId) return;

    // Optimistic update
    setEmails(prev => prev.map(e => e.id === selectedEmail ? { ...e, archived: true } : e));

    // Select next email
    const idx = visibleEmails.findIndex(e => e.id === selectedEmail);
    const nextEmail = idx < visibleEmails.length - 1 ? visibleEmails[idx + 1].id :
                      idx > 0 ? visibleEmails[idx - 1].id : null;
    setSelectedEmail(nextEmail);

    // Call backend
    try {
      const { archiveEmail } = await import('./services/mailService');
      const { accountId: resolvedAccountId, uid } = parseEmailId(selectedEmail, selectedAccountId);
      await archiveEmail(resolvedAccountId, uid);
    } catch (err) {
      console.error('Failed to archive:', err);
      // Revert on error
      setEmails(prev => prev.map(e => e.id === selectedEmail ? { ...e, archived: false } : e));
    }
  }, [selectedEmail, selectedAccountId, visibleEmails]);

  const handleDelete = useCallback(async () => {
    if (!selectedEmail || !selectedAccountId) return;

    // Optimistic update
    setEmails(prev => prev.map(e => e.id === selectedEmail ? { ...e, deleted: true } : e));

    // Select next email
    const idx = visibleEmails.findIndex(e => e.id === selectedEmail);
    const nextEmail = idx < visibleEmails.length - 1 ? visibleEmails[idx + 1].id :
                      idx > 0 ? visibleEmails[idx - 1].id : null;
    setSelectedEmail(nextEmail);

    // Call backend
    try {
      const { deleteEmail } = await import('./services/mailService');
      const { accountId: resolvedAccountId, uid } = parseEmailId(selectedEmail, selectedAccountId);
      await deleteEmail(resolvedAccountId, uid, false, activeFolder);
    } catch (err) {
      console.error('Failed to delete:', err);
      // Revert on error
      setEmails(prev => prev.map(e => e.id === selectedEmail ? { ...e, deleted: false } : e));
    }
  }, [selectedEmail, selectedAccountId, visibleEmails, activeFolder]);

  // ─── Bulk Actions ────────────────────────────────────────────────────────────

  const handleBulkToggle = useCallback((emailId: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId); else next.add(emailId);
      return next;
    });
  }, []);

  const handleBulkSelectAll = useCallback((emailIds: string[]) => {
    setSelectedEmails(new Set(emailIds));
  }, []);

  const handleBulkClear = useCallback(() => {
    setSelectedEmails(new Set());
  }, []);

  type BulkAction = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'delete';

  const handleBulkAction = useCallback(async (action: BulkAction) => {
    if (selectedEmails.size === 0 || !selectedAccountId) return;
    const ids = Array.from(selectedEmails);

    // Optimistic update
    setEmails(prev => prev.map(e => {
      if (!selectedEmails.has(e.id)) return e;
      switch (action) {
        case 'read':    return { ...e, read: true };
        case 'unread':  return { ...e, read: false };
        case 'star':    return { ...e, starred: true };
        case 'unstar':  return { ...e, starred: false };
        case 'archive': return { ...e, archived: true };
        case 'delete':  return { ...e, deleted: true };
        default: return e;
      }
    }));

    setSelectedEmails(new Set());

    // Backend — fire all in parallel
    try {
      const { markEmailRead, markEmailStarred, archiveEmail, deleteEmail } = await import('./services/mailService');
      await Promise.allSettled(ids.map(emailId => {
        const { accountId: acctId, uid } = parseEmailId(emailId, selectedAccountId);
        switch (action) {
          case 'read':    return markEmailRead(acctId, uid, true, activeFolder);
          case 'unread':  return markEmailRead(acctId, uid, false, activeFolder);
          case 'star':    return markEmailStarred(acctId, uid, true, activeFolder);
          case 'unstar':  return markEmailStarred(acctId, uid, false, activeFolder);
          case 'archive': return archiveEmail(acctId, uid);
          case 'delete':  return deleteEmail(acctId, uid, false, activeFolder);
        }
      }));
    } catch (err) {
      console.error('Bulk action error:', err);
    }
  }, [selectedEmails, selectedAccountId, activeFolder]);

  const handleLoadImages = () => {
    if (selectedEmail && !loadedImageEmails.includes(selectedEmail)) {
      setLoadedImageEmails([...loadedImageEmails, selectedEmail]);
    }
  };

  const handleTrustSender = (senderEmail: string) => {
    if (!trustedSenders.includes(senderEmail)) {
      setTrustedSenders([...trustedSenders, senderEmail]);
    }
  };

  // Compose handlers
  const openCompose = useCallback((mode: ComposeMode) => {
    setComposeMode(mode);
    setComposeOpen(true);
  }, []);

  // Handle opening a draft for editing
  const handleOpenDraft = useCallback(async (draftId: number) => {
    try {
      const draftDetail = await getDraft(draftId);

      // Convert DraftDetail to DraftEmail
      const toAddresses = JSON.parse(draftDetail.toAddresses || '[]') as EmailAddress[];
      const ccAddresses = JSON.parse(draftDetail.ccAddresses || '[]') as EmailAddress[];
      const bccAddresses = JSON.parse(draftDetail.bccAddresses || '[]') as EmailAddress[];

      // Open compose with draft data
      setComposeMode(draftDetail.composeType as ComposeMode);
      setComposeOpen(true);

      // The Compose component will receive this draft via its props
      // We need to pass this data somehow - let's store it in a state
      setDraftToEdit({
        id: draftDetail.id,
        accountId: draftDetail.accountId,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject: draftDetail.subject,
        bodyText: draftDetail.bodyText,
        bodyHtml: draftDetail.bodyHtml,
        attachments: draftDetail.attachments.map((att, idx) => ({
          id: idx,
          index: idx,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          localPath: att.localPath,
          isInline: false,
        })),
        replyToEmailId: draftDetail.replyToEmailId,
        forwardEmailId: draftDetail.forwardEmailId,
        composeType: draftDetail.composeType as 'new' | 'reply' | 'replyAll' | 'forward',
      });
    } catch (err) {
      console.error('Failed to open draft:', err);
    }
  }, []);

  // Handle email selection (including drafts)
  const handleEmailSelect = useCallback((emailId: string) => {
    // Check if this is a draft
    if (emailId.startsWith('draft-')) {
      const draftId = parseInt(emailId.replace('draft-', ''));
      handleOpenDraft(draftId);
    } else {
      setSelectedEmail(emailId);
    }
  }, [handleOpenDraft]);

  // Handle draft deletion
  const handleDeleteDraft = useCallback(async (draftId: number) => {
    try {
      await deleteDraft(draftId);
      // Remove from drafts list
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      console.log('Draft deleted:', draftId);
    } catch (err) {
      console.error('Failed to delete draft:', err);
    }
  }, []);

  const executeSend = async (draft: DraftEmail) => {
    try {
      const { sendEmail } = await import('./services/mailService');
      const accountId = typeof selectedAccountId === 'number' ? selectedAccountId : draft.accountId;
      if (!accountId || typeof accountId !== 'number') {
        throw new Error(_tApp('appErrors.selectAccountToSend'));
      }
      await sendEmail({ ...draft, accountId });
      playNotificationSound();
    } catch (err) {
      console.error("Failed to send email:", err);
      throw err;
    }
  };

  // Check and send any scheduled emails that are due
  const checkScheduledEmails = useCallback(() => {
    const now = Date.now();
    const due = getScheduled().filter(s => s.sendAt <= now);
    if (due.length === 0) return;
    due.forEach(s => {
      executeSend(s.draft);
      removeScheduled(s.id);
    });
    if (due.length > 0) schedForceUpdate(n => n + 1);
  }, []);

  useEffect(() => {
    checkScheduledEmails();
    const interval = setInterval(checkScheduledEmails, 60000);
    return () => clearInterval(interval);
  }, [checkScheduledEmails]);

  const handleSend = async (draft: DraftEmail) => {
    // Clear any existing pending send
    if (pendingSendTimerRef.current) {
      clearInterval(pendingSendTimerRef.current.countdown);
      clearTimeout(pendingSendTimerRef.current.commit);
    }

    const DELAY = 5;
    setPendingSend({ draft, secondsLeft: DELAY });

    const countdown = setInterval(() => {
      setPendingSend(prev => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) { clearInterval(countdown); return null; }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    const commit = setTimeout(() => {
      setPendingSend(null);
      executeSend(draft);
    }, DELAY * 1000);

    pendingSendTimerRef.current = { countdown, commit };
  };

  const handleUndoSend = () => {
    if (pendingSendTimerRef.current) {
      clearInterval(pendingSendTimerRef.current.countdown);
      clearTimeout(pendingSendTimerRef.current.commit);
      pendingSendTimerRef.current = null;
    }
    setPendingSend(null);
  };

  const handleSaveDraft = async (draft: DraftEmail) => {
    try {
      await saveDraft(draft, []);
      console.log("Draft saved successfully");
    } catch (err) {
      console.error("Failed to save draft:", err);
    }
  };

  // Download attachment
  const handleDownloadAttachment = async (attachmentIndex: number, filename: string) => {
    if (!currentEmail || !selectedAccountId) return;

    try {
      const { downloadAttachment } = await import('./services/mailService');
      console.log('Downloading attachment:', { attachmentIndex, filename, folder: activeFolder });

      // Call backend to download attachment
      const { accountId: resolvedAccountId, uid } = parseEmailId(currentEmail.id, selectedAccountId);
      const result = await downloadAttachment(
        resolvedAccountId,
        activeFolder,
        uid,
        attachmentIndex
      );

      // Convert base64 to blob
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.contentType });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('✓ Attachment downloaded:', result.filename);
    } catch (err) {
      console.error('Failed to download attachment:', err);
      alert(_tApp('appErrors.attachmentDownloadError').replace('{error}', String(err)));
    }
  };

  // Summarize
  const handleSummarize = useCallback(async () => {
    if (!currentEmail || summarizingId) return;
    if (!geminiApiKey) {
      console.error("Gemini API key not set. Please configure it in Settings > AI.");
      alert(_tApp('appErrors.geminiApiKeyNotSet'));
      return;
    }
    setSummarizingId(currentEmail.id);
    try {
      // Auto-detect language from email content
      const summary = await summarizeEmail(currentEmail.body, undefined, geminiApiKey);
      setSummaries(prev => ({ ...prev, [currentEmail.id]: summary }));
    } catch (err) {
      console.error("Summarize failed:", err);
    } finally {
      setSummarizingId(null);
    }
  }, [currentEmail, summarizingId, geminiApiKey]);

  // Command handler
  const handleCommand = useCallback((cmd: string) => {
    switch (cmd) {
      case "compose": openCompose('new'); break;
      case "reply": if (currentEmail) openCompose('reply'); break;
      case "replyAll": if (currentEmail) openCompose('replyAll'); break;
      case "forward": if (currentEmail) openCompose('forward'); break;
      case "archive": handleArchive(); break;
      case "delete": handleDelete(); break;
      case "star": handleToggleStar(); break;
      case "markUnread": handleToggleRead(); break;
      case "aiReply": if (currentEmail) setAiReplyOpen(true); break;
      case "shortcuts": setShortcutsHelpOpen(true); break;
      case "search": document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus(); break;
    }
  }, [currentEmail, openCompose, handleArchive, handleDelete, handleToggleStar, handleToggleRead]);

  // Navigation
  const navigateEmail = useCallback((direction: 'next' | 'prev') => {
    if (visibleEmails.length === 0) return;
    const currentIdx = visibleEmails.findIndex(e => e.id === selectedEmail);
    if (direction === 'next' && currentIdx < visibleEmails.length - 1) {
      setSelectedEmail(visibleEmails[currentIdx + 1].id);
    } else if (direction === 'prev' && currentIdx > 0) {
      setSelectedEmail(visibleEmails[currentIdx - 1].id);
    } else if (currentIdx === -1 && visibleEmails.length > 0) {
      setSelectedEmail(visibleEmails[0].id);
    }
  }, [selectedEmail, visibleEmails]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea/contentEditable (TipTap editor)
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }

      // Ignore if any modal is open (except Escape)
      const modalOpen = commandPaletteOpen || aiReplyOpen || composeOpen || shortcutsHelpOpen;

      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        setAiReplyOpen(false);
        setComposeOpen(false);
        setShortcutsHelpOpen(false);
        return;
      }

      if (modalOpen) return;

      // Command palette (Ctrl+K / Cmd+K)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Let system shortcuts through (Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X, Ctrl+Z, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Single key shortcuts (no modifier)
      switch (e.key.toLowerCase()) {
        case "j": navigateEmail('next'); break;
        case "k": navigateEmail('prev'); break;
        case "c": e.preventDefault(); openCompose('new'); break;
        case "r": if (currentEmail) openCompose('reply'); break;
        case "a": if (currentEmail) openCompose('replyAll'); break;
        case "f": if (currentEmail) openCompose('forward'); break;
        case "g": if (currentEmail) setAiReplyOpen(true); break;
        case "v": if (currentEmail) window.dispatchEvent(new CustomEvent('owlmail:reading-mode')); break;
        case "e": handleArchive(); break;
        case "s": handleToggleStar(); break;
        case "u": handleToggleRead(); break;
        case "/": e.preventDefault(); document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus(); break;
        case "?": setShortcutsHelpOpen(true); break;
        case "#": handleDelete(); break;
        case "escape":
          if (focusMode) { setFocusMode(false); e.preventDefault(); }
          else if (selectedEmails.size > 0) { handleBulkClear(); e.preventDefault(); }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, aiReplyOpen, composeOpen, shortcutsHelpOpen, currentEmail, navigateEmail, openCompose, handleArchive, handleDelete, handleToggleStar, handleToggleRead, selectedEmails, handleBulkClear, focusMode]);

  // Dynamic tab title — unread count
  useEffect(() => {
    const unread = emails.filter(e => !e.read && !e.deleted && !e.archived).length;
    document.title = unread > 0 ? `(${unread}) OwlMail` : 'OwlMail';
  }, [emails]);

  // Mark as read when selected (with backend call)
  useEffect(() => {
    if (selectedEmail && selectedAccountId) {
      const email = emails.find(e => e.id === selectedEmail);
      if (email && !email.read) {
        const emailIdToMark = selectedEmail;
        const delayMs = (autoMarkReadDelay ?? 2) * 1000;
        const timeoutId = setTimeout(async () => {
          // Optimistic update
          setEmails(prev => prev.map(e => e.id === emailIdToMark ? { ...e, read: true } : e));

          // Call backend
          try {
            const { markEmailRead } = await import('./services/mailService');
            const { accountId: resolvedAccountId, uid } = parseEmailId(emailIdToMark, selectedAccountId);
            await markEmailRead(resolvedAccountId, uid, true, activeFolder);
          } catch (err) {
            console.error('Failed to mark as read:', err);
            // Revert optimistic update on failure
            setEmails(prev => prev.map(e => e.id === emailIdToMark ? { ...e, read: false } : e));
          }
        }, delayMs);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [selectedEmail, selectedAccountId, activeFolder, autoMarkReadDelay]);

  // Handle account added
  const handleAccountAdded = async (account: Account) => {
    setAccounts(prev => [...prev, account]);
    setAddAccountModalOpen(false);

    // Automatically select the newly added account
    setSelectedAccountId(account.id);
    setActiveFolder('INBOX'); // Reset to inbox for new account

    // Connect and load emails for the new account
    try {
      const { connectAccount, listEmails } = await import('./services/mailService');
      await connectAccount(account.id.toString());
      console.log('Connected to new account:', account.email);

      // Load emails (page is 0-indexed)
      const result = await listEmails(account.id.toString(), 0, 500, 'INBOX');
      console.log('listEmails result after add:', result);
      if (result && result.emails) {
        console.log('Raw emails from backend:', result.emails);
        const loadedEmails: Email[] = result.emails.map((e: any) => ({
          id: e.uid?.toString() || e.id?.toString(),
          from: { name: e.fromName || e.from || '', email: e.from || '' },
          to: [{ name: '', email: '' }],
          subject: e.subject || '(Konu yok)',
          preview: e.preview || '',
          body: e.bodyText || '',
          bodyHtml: e.bodyHtml,
          bodyText: e.bodyText,
          date: new Date(e.date || Date.now()),
          read: e.isRead ?? false,
          starred: e.isStarred ?? false,
          hasAttachments: e.hasAttachments ?? false,
          hasImages: false,
          accountId: account.id.toString(), // Add accountId for unique keys
        }));
        setEmails(loadedEmails);
        console.log('Mapped emails after add:', loadedEmails.length, loadedEmails);
      }
    } catch (err) {
      console.error('Failed to connect/load emails after account add:', err);
    }
  };

  // Show Welcome screen if no accounts
  if (!hasAccounts && currentPage !== 'settings') {
    return (
      <>
        <Welcome
          onAddAccount={() => setAddAccountModalOpen(true)}
          onOpenSettings={() => setCurrentPage('settings')}
        />
        <AddAccountModal
          isOpen={addAccountModalOpen}
          onClose={() => setAddAccountModalOpen(false)}
          onAccountAdded={handleAccountAdded}
        />
      </>
    );
  }

  // Show Settings page
  if (currentPage === 'settings') {
    return <Settings onBack={() => { reloadAccounts(); setCurrentPage('mail'); }} />;
  }

  // Show Filters page
  if (currentPage === 'filters') {
    return <Filters onBack={() => setCurrentPage('mail')} defaultAccountId={typeof selectedAccountId === 'number' ? selectedAccountId : undefined} />;
  }

  // ============================================================================
  // Mobile Layout
  // ============================================================================
  if (mobile) {
    // Apply same filtering as MailPanel for mobile
    const mobileFilteredEmails = (() => {
      let result = emails;
      if (activeFolder === '__starred__') {
        result = result.filter(e => e.starred && !e.deleted);
      } else {
        const isTrash = activeFolder.toLowerCase().includes('trash') || activeFolder.toLowerCase().includes('deleted');
        if (!isTrash) result = result.filter(e => !e.deleted);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(e =>
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.from.email.toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q)
        );
      }
      return result;
    })();
    const unreadCount = emails.filter(e => !e.read).length;

    return (
      <MobileLayout>
        {/* Drawer */}
        <MobileDrawer
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onAccountChange={handleAccountChange}
          imapFolders={imapFolders}
          activeFolder={activeFolder}
          onFolderChange={handleFolderChange}
          onSettingsClick={() => setCurrentPage('settings')}
          onFiltersClick={() => setCurrentPage('filters')}
        />

        {/* Screen content */}
        <div className="flex-1 overflow-hidden">
          {mobileNav.currentScreen.type === 'emailList' && (
            <MobileEmailList
              emails={mobileFilteredEmails}
              onSelect={handleEmailSelect}
              onSync={handleSync}
              isSyncing={isSyncing}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onToggleStar={handleToggleStar}
              onToggleRead={(id) => {
                setEmails(prev => prev.map(e => e.id === id ? { ...e, read: !e.read } : e));
              }}
              onDelete={(id) => {
                setSelectedEmail(id);
                handleDelete();
              }}
              onArchive={(id) => {
                setSelectedEmail(id);
                handleArchive();
              }}
              activeFolder={activeFolder}
              showSearch={mobileNav.activeTab === 'search'}
            />
          )}

          {mobileNav.currentScreen.type === 'emailDetail' && (
            <MobileEmailView
              email={currentEmail}
              accountId={selectedAccountId?.toString() || null}
              folder={activeFolder}
              showImages={showImages}
              isTrustedSender={isTrustedSender}
              onLoadImages={handleLoadImages}
              onTrustSender={handleTrustSender}
              onReply={() => openCompose('reply')}
              onReplyAll={() => openCompose('replyAll')}
              onForward={() => openCompose('forward')}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onToggleStar={handleToggleStar}
              onToggleRead={handleToggleRead}
              onDownloadAttachment={handleDownloadAttachment}
              summary={selectedEmail ? summaries[selectedEmail] || null : null}
              onSummarize={handleSummarize}
              isSummarizing={summarizingId === selectedEmail}
              selectedAccountId={selectedAccountId}
              accounts={accounts}
            />
          )}
        </div>

        {/* Bottom navigation (hidden when viewing email detail) */}
        {mobileNav.currentScreen.type !== 'emailDetail' && (
          <MobileBottomNav
            onComposeClick={() => openCompose('new')}
            onSettingsClick={() => setCurrentPage('settings')}
            unreadCount={unreadCount}
          />
        )}

        {/* Shared Modals */}
        {currentEmail && (
          <>
            <AIReplyModal
              isOpen={aiReplyOpen}
              onClose={() => setAiReplyOpen(false)}
              onUseReply={(reply) => {
                setAiGeneratedReply(reply);
                setAiReplyOpen(false);
                openCompose('reply');
              }}
              emailContent={currentEmail.body}
              emailSubject={currentEmail.subject}
              senderName={currentEmail.from.name}
              apiKey={geminiApiKey}
            />
            <Compose
              isOpen={composeOpen}
              onClose={() => { setComposeOpen(false); setAiGeneratedReply(null); }}
              mode={composeMode}
              initialBody={aiGeneratedReply || undefined}
              originalEmail={{
                id: parseInt(currentEmail.id),
                accountId: 1,
                folderId: 1,
                messageId: currentEmail.id,
                uid: parseInt(currentEmail.id),
                from: currentEmail.from,
                to: currentEmail.to,
                cc: [],
                bcc: [],
                subject: currentEmail.subject,
                preview: currentEmail.preview,
                bodyText: currentEmail.bodyText || currentEmail.body,
                bodyHtml: currentEmail.bodyHtml,
                date: currentEmail.date.toISOString(),
                isRead: currentEmail.read,
                isStarred: currentEmail.starred,
                isDeleted: false,
                isSpam: false,
                isDraft: false,
                isAnswered: false,
                isForwarded: false,
                hasAttachments: currentEmail.hasAttachments,
                hasInlineImages: currentEmail.hasImages,
                priority: 3,
                labels: [],
              }}
              onSend={handleSend}
              onSchedule={(draft, sendAt) => { addScheduled(draft, sendAt); schedForceUpdate(n => n + 1); }}
              onSaveDraft={handleSaveDraft}
              defaultAccount={currentAccount}
            />
          </>
        )}

        {!currentEmail && composeMode === 'new' && (
          <Compose
            isOpen={composeOpen}
            onClose={() => {
              setComposeOpen(false);
              setDraftToEdit(null);
            }}
            mode="new"
            draft={draftToEdit || undefined}
            onSend={handleSend}
            onSaveDraft={handleSaveDraft}
            defaultAccount={currentAccount}
          />
        )}
      </MobileLayout>
    );
  }

  // ── Panel resize drag handlers ───────────────────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dividerDragRef.current = { startX: e.clientX, startW: mailPanelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dividerDragRef.current) return;
      const delta = ev.clientX - dividerDragRef.current.startX;
      const newW = Math.min(600, Math.max(260, dividerDragRef.current.startW + delta));
      setMailPanelWidth(newW);
      localStorage.setItem('owlmail-panel-width', String(newW));
    };
    const onUp = () => {
      dividerDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [mailPanelWidth]);

  // ============================================================================
  // Desktop Layout
  // ============================================================================
  return (
    <div className="h-screen flex bg-owl-bg" style={{background: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.04) 0%, transparent 60%), rgb(var(--owl-bg))'}}>
      {!focusMode && <MailPanel
        emails={emails}
        selectedId={selectedEmail}
        onSelect={handleEmailSelect}
        activeFolder={activeFolder}
        onFolderChange={handleFolderChange}
        onSettingsClick={() => setCurrentPage('settings')}
        onFiltersClick={() => setCurrentPage('filters')}
        onComposeClick={() => openCompose('new')}
        onSyncClick={handleSync}
        onOsintClick={() => {}}
        isSyncing={isSyncing}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        searchFilters={searchFilters}
        onSearchFiltersChange={setSearchFilters}
        onAdvancedSearch={handleAdvancedSearch}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onAccountChange={handleAccountChange}
        imapFolders={imapFolders}
        isLoadingFolders={isLoadingFolders}
        onToggleStar={handleToggleStar}
        onDeleteDraft={handleDeleteDraft}
        drafts={drafts}
        isLoadingDrafts={isLoadingDrafts}
        isSearching={isSearching}
        searchResultsCount={searchResults.length}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
        onEmailContextMenu={(e, email) => {
          contextMenu.show(e, [
            { id: 'reply', label: 'Reply', shortcut: 'R', icon: <Icons.Reply />, onClick: () => { handleEmailSelect(email.id); openCompose('reply'); } },
            { id: 'replyAll', label: 'Reply All', shortcut: 'A', icon: <Icons.ReplyAll />, onClick: () => { handleEmailSelect(email.id); openCompose('replyAll'); } },
            { id: 'forward', label: 'Forward', shortcut: 'F', icon: <Icons.Forward />, onClick: () => { handleEmailSelect(email.id); openCompose('forward'); } },
            { id: 'div1', label: '', divider: true, onClick: () => {} },
            { id: 'star', label: email.starred ? 'Unstar' : 'Star', shortcut: 'S', icon: <Icons.Star />, onClick: () => handleToggleStar(email.id) },
            { id: 'read', label: email.read ? 'Mark Unread' : 'Mark Read', shortcut: 'U', icon: <Icons.MailOpen />, onClick: () => { handleEmailSelect(email.id); setTimeout(handleToggleRead, 50); } },
            { id: 'div2', label: '', divider: true, onClick: () => {} },
            { id: 'archive', label: 'Archive', shortcut: 'E', icon: <Icons.Archive />, onClick: () => { handleEmailSelect(email.id); handleArchive(); } },
            { id: 'delete', label: 'Delete', shortcut: '#', icon: <Icons.Trash />, danger: true, onClick: () => { handleEmailSelect(email.id); handleDelete(); } },
          ]);
        }}
        selectedEmails={selectedEmails}
        onBulkToggle={handleBulkToggle}
        onBulkSelectAll={handleBulkSelectAll}
        onBulkClear={handleBulkClear}
        onBulkAction={handleBulkAction}
        conversationView={appSettings.conversationView ?? false}
        compactView={appSettings.compactListView ?? false}
        collapsed={mailPanelCollapsed}
        onToggleCollapse={() => setMailPanelCollapsed(c => { const n = !c; localStorage.setItem('owlmail-panel-collapsed', String(n)); return n; })}
        panelWidth={mailPanelCollapsed ? 52 : mailPanelWidth}
        currentTheme={(appSettings.theme as 'dark' | 'light') || 'dark'}
        onThemeToggle={() => {
          const next: 'dark' | 'light' = (appSettings.theme === 'light') ? 'dark' : 'light';
          const updated = { ...appSettings, theme: next };
          setAppSettings(updated);
          const saved = JSON.parse(localStorage.getItem('owlivion-settings') || '{}');
          localStorage.setItem('owlivion-settings', JSON.stringify({ ...saved, theme: next }));
          document.documentElement.setAttribute('data-theme', next);
        }}
        onMarkAllRead={() => {
          setEmails(prev => prev.map(e => ({ ...e, read: true })));
        }}
      />}
      {/* Draggable divider */}
      {!focusMode && !mailPanelCollapsed && (
        <div
          onMouseDown={handleDividerMouseDown}
          className="w-1 shrink-0 cursor-col-resize hover:bg-owl-accent/30 active:bg-owl-accent/50 transition-colors group relative z-10"
          title="Sürükle — yeniden boyutlandır"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}
      <EmailView
        email={currentEmail}
        accountId={selectedAccountId?.toString() || null}
        folder={activeFolder}
        showImages={showImages}
        isTrustedSender={isTrustedSender}
        onLoadImages={handleLoadImages}
        onTrustSender={handleTrustSender}
        onAIReply={() => setAiReplyOpen(true)}
        onReply={() => openCompose('reply')}
        onReplyAll={() => openCompose('replyAll')}
        onForward={() => openCompose('forward')}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onToggleStar={handleToggleStar}
        onToggleRead={handleToggleRead}
        summary={selectedEmail ? summaries[selectedEmail] || null : null}
        onSummarize={handleSummarize}
        isSummarizing={summarizingId === selectedEmail}
        phishingAnalysis={selectedEmail ? phishingResults[selectedEmail] || null : null}
        isAnalyzingPhishing={analyzingPhishingId === selectedEmail}
        phishingWarningCollapsed={selectedEmail ? (phishingWarningCollapsed[selectedEmail] ?? true) : true}
        onTogglePhishingCollapse={() => {
          if (selectedEmail) {
            setPhishingWarningCollapsed(prev => ({
              ...prev,
              [selectedEmail]: !prev[selectedEmail]
            }));
          }
        }}
        trackingAnalysis={selectedEmail ? trackingResults[selectedEmail] || null : null}
        onDownloadAttachment={handleDownloadAttachment}
        selectedAccountId={selectedAccountId}
        accounts={accounts}
        appSettings={appSettings}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode(f => !f)}
        onReplyWithText={(text) => {
          setAiGeneratedReply(text);
          openCompose('reply');
        }}
        onFilterBySender={(senderEmail) => {
          handleSearchChange(senderEmail);
        }}
        senderEmailCount={currentEmail ? emails.filter(e => e.from.email === currentEmail.from.email).length : 0}
        onCreateTask={(emailId, subject) => { setTaskCreationEmail({ id: emailId, subject }); setTaskNote(''); setTaskDueDate(''); setShowTaskPanel(true); }}
      />

      {/* Modals */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onCommand={handleCommand}
      />

      {currentEmail && (
        <>
          <AIReplyModal
            isOpen={aiReplyOpen}
            onClose={() => setAiReplyOpen(false)}
            onUseReply={(reply) => {
              setAiGeneratedReply(reply);
              setAiReplyOpen(false);
              openCompose('reply');
            }}
            emailContent={currentEmail.body}
            emailSubject={currentEmail.subject}
            senderName={currentEmail.from.name}
            apiKey={geminiApiKey}
          />

          <Compose
            isOpen={composeOpen}
            onClose={() => { setComposeOpen(false); setAiGeneratedReply(null); }}
            mode={composeMode}
            initialBody={aiGeneratedReply || undefined}
            originalEmail={{
              id: parseEmailId(currentEmail.id, selectedAccountId).uid,
              accountId: parseInt(parseEmailId(currentEmail.id, selectedAccountId).accountId) || 1,
              folderId: 1,
              messageId: currentEmail.id,
              uid: parseEmailId(currentEmail.id, selectedAccountId).uid,
              from: currentEmail.from,
              to: currentEmail.to,
              cc: [],
              bcc: [],
              subject: currentEmail.subject,
              preview: currentEmail.preview,
              bodyText: currentEmail.bodyText || currentEmail.body,
              bodyHtml: currentEmail.bodyHtml,
              date: currentEmail.date.toISOString(),
              isRead: currentEmail.read,
              isStarred: currentEmail.starred,
              isDeleted: false,
              isSpam: false,
              isDraft: false,
              isAnswered: false,
              isForwarded: false,
              hasAttachments: currentEmail.hasAttachments,
              hasInlineImages: currentEmail.hasImages,
              priority: 3,
              labels: [],
            }}
            onSend={handleSend}
            onSaveDraft={handleSaveDraft}
            defaultAccount={currentAccount}
          />
        </>
      )}

      {/* Compose for new email (no original) */}
      {!currentEmail && composeMode === 'new' && (
        <Compose
          isOpen={composeOpen}
          onClose={() => {
            setComposeOpen(false);
            setDraftToEdit(null);
          }}
          mode="new"
          draft={draftToEdit || undefined}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          defaultAccount={currentAccount}
        />
      )}

      <ShortcutsHelp isOpen={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />


      {/* Context Menu (right-click) */}
      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.hide} />

      {/* Undo Send Toast */}
      {/* Task Creation Modal */}
      {showTaskPanel && taskCreationEmail && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTaskPanel(false)} />
          <div className="relative w-full max-w-sm mx-4 bg-owl-surface rounded-2xl border border-owl-border/60 shadow-owl-lg p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                </div>
                <span className="font-semibold text-owl-text text-sm">Görev Oluştur</span>
              </div>
              <button onClick={() => setShowTaskPanel(false)} className="action-btn text-owl-text-secondary/40 hover:text-owl-text-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="text-[12px] text-owl-text-secondary/60 mb-3 truncate">
              📧 {taskCreationEmail.subject}
            </div>
            <textarea
              autoFocus
              value={taskNote}
              onChange={(e) => setTaskNote(e.target.value)}
              placeholder="Görev notu (isteğe bağlı)..."
              className="w-full h-20 bg-owl-bg text-owl-text text-sm rounded-lg px-3 py-2 border border-owl-border/60 focus:border-owl-accent/50 focus:outline-none resize-none placeholder:text-owl-text-secondary/40 mb-3"
            />
            <div className="flex items-center gap-2 mb-4">
              <label className="text-[12px] text-owl-text-secondary/60 shrink-0">Son tarih:</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="flex-1 bg-owl-bg text-owl-text text-sm rounded-lg px-3 py-1.5 border border-owl-border/60 focus:border-owl-accent/50 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTaskPanel(false)} className="flex-1 py-2 rounded-xl border border-owl-border/60 text-sm text-owl-text-secondary hover:bg-owl-surface-2 transition-colors">
                İptal
              </button>
              <button
                onClick={() => {
                  createTask(taskCreationEmail.id, taskCreationEmail.subject, taskNote, taskDueDate ? new Date(taskDueDate).getTime() : undefined);
                  setShowTaskPanel(false);
                  taskForceUpdate(n => n + 1);
                }}
                className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition-colors"
              >
                Görev Oluştur
              </button>
            </div>
            {/* Existing tasks for this email */}
            {getTasks().filter(t => t.emailId === taskCreationEmail.id).length > 0 && (
              <div className="mt-4 pt-4 border-t border-owl-border/40">
                <div className="text-[11px] text-owl-text-secondary/50 font-semibold uppercase tracking-wider mb-2">Bu email için görevler</div>
                {getTasks().filter(t => t.emailId === taskCreationEmail.id).map(task => (
                  <div key={task.id} className="flex items-start gap-2 py-1.5">
                    <button onClick={() => { toggleTaskComplete(task.id); taskForceUpdate(n => n + 1); }}
                      className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-owl-border/60 hover:border-emerald-400'}`}>
                      {task.completed && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                    </button>
                    <span className={`text-xs flex-1 ${task.completed ? 'line-through text-owl-text-secondary/40' : 'text-owl-text/80'}`}>
                      {task.note || task.subject}
                    </span>
                    <button onClick={() => { deleteTask(task.id); taskForceUpdate(n => n + 1); }}
                      className="text-owl-text-secondary/30 hover:text-red-400 transition-colors shrink-0">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accent Theme Picker */}
      <div className="fixed bottom-5 right-5 z-[150]">
        {showThemePicker && (
          <>
            <div className="fixed inset-0" onClick={() => setShowThemePicker(false)} />
            <div className="absolute bottom-10 right-0 dropdown-panel p-2.5 animate-scale-in min-w-[140px]">
              <div className="text-[10px] uppercase tracking-wider text-owl-text-secondary/60 font-semibold mb-2 px-1">Tema Rengi</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.entries(ACCENT_THEMES) as [AccentTheme, typeof ACCENT_THEMES[AccentTheme]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => { applyAccentTheme(key); setAccentTheme(key); setShowThemePicker(false); }}
                    title={cfg.name}
                    className={`w-8 h-8 rounded-lg transition-all hover:scale-110 flex items-center justify-center ${accentTheme === key ? 'ring-2 ring-offset-2 ring-offset-owl-surface ring-white/50 scale-105' : ''}`}
                    style={{ background: cfg.hex }}
                  >
                    {accentTheme === key && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <button
          onClick={() => setShowThemePicker(p => !p)}
          title="Tema rengi"
          className="w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{ background: ACCENT_THEMES[accentTheme].hex }}
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
          </svg>
        </button>
      </div>

      {pendingSend && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-slide-up">
          <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-owl-surface border border-owl-border/80 shadow-owl-lg backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-owl-accent shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
              <span className="text-sm text-owl-text">Email gönderiliyor…</span>
              <span className="text-sm font-mono font-bold text-owl-accent tabular-nums w-4 text-center">{pendingSend.secondsLeft}</span>
            </div>
            <div className="w-px h-4 bg-owl-border/60" />
            <button
              onClick={handleUndoSend}
              className="text-sm font-semibold text-owl-accent hover:text-owl-accent-hover transition-colors"
            >
              Geri Al
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AppWithProviders() {
  return (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}

export default AppWithProviders;

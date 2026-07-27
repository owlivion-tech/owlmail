// ============================================================================
// EmailView — Progressive Disclosure Design
// Apple-inspired clarity + OwlMail identity
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from '../i18n';
import owlivionIcon from '../assets/owlivion-logo.svg';
import type { EmailAddress, Account, Settings as SettingsType } from '../types';
import { HOME_AI_URL, HOME_AI_DEFAULT_MODEL } from '../config/homeServer';
import type { PhishingAnalysis, TrackingAnalysis } from '../services/geminiService';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EmailAttachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
}

export interface EmailViewEmail {
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
  accountId?: string;
  attachments?: EmailAttachment[];
  archived?: boolean;
  deleted?: boolean;
  isDraft?: boolean;
}

export interface EmailViewProps {
  email: EmailViewEmail | null;
  accountId: string | null;
  folder: string;
  showImages: boolean;
  isTrustedSender: boolean;
  onLoadImages: () => void;
  onTrustSender: (email: string) => void;
  onAIReply: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onToggleRead: () => void;
  summary: string | null;
  onSummarize: () => void;
  isSummarizing: boolean;
  phishingAnalysis: PhishingAnalysis | null;
  isAnalyzingPhishing: boolean;
  phishingWarningCollapsed: boolean;
  onTogglePhishingCollapse: () => void;
  trackingAnalysis: TrackingAnalysis | null;
  onDownloadAttachment: (attachmentIndex: number, filename: string) => void;
  selectedAccountId: number | null | 'all';
  accounts: Account[];
  appSettings: SettingsType;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  onReplyWithText?: (text: string) => void;
  onFilterBySender?: (senderEmail: string) => void;
  senderEmailCount?: number;
  onCreateTask?: (emailId: string, subject: string) => void;
}

// ─── DOMPurify Config ───────────────────────────────────────────────────────

const purifyConfig = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'style', 'meta'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border', 'charset'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcset', 'data-src'],
  RETURN_TRUSTED_TYPE: false,
};

function sanitizeEmailHtml(html: string, blockImages: boolean = true, imageHiddenText: string = '[Image hidden]'): string {
  let processed = html;
  if (blockImages) {
    processed = processed.replace(/<img[^>]*>/gi, `<div class="blocked-image">${imageHiddenText}</div>`);
  }
  const config = blockImages ? purifyConfig : {
    ...purifyConfig,
    ALLOWED_TAGS: [...purifyConfig.ALLOWED_TAGS, 'img'],
    ALLOWED_ATTR: [...purifyConfig.ALLOWED_ATTR, 'src', 'alt', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcset', 'data-src'],
  };
  let sanitized = DOMPurify.sanitize(processed, config) as string;
  // Force external links to open in new tab
  sanitized = sanitized.replace(/<a\s+([^>]*href=)/gi, '<a target="_blank" rel="noopener noreferrer" $1');
  // Convert img width/height attributes to inline styles (CSS can't read HTML attributes reliably)
  sanitized = sanitized.replace(/<img([^>]*)\bwidth=["'](\d+)["']([^>]*)>/gi, (match, before, w, after) => {
    const hasStyle = /style=/i.test(before + after);
    if (hasStyle) {
      // Append max-width to existing style
      return match.replace(/style=["']([^"']*)["']/i, `style="$1; max-width:${w}px; width:${w}px;"`);
    }
    return `<img${before} width="${w}"${after} style="max-width:${w}px; width:${w}px;">`;
  });
  return sanitized;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getEmailDomain(email: string): string {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function getAccountColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

function formatFileSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getFileIcon(contentType: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼';
  if (contentType === 'application/pdf' || ext === 'pdf') return '📄';
  if (['doc', 'docx', 'odt'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '🎵';
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return '🎬';
  return '📎';
}

// ─── Inline Icons ───────────────────────────────────────────────────────────

const Icon = {
  Lock: ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Shield: ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Eye: ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Image: ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Check: ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Warning: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Sparkles: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  Star: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  StarFilled: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  Reply: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  ReplyAll: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6M7 10h10a8 8 0 018 8v2M7 10l6 6m-6-6l6-6" />
    </svg>
  ),
  Forward: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
    </svg>
  ),
  Archive: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  Trash: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Summarize: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Download: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Mail: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  MailOpen: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
    </svg>
  ),
  MailUnread: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      <circle cx="18" cy="5" r="3" fill="currentColor" />
    </svg>
  ),
  ChevronDown: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronUp: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ),
  Spinner: ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function SenderAvatar({ email, name, size = 'lg' }: { email: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [logoError, setLogoError] = useState(false);
  const domain = getEmailDomain(email);
  const isOwlMail = domain === 'owlivion.com' || domain === 'owlcrypt.com';
  const personalDomains = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'yandex.com', 'mail.ru'];
  const isPersonal = personalDomains.includes(domain);

  const logoUrl = isOwlMail ? owlivionIcon : (!isPersonal && domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);

  const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-11 h-11 text-base' };

  if (logoUrl && !logoError) {
    return (
      <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center shrink-0 ${isOwlMail ? 'bg-owl-accent/10 p-1.5' : 'bg-owl-surface p-1'} border border-owl-border/50`}>
        <img src={logoUrl} alt={name} className={`w-full h-full object-contain ${isOwlMail ? '' : 'rounded-full'}`} onError={() => setLogoError(true)} />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium shrink-0 bg-owl-accent/10 text-owl-accent`}>
      {getInitials(name)}
    </div>
  );
}

function AccountBadge({ accountEmail, accountName: _name, size = 'sm' }: { accountEmail: string; accountName?: string; size?: 'xs' | 'sm' }) {
  const color = getAccountColor(accountEmail);
  const displayText = accountEmail.split('@')[1]?.split('.')[0] || accountEmail.split('@')[0];
  const sizeClasses = { xs: 'text-[10px] px-2 py-0.5 gap-1', sm: 'text-xs px-2.5 py-1 gap-1.5' };

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses[size]}`}
      style={{
        background: `${color}15`,
        color: color,
        boxShadow: `0 0 0 1px ${color}20 inset`
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate max-w-[80px]">{displayText}</span>
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function EmailView({
  email,
  accountId,
  folder,
  showImages,
  isTrustedSender,
  onLoadImages,
  onTrustSender,
  onAIReply,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onToggleStar,
  onToggleRead,
  summary,
  onSummarize,
  isSummarizing,
  phishingAnalysis,
  isAnalyzingPhishing,
  phishingWarningCollapsed,
  onTogglePhishingCollapse,
  trackingAnalysis,
  onDownloadAttachment,
  selectedAccountId,
  accounts,
  appSettings: _appSettings,
  focusMode,
  onToggleFocusMode,
  onReplyWithText,
  onFilterBySender,
  senderEmailCount,
  onCreateTask,
}: EmailViewProps) {
  const { t, lang } = useTranslation();
  const [showSummary, setShowSummary] = useState(true);
  const [processedHtml, setProcessedHtml] = useState<string | null>(null);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reading Mode
  const [readingMode, setReadingMode] = useState(false);
  const [readingFontSize, setReadingFontSize] = useState(17);

  // AI Smart Replies
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isGeneratingSmartReplies, setIsGeneratingSmartReplies] = useState(false);

  // Email Translation
  const [translatedBody, setTranslatedBody] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Email Font Size (global, persisted)
  const [emailFontSize, setEmailFontSize] = useState(() =>
    parseInt(localStorage.getItem('owlmail-email-font-size') || '14')
  );
  const changeEmailFontSize = useCallback((delta: number) => {
    setEmailFontSize(prev => {
      const next = Math.min(22, Math.max(11, prev + delta));
      localStorage.setItem('owlmail-email-font-size', String(next));
      return next;
    });
  }, []);

  // Copy email address
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Text Selection Popup
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const [selectionCopied, setSelectionCopied] = useState(false);

  const handleBodyMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';
    if (text.length < 2 || text.length > 600) { setSelectionPopup(null); return; }
    const range = sel?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (rect) setSelectionPopup({ x: rect.left + rect.width / 2, y: rect.top, text });
  }, []);

  // Close selection popup on click outside
  useEffect(() => {
    const handler = () => {
      if (!window.getSelection()?.toString().trim()) setSelectionPopup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Link hover bar
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  // Reading Progress Bar
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleBodyScroll = useCallback(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const pct = scrollHeight <= clientHeight ? 100 : Math.min(100, (scrollTop / (scrollHeight - clientHeight)) * 100);
    setScrollProgress(pct);
  }, []);

  // Close popover on click outside
  useEffect(() => {
    if (!activePopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePopover]);

  // Reading mode: Escape to close + V shortcut via custom event
  useEffect(() => {
    const escHandler = (e: KeyboardEvent) => { if (readingMode && e.key === 'Escape') setReadingMode(false); };
    const openHandler = () => { if (email) setReadingMode(true); };
    window.addEventListener('keydown', escHandler);
    window.addEventListener('owlmail:reading-mode', openHandler);
    return () => {
      window.removeEventListener('keydown', escHandler);
      window.removeEventListener('owlmail:reading-mode', openHandler);
    };
  }, [readingMode, email]);

  // Reset per-email state when email changes
  useEffect(() => {
    setSmartReplies([]);
    setScrollProgress(0);
    setTranslatedBody(null);
    if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0;
  }, [email?.id]);

  const handleTranslate = useCallback(async () => {
    if (!email) return;
    setIsTranslating(true);
    try {
      const rawText = (email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || email.preview || '').slice(0, 2000);
      const resp = await fetch(`${HOME_AI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HOME_AI_DEFAULT_MODEL,
          messages: [
            { role: 'system', content: 'Bu emaili Türkçeye çevir. Sadece çeviriyi yaz, başka açıklama ekleme. Formatı koru.' },
            { role: 'user', content: rawText },
          ],
          max_tokens: 1000,
        }),
      });
      const data = await resp.json();
      setTranslatedBody(data.choices?.[0]?.message?.content || null);
    } catch {
      setTranslatedBody(null);
    } finally {
      setIsTranslating(false);
    }
  }, [email]);

  // AI Smart Reply generation
  const handleGenerateSmartReplies = useCallback(async () => {
    if (!email) return;
    setIsGeneratingSmartReplies(true);
    try {
      const resp = await fetch(`${HOME_AI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HOME_AI_DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: 'Bu emaile 3 farklı kısa Türkçe yanıt öner. Yanıtları sadece "|||" ile birbirinden ayır. Her yanıt 1-2 cümle, doğal ve profesyonel olsun. Başka hiçbir şey yazma.',
            },
            {
              role: 'user',
              content: `Konu: ${email.subject}\nGönderen: ${email.from.name}\nİçerik: ${(email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '').slice(0, 800)}`,
            },
          ],
          max_tokens: 300,
        }),
      });
      const data = await resp.json();
      const content: string = data.choices?.[0]?.message?.content || '';
      const replies = content.split('|||').map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
      setSmartReplies(replies.length > 0 ? replies : []);
    } catch {
      setSmartReplies([]);
    } finally {
      setIsGeneratingSmartReplies(false);
    }
  }, [email]);

  // Process CID inline images
  useEffect(() => {
    if (!email?.bodyHtml || !email?.attachments || !accountId) {
      setProcessedHtml(null);
      return;
    }
    const processCidImages = async () => {
      let html = email.bodyHtml!;
      const cidRegex = /src=["']cid:([^"']+)["']/gi;
      const matches = Array.from(html.matchAll(cidRegex));
      if (matches.length === 0) { setProcessedHtml(html); return; }

      const { downloadAttachment } = await import('../services/mailService');
      for (const match of matches) {
        const fullMatch = match[0];
        const cid = match[1];
        const attachment = email.attachments?.find(att => {
          if (!att.contentId) return false;
          return att.contentId.replace(/^<|>$/g, '') === cid;
        });
        if (attachment && email.id) {
          try {
            const data = await downloadAttachment(accountId, folder, parseInt(email.id), attachment.index);
            html = html.replace(fullMatch, `src="data:${data.contentType};base64,${data.data}"`);
          } catch { /* skip failed inline images */ }
        }
      }
      setProcessedHtml(html);
    };
    processCidImages();
  }, [email?.bodyHtml, email?.attachments, email?.id, accountId, folder]);

  // ── Empty state ──
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-owl-bg">
        <div className="text-center">
          <div className="w-16 h-16 bg-owl-surface rounded-2xl flex items-center justify-center mx-auto mb-4 text-owl-text-secondary">
            <Icon.Mail className="w-7 h-7" />
          </div>
          <p className="text-owl-text-secondary">{t('app.selectEmailToRead')}</p>
          <p className="text-sm text-owl-text-secondary/60 mt-2">
            <kbd className="px-1.5 py-0.5 bg-owl-surface rounded text-xs">?</kbd> for shortcuts
          </p>
        </div>
      </div>
    );
  }

  // ── Computed values ──
  const shouldShowImages = showImages || isTrustedSender;
  const hasHtmlContent = !!email.bodyHtml;
  const htmlToSanitize = processedHtml || email.bodyHtml;
  const sanitizedHtml = hasHtmlContent && htmlToSanitize
    ? sanitizeEmailHtml(htmlToSanitize, !shouldShowImages, t('app.imageHidden'))
    : null;

  const trackerCount = (trackingAnalysis?.trackingPixels?.length || 0) + (trackingAnalysis?.trackingLinks?.length || 0);
  const isPhishingDangerous = phishingAnalysis && phishingAnalysis.score >= 60;

  const readingTime = (() => {
    const text = email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 200));
    return mins;
  })();

  // Detect date/event mentions in email body
  const detectedEvent = (() => {
    if (!email) return null;
    const text = (email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '').slice(0, 2000);
    const patterns = [
      /\b(tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi,
      /\b(yarın|önümüzdeki\s+(?:pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar))\b/gi,
      /\b(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})\b/g,
      /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/gi,
    ];
    for (const p of patterns) {
      const m = p.exec(text);
      if (m) return m[0];
    }
    return null;
  })();

  // Detect unsubscribe link in email body/headers
  const unsubscribeUrl = (() => {
    // Check List-Unsubscribe header first (most reliable)
    const bodyText = email.bodyText || '';
    const bodyHtml = email.bodyHtml || '';

    // Common unsubscribe link patterns in HTML
    const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*(?:unsubscribe|aboneliği iptal|abonelik iptal|opt.?out|opt out|remove me|liste den çık|listeden çık)[^<]*<\/a>/gi;
    const match = linkPattern.exec(bodyHtml);
    if (match?.[1]) {
      try { return new URL(match[1]).href; } catch { return null; }
    }

    // Plain text pattern
    const textPattern = /(?:unsubscribe|aboneliği iptal et)(?:\s+here)?[:\s]+\s*(https?:\/\/[^\s>]+)/gi;
    const textMatch = textPattern.exec(bodyText);
    if (textMatch?.[1]) {
      try { return new URL(textMatch[1]).href; } catch { return null; }
    }

    return null;
  })();

  const quickReplies = (() => {
    const body = (email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '').toLowerCase();
    const isTr = lang === 'tr';
    const hasQuestion = body.includes('?');
    const isMeeting = body.includes('meeting') || body.includes('toplantı') || body.includes('görüşme') || body.includes('call');
    const isUrgent = body.includes('urgent') || body.includes('acil') || body.includes('asap');
    const isRequest = body.includes('please') || body.includes('lütfen') || body.includes('could you') || body.includes('can you');

    if (isTr) {
      if (isMeeting) return ['Uygun, görüşürüz!', 'Maalesef uygun değilim.', 'Başka bir zaman olur mu?'];
      if (isUrgent) return ['Hemen bakıyorum!', 'Anlıyorum, şimdi ilgileniyorum.', 'Biraz zaman lazım, geri döneceğim.'];
      if (hasQuestion) return ['Evet, kesinlikle.', 'Hayır, uygun değil.', 'Daha fazla bilgi alabilir miyim?'];
      if (isRequest) return ['Tabii ki, yapabilirim.', 'Bakıp size döneceğim.', 'Maalesef şu an mümkün değil.'];
      return ['Teşekkürler!', 'Anladım, haberdar olacağım.', 'Tamam, not ettim.'];
    } else {
      if (isMeeting) return ["Works for me, see you then!", "Sorry, I can't make it.", "Could we reschedule?"];
      if (isUrgent) return ["On it right now!", "Got it, I'll prioritize this.", "I need a bit more time."];
      if (hasQuestion) return ["Yes, absolutely!", "No, that won't work.", "Can you give me more details?"];
      if (isRequest) return ["Sure, I can do that.", "Let me check and get back to you.", "Sorry, not possible right now."];
      return ["Thanks!", "Got it, noted.", "Sounds good!"];
    }
  })();

  const accountForBadge = (() => {
    if (selectedAccountId !== 'all' || !email.accountId) return null;
    return accounts.find(a => a.id.toString() === email.accountId) || null;
  })();

  const phishingColor = phishingAnalysis?.riskLevel === 'critical' ? 'red' :
    phishingAnalysis?.riskLevel === 'high' ? 'orange' : 'yellow';

  const nonInlineAttachments = email.attachments?.filter(a => !a.isInline) || [];

  return (
    <div className="flex-1 flex flex-col bg-owl-bg relative">
      {/* Reading Progress Bar */}
      {scrollProgress > 0 && scrollProgress < 100 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-20 bg-owl-border/20 pointer-events-none">
          <div
            className="h-full bg-owl-accent transition-all duration-100"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      )}
      {/* ─── HEADER ─── */}
      <div className="px-6 pt-5 pb-3">
        {/* Subject + Actions */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-[22px] font-semibold text-owl-text leading-snug tracking-tight flex-1">
            {email.subject}
          </h1>
          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
            <button
              onClick={onToggleStar}
              className={`p-1.5 rounded-lg transition-all ${email.starred ? 'text-yellow-500 hover:text-yellow-400' : 'text-owl-text-secondary/40 hover:text-owl-text-secondary'}`}
              title={email.starred ? t('emailView.unstarAction') : t('emailView.starAction')}
            >
              {email.starred ? <Icon.StarFilled className="w-5 h-5" /> : <Icon.Star />}
            </button>
            <button
              onClick={onToggleRead}
              className="p-1.5 text-owl-text-secondary/40 hover:text-owl-text-secondary rounded-lg transition-all"
              title={email.read ? t('emailView.markUnread') : t('emailView.markRead')}
            >
              {email.read ? <Icon.MailUnread /> : <Icon.MailOpen />}
            </button>
            {onToggleFocusMode && (
              <button
                onClick={onToggleFocusMode}
                className={`p-1.5 rounded-lg transition-all ${focusMode ? 'text-owl-accent bg-owl-accent/10' : 'text-owl-text-secondary/40 hover:text-owl-text-secondary'}`}
                title={focusMode ? 'Odak modundan çık (Esc)' : 'Odak modu — tüm ekran'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {focusMode ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"/>
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Sender row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Sender avatar — click for contact card */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'sender' ? null : 'sender')}
                className="rounded-full ring-2 ring-transparent hover:ring-owl-accent/40 transition-all"
              >
                <SenderAvatar email={email.from.email} name={email.from.name} />
              </button>
              {activePopover === 'sender' && (
                <div className="absolute left-0 top-full mt-2 w-64 dropdown-panel z-50 p-3 animate-scale-in">
                  <div className="flex items-center gap-3 mb-3">
                    <SenderAvatar email={email.from.email} name={email.from.name} size="lg" />
                    <div className="min-w-0">
                      <p className="font-semibold text-owl-text text-sm truncate">{email.from.name || email.from.email}</p>
                      <p className="text-xs text-owl-text-secondary/70 truncate">{email.from.email}</p>
                      {senderEmailCount !== undefined && senderEmailCount > 0 && (
                        <p className="text-[11px] text-owl-accent mt-0.5">{senderEmailCount} email bu kutuda</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setActivePopover(null); onFilterBySender?.(email.from.email); }}
                      className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-owl-surface-2 text-owl-text hover:bg-owl-border transition-colors"
                    >
                      Tüm emailleri gör
                    </button>
                    <button
                      onClick={() => { setActivePopover(null); }}
                      className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-owl-accent text-white hover:bg-owl-accent-hover transition-colors"
                    >
                      Yanıtla
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-owl-text">{email.from.name}</span>
                {isTrustedSender && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    <Icon.Shield className="w-2.5 h-2.5" />
                    {t('emailView.trusted')}
                  </span>
                )}
                {accountForBadge && (
                  <AccountBadge accountEmail={accountForBadge.email} accountName={accountForBadge.displayName} size="xs" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] text-owl-text-secondary/70 truncate">
                  {email.from.email}
                  <span className="mx-1.5 text-owl-text-secondary/30">→</span>
                  {email.to.map(r => r.name || r.email).join(', ')}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(email.from.email).then(() => {
                      setCopiedEmail(true);
                      setTimeout(() => setCopiedEmail(false), 2000);
                    });
                  }}
                  className="shrink-0 text-owl-text-secondary/30 hover:text-owl-accent transition-colors"
                  title={copiedEmail ? 'Kopyalandı!' : 'Email adresini kopyala'}
                >
                  {copiedEmail ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[13px] text-owl-text-secondary/60 tabular-nums">
              {email.date.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
            <span className="text-[11px] text-owl-text-secondary/40 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              ~{readingTime} dk
            </span>
            {/* Font size controls */}
            <div className="flex items-center gap-0.5 bg-owl-surface-2/60 rounded-lg px-1 py-0.5">
              <button onClick={() => changeEmailFontSize(-1)} className="text-[10px] font-bold text-owl-text-secondary/50 hover:text-owl-text-secondary px-1 transition-colors" title="Yazıyı küçült">A-</button>
              <span className="text-[9px] text-owl-text-secondary/30 tabular-nums">{emailFontSize}</span>
              <button onClick={() => changeEmailFontSize(1)} className="text-[11px] font-bold text-owl-text-secondary/50 hover:text-owl-text-secondary px-1 transition-colors" title="Yazıyı büyüt">A+</button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECURITY INDICATOR BAR ─── */}
      <div className="px-6 py-2 border-y border-owl-border/30" ref={popoverRef}>
        <div className="flex items-center gap-1.5 flex-wrap relative">
          {/* Encryption — always shown */}
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full bg-emerald-500/10 text-emerald-500 select-none">
            <Icon.Lock className="w-3 h-3" />
            {t('emailView.encrypted')}
          </span>

          {/* Tracker shield */}
          {trackingAnalysis?.hasTracking ? (
            <button
              onClick={() => setActivePopover(activePopover === 'tracking' ? null : 'tracking')}
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full transition-all ${
                activePopover === 'tracking'
                  ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40'
                  : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/15'
              }`}
            >
              <Icon.Eye className="w-3 h-3" />
              {trackerCount} {t('emailView.trackersBlocked')}
            </button>
          ) : trackingAnalysis ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full bg-emerald-500/10 text-emerald-500 select-none">
              <Icon.Shield className="w-3 h-3" />
              {t('emailView.noTrackers')}
            </span>
          ) : null}

          {/* Image control */}
          {email.hasImages && !shouldShowImages && (
            <button
              onClick={() => setActivePopover(activePopover === 'images' ? null : 'images')}
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full transition-all ${
                activePopover === 'images'
                  ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
              }`}
            >
              <Icon.Image className="w-3 h-3" />
              {t('emailView.imagesBlockedPill')}
            </button>
          )}

          {/* Phishing status */}
          {isAnalyzingPhishing && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full bg-owl-surface-2 text-owl-text-secondary select-none">
              <Icon.Spinner className="w-3 h-3" />
              {t('emailView.securityAnalyzing')}
            </span>
          )}
          {phishingAnalysis && !isPhishingDangerous && !isAnalyzingPhishing && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full bg-emerald-500/10 text-emerald-500 select-none">
              <Icon.Check className="w-3 h-3" />
              {t('emailView.safe')}
            </span>
          )}

          {/* Unsubscribe button */}
          {unsubscribeUrl && (
            <a
              href={unsubscribeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors select-none"
              title="Bu bültenin aboneliğini iptal et"
              onClick={(e) => { if (!window.confirm('Bu bültenin aboneliğini iptal etmek istiyor musunuz?')) e.preventDefault(); }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
              Aboneliği İptal Et
            </a>
          )}

          {/* AI Summary toggle */}
          {(summary || isSummarizing) && (
            <button
              onClick={() => !isSummarizing && setShowSummary(!showSummary)}
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full transition-all ml-auto ${
                showSummary && summary
                  ? 'bg-owl-accent/20 text-owl-accent ring-1 ring-owl-accent/30'
                  : 'bg-owl-accent/10 text-owl-accent hover:bg-owl-accent/15'
              }`}
            >
              {isSummarizing ? <Icon.Spinner className="w-3 h-3" /> : <Icon.Sparkles className="w-3 h-3" />}
              {isSummarizing ? t('emailView.summarizing') : t('emailView.aiSummary')}
            </button>
          )}
        </div>

        {/* ── Popovers ── */}

        {/* Tracking details popover */}
        {activePopover === 'tracking' && trackingAnalysis && (
          <div className="mt-2 p-4 bg-owl-surface border border-owl-border/50 rounded-xl shadow-lg">
            <p className="text-sm font-medium text-owl-text mb-2">{t('emailView.trackingTitle')}</p>
            <p className="text-xs text-owl-text-secondary mb-3">
              {trackingAnalysis.trackingPixels.length > 0 && `${trackingAnalysis.trackingPixels.length} ${t('phishing.trackingPixels')}`}
              {trackingAnalysis.trackingPixels.length > 0 && trackingAnalysis.trackingLinks.length > 0 && ' · '}
              {trackingAnalysis.trackingLinks.length > 0 && `${trackingAnalysis.trackingLinks.length} ${t('phishing.trackingLinks')}`}
            </p>
            {trackingAnalysis.trackingServices.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {trackingAnalysis.trackingServices.map((service, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded-full">{service}</span>
                ))}
              </div>
            )}
            {!shouldShowImages && trackingAnalysis.trackingPixels.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg">
                <Icon.Shield className="w-3.5 h-3.5" />
                {t('emailView.imagesHiddenNoTracking')}
              </div>
            )}
          </div>
        )}

        {/* Image control popover */}
        {activePopover === 'images' && (
          <div className="mt-2 p-4 bg-owl-surface border border-owl-border/50 rounded-xl shadow-lg">
            <p className="text-sm font-medium text-owl-text mb-1">{t('emailView.imagesBlocked')}</p>
            <p className="text-xs text-owl-text-secondary mb-3">{t('emailView.imagesBlockedDesc')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { onLoadImages(); setActivePopover(null); }}
                className="text-xs font-medium px-3 py-1.5 bg-owl-accent hover:bg-owl-accent-hover text-white rounded-lg transition-colors"
              >
                {t('emailView.showImages')}
              </button>
              <button
                onClick={() => { onTrustSender(email.from.email); setActivePopover(null); }}
                className="text-xs font-medium px-3 py-1.5 bg-owl-surface-2 hover:bg-owl-border text-owl-text rounded-lg transition-colors"
              >
                {t('emailView.alwaysShow')}
              </button>
            </div>
          </div>
        )}

        {/* AI Summary inline panel */}
        {showSummary && summary && (
          <div className="mt-2 p-3.5 bg-owl-accent/5 border border-owl-accent/10 rounded-xl">
            <p className="text-[13px] text-owl-text leading-relaxed">{summary}</p>
          </div>
        )}
      </div>

      {/* ─── PHISHING ALERT BANNER — only for score >= 60 ─── */}
      {isPhishingDangerous && phishingAnalysis && (
        <div className={`mx-6 mt-3 rounded-xl border transition-all ${
          phishingColor === 'red' ? 'bg-red-500/8 border-red-500/25' :
          phishingColor === 'orange' ? 'bg-orange-500/8 border-orange-500/25' :
          'bg-yellow-500/8 border-yellow-500/25'
        }`}>
          {phishingWarningCollapsed ? (
            <button onClick={onTogglePhishingCollapse} className="w-full px-4 py-3 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <Icon.Warning className={`w-5 h-5 ${
                  phishingColor === 'red' ? 'text-red-400' :
                  phishingColor === 'orange' ? 'text-orange-400' : 'text-yellow-400'
                }`} />
                <span className={`text-sm font-medium ${
                  phishingColor === 'red' ? 'text-red-400' :
                  phishingColor === 'orange' ? 'text-orange-400' : 'text-yellow-400'
                }`}>
                  {phishingAnalysis.riskLevel === 'critical' ? t('phishing.criticalRisk') :
                   phishingAnalysis.riskLevel === 'high' ? t('phishing.highRisk') : t('phishing.mediumRisk')}
                  <span className="font-normal text-owl-text-secondary ml-2">{phishingAnalysis.score}/100</span>
                </span>
              </div>
              <Icon.ChevronDown className="w-4 h-4 text-owl-text-secondary/40 group-hover:text-owl-text-secondary transition-colors" />
            </button>
          ) : (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Icon.Warning className={`w-5 h-5 ${
                    phishingColor === 'red' ? 'text-red-400' :
                    phishingColor === 'orange' ? 'text-orange-400' : 'text-yellow-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    phishingColor === 'red' ? 'text-red-400' :
                    phishingColor === 'orange' ? 'text-orange-400' : 'text-yellow-400'
                  }`}>
                    {phishingAnalysis.riskLevel === 'critical' ? t('phishing.criticalPhishing') :
                     phishingAnalysis.riskLevel === 'high' ? t('phishing.highPhishing') : t('phishing.mediumPhishingRisk')}
                    <span className="font-normal text-owl-text-secondary ml-2">{phishingAnalysis.score}/100</span>
                  </span>
                </div>
                <button onClick={onTogglePhishingCollapse} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
                  <Icon.ChevronUp className="w-4 h-4 text-owl-text-secondary/60" />
                </button>
              </div>
              {phishingAnalysis.reasons.length > 0 && (
                <ul className="text-xs text-owl-text/80 space-y-0.5 ml-8 mb-2">
                  {phishingAnalysis.reasons.slice(0, 3).map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 w-1 h-1 rounded-full bg-current opacity-40 flex-shrink-0" />
                      {reason}
                    </li>
                  ))}
                  {phishingAnalysis.reasons.length > 3 && (
                    <li className="text-owl-text-secondary/50">+{phishingAnalysis.reasons.length - 3} more</li>
                  )}
                </ul>
              )}
              {phishingAnalysis.recommendations.length > 0 && (
                <div className="ml-8 pt-2 border-t border-owl-border/20">
                  <ul className="text-xs text-owl-text/70 space-y-0.5">
                    {phishingAnalysis.recommendations.slice(0, 2).map((rec, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-owl-accent mt-0.5 flex-shrink-0">→</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── EMAIL BODY ─── */}
      <div
        ref={bodyScrollRef}
        onScroll={handleBodyScroll}
        onMouseUp={handleBodyMouseUp}
        onMouseOver={(e) => {
          const a = (e.target as HTMLElement).closest('a');
          setHoveredLink(a?.href || null);
        }}
        onMouseOut={() => setHoveredLink(null)}
        className="flex-1 overflow-y-auto px-6 pt-4 pb-6"
        style={{ fontSize: emailFontSize }}
      >
        {hasHtmlContent ? (
          <div
            className="email-content text-owl-text leading-relaxed text-[15px]"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml! }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-owl-text leading-relaxed text-[15px]">
            {email.body}
          </div>
        )}

        {/* Attachments */}
        {nonInlineAttachments.length > 0 && (
          <div className="mt-8 pt-5 border-t border-owl-border/30">
            <p className="text-[11px] font-semibold text-owl-text-secondary/50 uppercase tracking-widest mb-3">
              {t('emailView.attachments')} ({nonInlineAttachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {nonInlineAttachments.map((att) => (
                <button
                  key={att.index}
                  onClick={() => onDownloadAttachment(att.index, att.filename)}
                  className="group flex items-center gap-2.5 px-3 py-2 bg-owl-surface/60 hover:bg-owl-surface border border-owl-border/40 hover:border-owl-accent/40 rounded-xl transition-all"
                  title={`${t('emailView.download')} ${att.filename}`}
                >
                  <span className="text-lg leading-none">{getFileIcon(att.contentType, att.filename)}</span>
                  <div className="text-left min-w-0">
                    <p className="text-[13px] font-medium text-owl-text truncate max-w-[180px] group-hover:text-owl-accent transition-colors">
                      {att.filename}
                    </p>
                    <p className="text-[11px] text-owl-text-secondary/50">{formatFileSize(att.size)}</p>
                  </div>
                  <Icon.Download className="w-3.5 h-3.5 text-owl-text-secondary/30 group-hover:text-owl-accent transition-colors ml-1" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── ACTION BAR ─── */}
      <div className="px-6 py-3 border-t border-owl-border/30">
        <div className="flex items-center gap-1.5">
          {/* Primary: AI Reply */}
          <button
            onClick={onAIReply}
            className="flex items-center gap-2 px-4 py-2 bg-owl-accent hover:bg-owl-accent-hover text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg hover:shadow-owl-accent/20"
          >
            <Icon.Sparkles className="w-4 h-4" />
            AI Reply
            <kbd className="text-[10px] bg-white/20 px-1 py-0.5 rounded">G</kbd>
          </button>

          {/* Secondary: Reply */}
          <button
            onClick={onReply}
            className="flex items-center gap-2 px-3.5 py-2 bg-owl-surface hover:bg-owl-surface-2 text-owl-text rounded-xl text-sm transition-colors"
          >
            <Icon.Reply />
            {t('emailView.reply')}
            <kbd className="text-[10px] text-owl-text-secondary bg-owl-bg px-1 py-0.5 rounded">R</kbd>
          </button>

          {/* Icon-only: Reply All, Forward */}
          <button onClick={onReplyAll} className="p-2 text-owl-text-secondary/60 hover:text-owl-text hover:bg-owl-surface rounded-xl transition-all" title={`${t('emailView.replyAll')} (A)`}>
            <Icon.ReplyAll />
          </button>
          <button onClick={onForward} className="p-2 text-owl-text-secondary/60 hover:text-owl-text hover:bg-owl-surface rounded-xl transition-all" title={`${t('emailView.forward')} (F)`}>
            <Icon.Forward />
          </button>

          <div className="flex-1" />

          {/* Summarize */}
          {email.body.length > 500 && !summary && (
            <button
              onClick={onSummarize}
              disabled={isSummarizing}
              className="flex items-center gap-1.5 px-3 py-2 text-owl-accent hover:bg-owl-accent/10 rounded-xl text-sm transition-colors disabled:opacity-50"
              title={t('emailView.summarizeWithAI')}
            >
              {isSummarizing ? <Icon.Spinner className="w-4 h-4" /> : <Icon.Summarize />}
              <span>{t('emailView.summarize')}</span>
            </button>
          )}

          {/* Archive & Delete */}
          <button onClick={onArchive} className="p-2 text-owl-text-secondary/40 hover:text-owl-text hover:bg-owl-surface rounded-xl transition-all" title={`${t('emailView.archiveAction')} (E)`}>
            <Icon.Archive />
          </button>
          <button onClick={onDelete} className="p-2 text-owl-text-secondary/40 hover:text-owl-error hover:bg-owl-error/10 rounded-xl transition-all" title={`${t('emailView.deleteAction')} (#)`}>
            <Icon.Trash />
          </button>

          {/* Task creation button */}
          {onCreateTask && email && (
            <button
              onClick={() => onCreateTask(email.id, email.subject)}
              className="p-2 text-owl-text-secondary/40 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-all"
              title="Görev oluştur"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </button>
          )}

          {/* Print email */}
          {email && (
            <button
              onClick={() => {
                const win = window.open('', '_blank');
                if (!win) return;
                win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${email.subject}</title><style>
                  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; color: #1a1a1a; }
                  .header { border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
                  .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
                  .value { font-size: 15px; color: #111; margin: 2px 0 12px; }
                  .subject { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
                  .body { font-size: 14px; line-height: 1.7; }
                  @media print { body { margin: 20px; } }
                </style></head><body>
                  <div class="header">
                    <div class="subject">${email.subject}</div>
                    <div class="label">Kimden</div><div class="value">${email.from.name} &lt;${email.from.email}&gt;</div>
                    <div class="label">Tarih</div><div class="value">${email.date.toLocaleString('tr-TR')}</div>
                    ${email.to?.length ? `<div class="label">Kime</div><div class="value">${email.to.map((t: {name?:string;email:string}) => t.name || t.email).join(', ')}</div>` : ''}
                  </div>
                  <div class="body">${email.bodyHtml || email.body || email.preview}</div>
                </body></html>`);
                win.document.close();
                setTimeout(() => win.print(), 300);
              }}
              className="p-2 text-owl-text-secondary/40 hover:text-owl-text-secondary hover:bg-owl-surface rounded-xl transition-all"
              title="Emaili yazdır"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
            </button>
          )}

          {/* Calendar event button (shown when dates detected) */}
          {detectedEvent && email && (
            <a
              href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(email.subject)}&details=${encodeURIComponent('Email: ' + email.from.name + '\n\n' + (email.bodyText || '').slice(0, 500))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-owl-text-secondary/40 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all"
              title={`Takvime ekle — "${detectedEvent}" tespit edildi`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </a>
          )}

          {/* Reading Mode button */}
          <button
            onClick={() => setReadingMode(true)}
            className="p-2 text-owl-text-secondary/40 hover:text-violet-400 hover:bg-violet-400/10 rounded-xl transition-all"
            title="Okuma modu (V)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </button>

          {/* AI Translate button */}
          <button
            onClick={translatedBody ? () => setTranslatedBody(null) : handleTranslate}
            disabled={isTranslating}
            className={`p-2 rounded-xl transition-all disabled:opacity-50 ${translatedBody ? 'text-amber-400 bg-amber-400/10' : 'text-owl-text-secondary/40 hover:text-amber-400 hover:bg-amber-400/10'}`}
            title={translatedBody ? 'Çeviriyi gizle' : 'Türkçeye çevir (AI)'}
          >
            {isTranslating ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
              </svg>
            )}
          </button>

          {/* Export .eml button */}
          {email && (
            <button
              onClick={() => {
                const date = email.date.toUTCString();
                const toHeader = email.to?.map((t: {name?:string;email:string}) => t.name ? `${t.name} <${t.email}>` : t.email).join(', ') || '';
                const eml = [
                  `From: ${email.from.name} <${email.from.email}>`,
                  toHeader ? `To: ${toHeader}` : '',
                  `Subject: ${email.subject}`,
                  `Date: ${date}`,
                  `MIME-Version: 1.0`,
                  `Content-Type: text/html; charset=utf-8`,
                  ``,
                  email.bodyHtml || email.body || email.preview,
                ].filter(Boolean).join('\r\n');
                const blob = new Blob([eml], { type: 'message/rfc822' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${email.subject.replace(/[^a-z0-9]/gi, '_').slice(0, 60)}.eml`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="p-2 text-owl-text-secondary/40 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-xl transition-all"
              title="Email'i .eml olarak indir"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ─── TRANSLATION PANEL ─── */}
      {translatedBody && (
        <div className="mx-6 mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-amber-400/15">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
              </svg>
              <span className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-wider">Türkçe Çeviri</span>
            </div>
            <button onClick={() => setTranslatedBody(null)} className="text-owl-text-secondary/40 hover:text-owl-text-secondary transition-colors text-xs">Kapat</button>
          </div>
          <div className="px-4 py-3 text-sm text-owl-text/80 leading-relaxed whitespace-pre-wrap">
            {translatedBody}
          </div>
        </div>
      )}

      {/* ─── AI SMART REPLY ─── */}
      {onReplyWithText && (
        <div className="px-6 pb-4">
          {smartReplies.length === 0 ? (
            <button
              onClick={handleGenerateSmartReplies}
              disabled={isGeneratingSmartReplies}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-owl-border/60 text-owl-text-secondary/70 hover:border-owl-accent/60 hover:text-owl-accent hover:bg-owl-accent/5 transition-all disabled:opacity-50"
            >
              {isGeneratingSmartReplies ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              )}
              {isGeneratingSmartReplies ? 'Üretiliyor…' : 'Akıllı Yanıt'}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-owl-text-secondary/50 font-medium uppercase tracking-wider">Akıllı Yanıt</p>
                <button onClick={() => setSmartReplies([])} className="text-[10px] text-owl-text-secondary/40 hover:text-owl-text-secondary transition-colors">Kapat</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {smartReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => { onReplyWithText(reply); setSmartReplies([]); }}
                    className="text-left px-3.5 py-2 rounded-xl text-sm border border-owl-border/60 text-owl-text/80 hover:border-owl-accent/60 hover:text-owl-accent hover:bg-owl-accent/5 transition-all"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── QUICK REPLY CHIPS ─── */}
      {onReplyWithText && (
        <div className="px-6 pb-5">
          <p className="text-[11px] text-owl-text-secondary/50 mb-2 font-medium uppercase tracking-wider">Hızlı Yanıt</p>
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((text) => (
              <button
                key={text}
                onClick={() => onReplyWithText(text)}
                className="px-3.5 py-1.5 rounded-full text-sm border border-owl-border/70 text-owl-text-secondary hover:border-owl-accent/60 hover:text-owl-accent hover:bg-owl-accent/5 transition-all"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── TEXT SELECTION POPUP ─── */}
      {selectionPopup && (
        <div
          className="fixed z-[600] flex items-center gap-0.5 p-1 rounded-xl bg-owl-surface border border-owl-border/60 shadow-owl-lg animate-scale-in pointer-events-auto"
          style={{ left: selectionPopup.x, top: selectionPopup.y - 8, transform: 'translate(-50%, -100%)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              navigator.clipboard.writeText(selectionPopup.text);
              setSelectionCopied(true);
              setTimeout(() => { setSelectionCopied(false); setSelectionPopup(null); }, 1200);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-owl-text-secondary hover:text-owl-text hover:bg-owl-surface-2 rounded-lg transition-all"
            title="Kopyala"
          >
            {selectionCopied ? (
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            )}
            <span>Kopyala</span>
          </button>
          <div className="w-px h-4 bg-owl-border/40" />
          <button
            onClick={() => { window.open(`https://www.google.com/search?q=${encodeURIComponent(selectionPopup.text)}`, '_blank'); setSelectionPopup(null); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-owl-text-secondary hover:text-owl-text hover:bg-owl-surface-2 rounded-lg transition-all"
            title="Web'de ara"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <span>Ara</span>
          </button>
          <div className="w-px h-4 bg-owl-border/40" />
          <button
            onClick={async () => {
              setSelectionPopup(null);
              setIsTranslating(true);
              try {
                const resp = await fetch(`${HOME_AI_URL}/v1/chat/completions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: HOME_AI_DEFAULT_MODEL,
                    messages: [
                      { role: 'system', content: 'Verilen metni Türkçeye çevir. Sadece çeviriyi yaz.' },
                      { role: 'user', content: selectionPopup.text },
                    ],
                    max_tokens: 300,
                  }),
                });
                const data = await resp.json();
                setTranslatedBody(data.choices?.[0]?.message?.content || null);
              } catch { /* ignore */ } finally {
                setIsTranslating(false);
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-owl-text-secondary hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
            title="Türkçeye çevir"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
            <span>Çevir</span>
          </button>
        </div>
      )}

      {/* ─── LINK HOVER BAR ─── */}
      {hoveredLink && (
        <div className="fixed bottom-0 left-0 right-0 z-[500] px-4 py-1.5 bg-owl-surface/95 border-t border-owl-border/30 backdrop-blur-sm pointer-events-none">
          <p className="text-[11px] text-owl-text-secondary/70 truncate">
            <span className="text-owl-text-secondary/40 mr-1.5">↗</span>
            {hoveredLink}
          </p>
        </div>
      )}

      {/* ─── READING MODE OVERLAY ─── */}
      {readingMode && (
        <div className="fixed inset-0 z-[500] overflow-y-auto" style={{ background: 'var(--reading-bg, #fafafa)' }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 border-b backdrop-blur-md"
            style={{ background: 'var(--reading-header-bg, rgba(250,250,250,0.92))', borderColor: 'var(--reading-border, #e5e7eb)' }}>
            {/* Font size controls */}
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setReadingFontSize(s => Math.max(12, s - 2))}
                className="px-2 py-1 text-xs font-semibold rounded-md hover:bg-black/10 transition-colors"
                style={{ color: 'var(--reading-text-muted, #6b7280)' }}
                title="Yazıyı küçült"
              >A-</button>
              <span className="text-xs px-1" style={{ color: 'var(--reading-text-muted, #6b7280)' }}>{readingFontSize}</span>
              <button
                onClick={() => setReadingFontSize(s => Math.min(28, s + 2))}
                className="px-2 py-1 text-sm font-semibold rounded-md hover:bg-black/10 transition-colors"
                style={{ color: 'var(--reading-text-muted, #6b7280)' }}
                title="Yazıyı büyüt"
              >A+</button>
            </div>

            <div className="flex-1 text-center">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--reading-text, #111827)' }}>{email.subject}</p>
              <p className="text-xs" style={{ color: 'var(--reading-text-muted, #6b7280)' }}>
                {email.from.name} · {email.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} · ~{readingTime} dk
              </p>
            </div>

            <button
              onClick={() => setReadingMode(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
              style={{ color: 'var(--reading-text-muted, #6b7280)' }}
              title="Okuma modunu kapat (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Reading content */}
          <div
            className="max-w-[720px] mx-auto px-8 py-12"
            style={{
              fontSize: readingFontSize,
              lineHeight: 1.85,
              color: 'var(--reading-text, #111827)',
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            {sanitizedHtml ? (
              <div
                className="email-body-html"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}
              />
            ) : (
              <pre className="whitespace-pre-wrap" style={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                {email.bodyText || email.body || email.preview}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

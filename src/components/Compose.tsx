// ============================================================================
// OwlMail - Compose Email Modal
// ============================================================================
// SECURITY HARDENED: Strict sanitization, no style/img in compose

import React, { useState, useEffect, useRef, useCallback, useMemo, type PointerEvent as RPointerEvent } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from '../i18n';
import { useShortcut } from '../hooks/useKeyboardShortcuts';
import { isMobile } from '../hooks/usePlatform';
import { RecipientInput } from './compose/RecipientInput';
import { AttachmentList } from './compose/AttachmentList';
import { RichTextEditor } from './compose/RichTextEditor';
import TemplateSelector from './compose/TemplateSelector';
import { useDraftAutoSave } from '../hooks/useDraftAutoSave';
import { deleteDraft } from '../services/draftService';
import { templateIncrementUsage } from '../services';
import { buildTemplateContext, replaceTemplateVariables } from '../utils/templateVariables';
import type { Email, EmailAddress, DraftEmail, Attachment, Account, EmailTemplate } from '../types';

// ─── Subject History ─────────────────────────────────────────────────────────
const RECENT_SUBJECTS_KEY = 'owlmail-recent-subjects';
function getRecentSubjects(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_SUBJECTS_KEY) || '[]'); } catch { return []; }
}
function saveRecentSubject(subject: string): void {
  if (!subject.trim() || subject.startsWith('Re:') || subject.startsWith('Fwd:')) return;
  const list = getRecentSubjects().filter(s => s !== subject.trim()).slice(0, 9);
  localStorage.setItem(RECENT_SUBJECTS_KEY, JSON.stringify([subject.trim(), ...list]));
}

// ─── Quick Templates (localStorage) ─────────────────────────────────────────
const QUICK_TPLS_KEY = 'owlmail-quick-templates';
interface QuickTemplate { id: string; name: string; subject: string; body: string; }
function getQuickTemplates(): QuickTemplate[] { try { return JSON.parse(localStorage.getItem(QUICK_TPLS_KEY) || '[]'); } catch { return []; } }
function saveQuickTemplate(tpl: QuickTemplate): void {
  const list = getQuickTemplates().filter(t => t.id !== tpl.id);
  localStorage.setItem(QUICK_TPLS_KEY, JSON.stringify([tpl, ...list].slice(0, 20)));
}
function deleteQuickTemplate(id: string): void {
  localStorage.setItem(QUICK_TPLS_KEY, JSON.stringify(getQuickTemplates().filter(t => t.id !== id)));
}

// SECURITY: Logger wrapper to avoid exposing details in production
const log = {
  error: (message: string, _err?: unknown) => {
    if (import.meta.env.DEV) {
      console.error(message, _err);
    }
  },
};

// SECURITY: Sanitization for compose - allows img/style for signatures
const sanitizeForCompose = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img', 'style', 'meta'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'src', 'alt', 'style', 'cellpadding', 'cellspacing', 'border', 'charset'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
};

// SECURITY: Additional text sanitizer for display
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

interface ComposeProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'new' | 'reply' | 'replyAll' | 'forward';
  originalEmail?: Email;
  draft?: DraftEmail; // Draft to edit
  initialBody?: string; // Pre-filled body (e.g. from AI Reply)
  initialTo?: { email: string; name: string }[]; // Pre-filled recipients (quick compose to sender)
  onSend: (email: DraftEmail) => Promise<void>;
  onSaveDraft: (email: DraftEmail) => Promise<void>;
  defaultAccount?: Account;
  onSchedule?: (draft: DraftEmail, sendAt: number) => void;
  onArchiveOriginal?: () => void;
}

export function Compose({
  isOpen,
  onClose,
  mode,
  originalEmail,
  draft,
  initialBody,
  initialTo,
  onSend,
  defaultAccount,
  onSchedule,
  onArchiveOriginal,
}: ComposeProps) {
  const { t, lang } = useTranslation();

  // Recipients
  const [to, setTo] = useState<EmailAddress[]>([]);
  const [cc, setCc] = useState<EmailAddress[]>([]);
  const [bcc, setBcc] = useState<EmailAddress[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  // Content
  const [subject, setSubject] = useState('');
  const [editorBodyHtml, setEditorBodyHtml] = useState(''); // Text body (without signature/quote)
  const [signatureHtml, setSignatureHtml] = useState(''); // Signature rendered separately
  const [quoteHtml, setQuoteHtml] = useState(''); // Reply/forward quote rendered separately
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Combined bodyHtml for draft saving and sending: message + signature + quote
  const bodyHtml = useMemo(() => {
    let html = editorBodyHtml;
    if (signatureHtml) html += `<br><div class="email-signature">${signatureHtml}</div>`;
    if (quoteHtml) html += quoteHtml;
    return html;
  }, [editorBodyHtml, signatureHtml, quoteHtml]);

  // Auto-save draft recovery
  const [autosaveBanner, setAutosaveBanner] = useState(false);
  const AUTOSAVE_KEY = 'owlmail-compose-autosave';

  // State
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [isAiSubject, setIsAiSubject] = useState(false);
  const [showAiCompose, setShowAiCompose] = useState(false);
  const [aiComposePrompt, setAiComposePrompt] = useState('');
  const [isAiComposing, setIsAiComposing] = useState(false);
  const [showRewriteMenu, setShowRewriteMenu] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [prevBodyHtml, setPrevBodyHtml] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | undefined>();
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [subjectFocused, setSubjectFocused] = useState(false);
  const [recentSubjects, setRecentSubjects] = useState<string[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [bccSelf, setBccSelf] = useState(() => localStorage.getItem('owlmail-bcc-self') === '1');
  const archiveAfterSendRef = React.useRef(false);
  // SECURITY: Use state-based notifications instead of alert()
  const [notification, setNotification] = useState<{ type: 'error' | 'success' | 'warning'; message: string } | null>(null);

  // Draggable + Resizable window state
  const [winPos, setWinPos] = useState({ x: 0, y: 0 });
  const [winSize, setWinSize] = useState({ w: 720, h: 600 });
  const [centered, setCentered] = useState(true); // Start centered, then free
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Reset position when opening
  useEffect(() => {
    if (isOpen) { setCentered(true); setIsMinimized(false); }
  }, [isOpen]);

  // Auto-save compose content every 30s (new email mode only)
  useEffect(() => {
    if (!isOpen || mode !== 'new' || isSending) return;
    const timer = setInterval(() => {
      const toSave = { to: to.map(a => a.email).join(','), subject, body: editorBodyHtml };
      if (toSave.subject || toSave.body.trim()) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toSave));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [isOpen, mode, isSending, to, subject, editorBodyHtml]);

  // Check for auto-saved draft on open
  useEffect(() => {
    if (!isOpen || mode !== 'new') return;
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.subject || parsed.body) setAutosaveBanner(true);
      } catch { /* ignore */ }
    }
  }, [isOpen, mode]);

  const onDragStart = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, select, button, textarea')) return;
    e.preventDefault();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    if (centered) {
      setWinPos({ x: rect.left, y: rect.top });
      setCentered(false);
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: centered ? rect.left : winPos.x, origY: centered ? rect.top : winPos.y };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      setWinPos({
        x: Math.max(0, dragRef.current.origX + ev.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.origY + ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => { dragRef.current = null; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [centered, winPos]);

  const onResizeStart = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    if (centered) {
      setWinPos({ x: rect.left, y: rect.top });
      setWinSize({ w: rect.width, h: rect.height });
      setCentered(false);
    }
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: centered ? rect.width : winSize.w, origH: centered ? rect.height : winSize.h };
    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current) return;
      setWinSize({
        w: Math.max(480, resizeRef.current.origW + ev.clientX - resizeRef.current.startX),
        h: Math.max(400, resizeRef.current.origH + ev.clientY - resizeRef.current.startY),
      });
    };
    const onUp = () => { resizeRef.current = null; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [centered, winSize]);

  // Effective signature — from defaultAccount prop
  const accountSignature = defaultAccount?.signature || '';

  // Ensure signature is set when account loads after compose opens
  useEffect(() => {
    if (isOpen && accountSignature && !signatureHtml) {
      setSignatureHtml(accountSignature);
    }
  }, [isOpen, accountSignature, signatureHtml]);

  // Template selector
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // Quick templates (localStorage)
  const [showQuickTpls, setShowQuickTpls] = useState(false);
  const [quickTpls, setQuickTpls] = useState<QuickTemplate[]>(() => getQuickTemplates());
  const [quickTplName, setQuickTplName] = useState('');
  const [quickTplSaving, setQuickTplSaving] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear notification after timeout
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // SECURITY: Show notification helper (replaces alert)
  const showNotification = (type: 'error' | 'success' | 'warning', message: string) => {
    setNotification({ type, message });
  };

  // Handle image paste from clipboard
  const handleImagePaste = useCallback((files: File[]) => {
    const MAX_ATTACHMENTS = 10;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      showNotification('warning', t('compose.maxAttachments').replace('{max}', String(MAX_ATTACHMENTS)));
      return;
    }

    const newAttachments: Attachment[] = files.map((file, idx) => ({
      index: attachments.length + idx,
      filename: file.name,
      contentType: file.type,
      size: file.size,
      localPath: URL.createObjectURL(file),
      isInline: true,
      _file: file,
    }));

    setAttachments(prev => [...prev, ...newAttachments]);
    showNotification('success', `${files.length} ${t('compose.imageAdded')}`);
  }, [attachments]);

  // Auto-save draft
  const currentDraft = useMemo(() => ({
    id: draftId,
    accountId: defaultAccount?.id || 0,
    to,
    cc,
    bcc,
    subject,
    bodyText: bodyHtml.replace(/<[^>]*>/g, ''), // Strip HTML
    bodyHtml,
    attachments,
    replyToEmailId: mode === 'reply' || mode === 'replyAll' ? originalEmail?.id : undefined,
    forwardEmailId: mode === 'forward' ? originalEmail?.id : undefined,
    composeType: mode,
  }), [draftId, defaultAccount, to, cc, bcc, subject, bodyHtml, attachments, mode, originalEmail]);

  const { saveNow } = useDraftAutoSave(currentDraft, attachments, {
    enabled: isOpen && !isSending && (defaultAccount?.id || 0) > 0,
    debounceMs: 2000,
    onSaveStart: () => setAutoSaveStatus('saving'),
    onSaveSuccess: (id) => {
      setDraftId(id);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    },
    onSaveError: (err) => {
      console.error('Draft auto-save error:', err);
      // Don't show error to user — auto-save is best-effort
      setAutoSaveStatus('idle');
    },
  });

  // Initialize form from draft (if editing an existing draft)
  useEffect(() => {
    if (!isOpen || !draft) return;

    setTo(draft.to);
    setCc(draft.cc);
    setBcc(draft.bcc);
    setSubject(draft.subject);
    // Split draft body into: editor content, signature, quote
    let remaining = draft.bodyHtml;
    // Extract quote
    const quoteMatch = remaining.match(/([\s\S]*?)(<br\s*\/?>)*\s*(<div class="email-quote">[\s\S]*$)/i);
    if (quoteMatch) {
      remaining = quoteMatch[1];
      setQuoteHtml(quoteMatch[3]);
    } else {
      setQuoteHtml('');
    }
    // Extract signature
    const sigMatch = remaining.match(/([\s\S]*?)(<br\s*\/?>)*\s*<div class="email-signature">([\s\S]*)<\/div>\s*$/i);
    if (sigMatch) {
      setEditorBodyHtml(sigMatch[1]);
      setSignatureHtml(sigMatch[3]);
    } else {
      setEditorBodyHtml(remaining);
    }
    setAttachments(draft.attachments);
    setDraftId(draft.id);
    setShowCc(draft.cc.length > 0);
    setShowBcc(draft.bcc.length > 0);
  }, [isOpen, draft]);

  // Initialize form based on mode
  useEffect(() => {
    if (!isOpen) return;
    if (draft) return; // Skip if we're editing a draft

    if (mode === 'new') {
      setTo(initialTo && initialTo.length > 0 ? initialTo : []);
      setCc([]);
      setBcc([]);
      setSubject('');
      setEditorBodyHtml('');
      setSignatureHtml(accountSignature);
      setQuoteHtml('');
      setAttachments([]);
      setShowCc(false);
      setShowBcc(false);
    } else if (originalEmail) {
      const aiPrefix = initialBody ? `<p>${escapeHtml(initialBody)}</p>` : '';
      if (mode === 'reply') {
        setTo([{ email: originalEmail.from.email, name: originalEmail.from.name }]);
        setSubject(originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `${t('compose.replyPrefix')} ${originalEmail.subject}`);
        setEditorBodyHtml(aiPrefix);
        setSignatureHtml(accountSignature);
        setQuoteHtml(generateQuote(originalEmail));
      } else if (mode === 'replyAll') {
        setTo([{ email: originalEmail.from.email, name: originalEmail.from.name }]);
        setCc(originalEmail.to.filter((addr) => addr.email !== defaultAccount?.email));
        setShowCc(true);
        setSubject(originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `${t('compose.replyPrefix')} ${originalEmail.subject}`);
        setEditorBodyHtml(aiPrefix);
        setSignatureHtml(accountSignature);
        setQuoteHtml(generateQuote(originalEmail));
      } else if (mode === 'forward') {
        setTo([]);
        setSubject(originalEmail.subject.startsWith('Fwd:') ? originalEmail.subject : `${t('compose.forwardPrefix')} ${originalEmail.subject}`);
        setEditorBodyHtml('');
        setSignatureHtml(accountSignature);
        setQuoteHtml(generateForwardQuote(originalEmail));
      }
    }
  }, [isOpen, mode, originalEmail, defaultAccount, draft, accountSignature, initialTo]);


  // Keyboard shortcuts
  useShortcut('Escape', onClose, { enabled: isOpen && !isSending });
  useShortcut('Ctrl+Enter', handleSend, { enabled: isOpen && !isSending, allowInInput: true });
  useShortcut('Ctrl+s', handleSaveDraft, { enabled: isOpen && !isSending, allowInInput: true });
  useShortcut('Ctrl+t', () => setShowTemplateSelector(true), { enabled: isOpen && !isSending, allowInInput: true });

  // SECURITY: Generate sanitized quote for reply
  function generateQuote(email: Email): string {
    const dateStr = new Date(email.date).toLocaleString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // SECURITY: Escape sender name and sanitize body content
    const safeName = escapeHtml(email.from.name || email.from.email);
    // SECURITY: Sanitize email body before including in quote
    // Strip original email's signature to avoid duplicate signatures in reply
    let rawBody = email.bodyHtml || `<p>${escapeHtml(email.bodyText || '')}</p>`;
    rawBody = rawBody.replace(/<div class="email-signature">[\s\S]*?<\/div>\s*$/i, '');
    const safeBody = sanitizeForCompose(rawBody);

    const quoteHeader = t('compose.onDateWrote').replace('{date}', escapeHtml(dateStr)).replace('{name}', safeName);

    return `
<br><br>
<div class="email-quote">
  <p class="quote-header">
    ${quoteHeader}
  </p>
  ${safeBody}
</div>
    `.trim();
  }

  // SECURITY: Generate sanitized quote for forward
  function generateForwardQuote(email: Email): string {
    const dateStr = new Date(email.date).toLocaleString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // SECURITY: Escape all user-provided content
    const safeName = escapeHtml(email.from.name || '');
    const safeEmail = escapeHtml(email.from.email);
    const safeSubject = escapeHtml(email.subject);
    const safeRecipients = email.to.map((a) =>
      escapeHtml(a.name ? `${a.name} <${a.email}>` : a.email)
    ).join(', ');
    // SECURITY: Sanitize email body
    const safeBody = sanitizeForCompose(email.bodyHtml || `<p>${escapeHtml(email.bodyText || '')}</p>`);

    return `
<br><br>
<div class="email-forward">
  <p class="forward-header">${t('compose.forwardedMessage')}</p>
  <p class="forward-meta">
    <strong>${t('compose.forwardFrom')}</strong> ${safeName ? `${safeName} &lt;${safeEmail}&gt;` : safeEmail}<br>
    <strong>${t('compose.forwardDate')}</strong> ${escapeHtml(dateStr)}<br>
    <strong>${t('compose.forwardSubject')}</strong> ${safeSubject}<br>
    <strong>${t('compose.forwardTo')}</strong> ${safeRecipients}
  </p>
  <br>
  ${safeBody}
</div>
    `.trim();
  }

  // Handle send
  async function handleSend() {
    if (to.length === 0) {
      showNotification('warning', t('compose.noRecipientError'));
      return;
    }

    setIsSending(true);

    try {
      const bccList = [...bcc];
      if (bccSelf && defaultAccount?.email && !bccList.some(r => r.email === defaultAccount.email)) {
        bccList.push({ email: defaultAccount.email, name: defaultAccount.displayName || '' });
      }
      const draft: DraftEmail = {
        accountId: defaultAccount?.id || 0,
        to,
        cc,
        bcc: bccList,
        subject,
        bodyText: bodyHtml.replace(/<[^>]*>/g, ''),
        bodyHtml,
        attachments,
        replyToEmailId: mode === 'reply' || mode === 'replyAll' ? originalEmail?.id : undefined,
        forwardEmailId: mode === 'forward' ? originalEmail?.id : undefined,
        composeType: mode,
      };

      await onSend(draft);

      // Save recipients + subject for future autocomplete
      const { saveRecentRecipients } = await import('./compose/RecipientInput');
      saveRecentRecipients([...to, ...cc, ...bcc]);
      if (subject.trim()) saveRecentSubject(subject);

      // Delete auto-saved draft
      if (draftId) {
        try {
          await deleteDraft(draftId);
        } catch (err) {
          log.error('Failed to delete draft:', err);
        }
      }

      localStorage.removeItem(AUTOSAVE_KEY);
      const shouldArchive = archiveAfterSendRef.current;
      archiveAfterSendRef.current = false;
      onClose();
      if (shouldArchive) onArchiveOriginal?.();
    } catch (err) {
      // SECURITY: Don't expose detailed error info to users
      log.error('Send failed:', err);
      showNotification('error', t('compose.sendFailed'));
    } finally {
      setIsSending(false);
    }
  }

  // Handle schedule send
  function handleScheduleSend() {
    if (!scheduleDateTime) return;
    const sendAt = new Date(scheduleDateTime).getTime();
    if (sendAt <= Date.now()) {
      showNotification('warning', 'Lütfen gelecekte bir zaman seçin.');
      return;
    }
    if (to.length === 0) {
      showNotification('warning', t('compose.noRecipientError'));
      return;
    }
    const draft: DraftEmail = {
      accountId: defaultAccount?.id || 0,
      to, cc, bcc, subject,
      bodyText: bodyHtml.replace(/<[^>]*>/g, ''),
      bodyHtml, attachments,
      replyToEmailId: mode === 'reply' || mode === 'replyAll' ? originalEmail?.id : undefined,
      forwardEmailId: mode === 'forward' ? originalEmail?.id : undefined,
      composeType: mode,
    };
    onSchedule?.(draft, sendAt);
    showNotification('success', `Email zamanlandı: ${new Date(sendAt).toLocaleString('tr-TR')}`);
    setTimeout(() => onClose(), 1500);
  }

  // AI-powered subject suggestion
  async function handleAiSubject() {
    const bodyText = editorBodyHtml.replace(/<[^>]*>/g, '').trim().slice(0, 600);
    if (!bodyText && !subject) return;
    setIsAiSubject(true);
    try {
      const { HOME_AI_URL, HOME_AI_DEFAULT_MODEL } = await import('../config/homeServer');
      const res = await fetch(`${HOME_AI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HOME_AI_DEFAULT_MODEL,
          messages: [
            { role: 'system', content: 'Sen bir email yazarısın. Verilen email içeriğine göre kısa, net ve profesyonel bir email konusu (subject) öner. Sadece konu başlığını yaz, açıklama yapma. Türkçe veya İngilizce olabilir.' },
            { role: 'user', content: `Email içeriği:\n${bodyText || subject}\n\nKısa ve etkili bir email konusu öner:` },
          ],
          max_tokens: 80,
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error('AI unavailable');
      const data = await res.json();
      const suggestion = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
      if (suggestion) setSubject(suggestion);
    } catch {
      showNotification('warning', 'AI bağlantısı kurulamadı. Ev sunucusunun çalıştığından emin olun.');
    } finally {
      setIsAiSubject(false);
    }
  }

  // AI full body compose
  async function handleAiCompose() {
    if (!aiComposePrompt.trim()) return;
    setIsAiComposing(true);
    try {
      const { HOME_AI_URL, HOME_AI_DEFAULT_MODEL } = await import('../config/homeServer');
      const context = [
        to.length > 0 && `Alıcı: ${to.map(r => r.name || r.email).join(', ')}`,
        subject && `Konu: ${subject}`,
      ].filter(Boolean).join('\n');
      const res = await fetch(`${HOME_AI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HOME_AI_DEFAULT_MODEL,
          messages: [
            { role: 'system', content: 'Sen profesyonel bir email yazarısın. Kullanıcının talebine göre eksiksiz, nazik ve doğal bir email gövdesi yaz. Sadece email gövdesini yaz — konu, selamlama ve imza dahil olabilir ama giriş açıklaması yazma. Türkçe olarak yaz.' },
            { role: 'user', content: `${context ? context + '\n\n' : ''}Talep: ${aiComposePrompt.trim()}` },
          ],
          max_tokens: 600,
          temperature: 0.75,
        }),
      });
      if (!res.ok) throw new Error('AI unavailable');
      const data = await res.json();
      const body = data.choices?.[0]?.message?.content?.trim();
      if (body) {
        const html = body.split('\n').map((l: string) => l ? `<p>${l}</p>` : '<p><br></p>').join('');
        setEditorBodyHtml(html);
        setShowAiCompose(false);
        setAiComposePrompt('');
        if (!subject) {
          // Auto-suggest subject too
          setTimeout(handleAiSubject, 300);
        }
      }
    } catch {
      showNotification('warning', 'AI bağlantısı kurulamadı.');
    } finally {
      setIsAiComposing(false);
    }
  }

  const REWRITE_STYLES = [
    { id: 'formal',   label: 'Daha Resmi',   prompt: 'Bu emaili daha resmi ve profesyonel bir dile çevir. Aynı içeriği koru, sadece üslubu değiştir.' },
    { id: 'casual',   label: 'Daha Samimi',  prompt: 'Bu emaili daha samimi ve sıcak bir dile çevir. Aynı içeriği koru, sadece üslubu değiştir.' },
    { id: 'shorter',  label: 'Daha Kısa',    prompt: 'Bu emaili önemli bilgileri koruyarak çok daha kısa ve öz hale getir.' },
    { id: 'longer',   label: 'Daha Uzun',    prompt: 'Bu emaili daha ayrıntılı ve kapsamlı hale getir, ek bağlam ve açıklamalar ekle.' },
    { id: 'fix',      label: 'Yazım Düzelt', prompt: 'Bu emaildeki yazım, dil bilgisi ve noktalama hatalarını düzelt. Üslup ve içeriği değiştirme.' },
    { id: 'english',  label: 'İngilizce',    prompt: 'Bu emaili doğal, akıcı İngilizceye çevir. Resmiyet düzeyini koru.' },
  ] as const;

  async function handleAiRewrite(styleId: string) {
    const style = REWRITE_STYLES.find(s => s.id === styleId);
    if (!style) return;
    const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const currentText = stripHtml(editorBodyHtml);
    if (!currentText) return;
    setPrevBodyHtml(editorBodyHtml);
    setIsRewriting(true);
    setShowRewriteMenu(false);
    try {
      const { HOME_AI_URL, HOME_AI_DEFAULT_MODEL } = await import('../config/homeServer');
      const res = await fetch(`${HOME_AI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HOME_AI_DEFAULT_MODEL,
          messages: [
            { role: 'system', content: 'Sen bir email editörüsün. Kullanıcının verdiği email metnini istenen şekilde yeniden yaz. Sadece email gövdesini döndür — hiçbir açıklama, not ya da etiket ekleme.' },
            { role: 'user', content: `${style.prompt}\n\nEmail:\n${currentText}` },
          ],
          max_tokens: 800,
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error('AI unavailable');
      const data = await res.json();
      const body = data.choices?.[0]?.message?.content?.trim();
      if (body) {
        const html = body.split('\n').map((l: string) => l ? `<p>${l}</p>` : '<p><br></p>').join('');
        setEditorBodyHtml(html);
      }
    } catch {
      showNotification('warning', 'AI bağlantısı kurulamadı.');
      setPrevBodyHtml(null);
    } finally {
      setIsRewriting(false);
    }
  }

  // Handle save draft (manual)
  async function handleSaveDraft() {
    setIsSaving(true);

    try {
      await saveNow();
      showNotification('success', t('compose.draftSaved'));
    } catch (err) {
      // SECURITY: Don't expose detailed error info
      log.error('Save draft failed:', err);
      showNotification('error', t('compose.draftSaveError'));
    } finally {
      setIsSaving(false);
    }
  }

  // Handle template selection
  async function handleTemplateSelect(template: EmailTemplate) {
    try {
      // Build context from account and first recipient
      const context = buildTemplateContext(defaultAccount, to[0], undefined, lang);

      // Replace variables in subject and body
      const processedSubject = replaceTemplateVariables(template.subjectTemplate, context);
      const processedBody = replaceTemplateVariables(template.bodyHtmlTemplate, context);

      // Set subject (only if empty)
      if (!subject.trim()) {
        setSubject(processedSubject);
      } else {
        // Ask user if they want to replace existing subject
        if (window.confirm(t('compose.confirmReplaceSubject'))) {
          setSubject(processedSubject);
        }
      }

      // Append body (before signature if exists)
      // Append template to editor body (signature is rendered separately)
      setEditorBodyHtml(editorBodyHtml + (editorBodyHtml ? '<br><br>' : '') + processedBody);

      // Increment usage count
      await templateIncrementUsage(template.id);

      showNotification('success', t('compose.templateApplied').replace('{name}', template.name));
    } catch (err) {
      log.error('Failed to apply template:', err);
      showNotification('error', t('compose.templateApplyError'));
    }
  }

  // Handle file attachment
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    // SECURITY: Limit number of attachments
    const MAX_ATTACHMENTS = 10;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      showNotification('warning', t('compose.maxAttachments').replace('{max}', String(MAX_ATTACHMENTS)));
      return;
    }

    // Store files with blob URLs for preview, will upload on send
    const newAttachments: Attachment[] = Array.from(files).map((file, idx) => ({
      index: attachments.length + idx,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      localPath: URL.createObjectURL(file),
      isInline: false,
      _file: file, // Keep File object for upload on send
    }));

    setAttachments([...attachments, ...newAttachments]);
    e.target.value = '';
  }

  // Handle remove attachment
  function handleRemoveAttachment(index: number) {
    setAttachments(attachments.filter((_, i) => i !== index));
  }

  // Handle drag and drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (!files.length) return;

    // SECURITY: Limit number of attachments
    const MAX_ATTACHMENTS = 10;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      showNotification('warning', t('compose.maxAttachments').replace('{max}', String(MAX_ATTACHMENTS)));
      return;
    }

    const newAttachments: Attachment[] = Array.from(files).map((file, idx) => ({
      index: attachments.length + idx,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      localPath: URL.createObjectURL(file),
      isInline: false,
      _file: file,
    }));

    setAttachments([...attachments, ...newAttachments]);
  }

  const mobile = isMobile();

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 flex items-center gap-1.5 bg-owl-surface border border-owl-border border-b-0 rounded-t-xl shadow-owl-lg px-3 py-2 min-w-[240px] max-w-xs">
        <svg className="w-3.5 h-3.5 text-owl-accent shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        <span className="text-sm text-owl-text truncate flex-1 cursor-pointer" onClick={() => setIsMinimized(false)}>
          {subject || t('compose.newEmail')}
        </span>
        <button onClick={() => setIsMinimized(false)} className="p-1 rounded hover:bg-owl-surface-2 text-owl-text-secondary hover:text-owl-text transition-colors" title="Büyüt">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-owl-surface-2 text-owl-text-secondary hover:text-red-400 transition-colors" title="Kapat">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${centered && !mobile ? 'flex items-center justify-center' : ''} bg-black/60 backdrop-blur-sm`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => { if (e.target === e.currentTarget && !mobile) setIsMinimized(true); }}
    >
      <div
        className={`bg-owl-surface shadow-2xl flex flex-col overflow-hidden relative ${
          mobile
            ? 'w-full h-full'
            : 'border border-owl-border rounded-xl'
        }`}
        style={mobile ? undefined : (centered
          ? { width: `${winSize.w}px`, maxHeight: '90vh' }
          : { position: 'fixed', left: `${winPos.x}px`, top: `${winPos.y}px`, width: `${winSize.w}px`, height: `${winSize.h}px` }
        )}
      >
        {/* SECURITY: Notification Toast (replaces alert) */}
        {notification && (
          <div
            className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-60 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 ${
              notification.type === 'error'
                ? 'bg-red-900/90 border border-red-500/50 text-red-200'
                : notification.type === 'warning'
                ? 'bg-yellow-900/90 border border-yellow-500/50 text-yellow-200'
                : 'bg-green-900/90 border border-green-500/50 text-green-200'
            }`}
          >
            <span className="text-sm">{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 text-current opacity-70 hover:opacity-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {/* Auto-save restore banner */}
        {autosaveBanner && (
          <div className="flex items-center gap-3 px-4 py-2 bg-owl-accent/10 border-b border-owl-accent/20 text-sm">
            <svg className="w-4 h-4 text-owl-accent shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
            </svg>
            <span className="text-owl-text flex-1">Kaydedilmiş taslak bulundu.</span>
            <button
              onClick={() => {
                try {
                  const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}');
                  if (saved.subject) setSubject(saved.subject);
                  if (saved.body) setEditorBodyHtml(saved.body);
                  if (saved.to) setTo(saved.to.split(',').filter(Boolean).map((e: string) => ({ email: e.trim(), name: '' })));
                } catch { /* ignore */ }
                setAutosaveBanner(false);
              }}
              className="text-owl-accent font-semibold hover:text-owl-accent-hover transition-colors"
            >
              Geri Yükle
            </button>
            <button
              onClick={() => { localStorage.removeItem(AUTOSAVE_KEY); setAutosaveBanner(false); }}
              className="text-owl-text-secondary hover:text-owl-text transition-colors"
            >
              Yoksay
            </button>
          </div>
        )}
        {/* Header — draggable */}
        <div
          className={`flex items-center justify-between border-b border-owl-border ${mobile ? 'px-4 py-3' : 'px-6 py-4'} ${!mobile ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
          onPointerDown={!mobile ? onDragStart : undefined}
        >
          <div className="flex items-center gap-3">
            <h2 className={`font-semibold text-owl-text ${mobile ? 'text-base' : 'text-lg'}`}>
              {mode === 'new' && t('compose.newEmail')}
              {mode === 'reply' && t('compose.reply')}
              {mode === 'replyAll' && t('compose.replyAll')}
              {mode === 'forward' && t('compose.forward')}
            </h2>

            {/* Auto-save indicator */}
            {autoSaveStatus === 'saving' && (
              <div className="flex items-center gap-2 text-xs text-owl-text-secondary">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('compose.saving')}
              </div>
            )}
            {autoSaveStatus === 'saved' && (
              <div className="flex items-center gap-2 text-xs text-green-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('compose.saved')}
              </div>
            )}
            {autoSaveStatus === 'error' && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t('compose.autoSaveError')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="px-3 py-1.5 text-sm text-owl-text-secondary hover:text-owl-text hover:bg-owl-surface-2 rounded-lg transition-colors"
            >
              {isSaving ? t('compose.saving') : t('compose.saveDraft')}
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 text-owl-text-secondary hover:text-owl-text rounded-lg hover:bg-owl-surface-2 transition-colors"
              title="Küçült"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              disabled={isSending}
              className="p-2 text-owl-text-secondary hover:text-owl-text rounded-lg hover:bg-owl-surface-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Recipients */}
        <div className={`py-3 space-y-2 border-b border-owl-border ${mobile ? 'px-4' : 'px-6'}`}>
          {/* To */}
          <div className="flex items-start gap-3">
            <label className="text-sm text-owl-text-secondary w-12 pt-2">{t('compose.toLabel')}</label>
            <div className="flex-1">
              <RecipientInput
                recipients={to}
                onChange={setTo}
                placeholder={t('compose.addRecipientPlaceholder')}
              />
            </div>
            {!showCc && !showBcc && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCc(true)}
                  className="text-sm px-3 py-2 text-owl-text-secondary hover:text-owl-accent"
                >
                  CC
                </button>
                <button
                  onClick={() => setShowBcc(true)}
                  className="text-sm px-3 py-2 text-owl-text-secondary hover:text-owl-accent"
                >
                  BCC
                </button>
              </div>
            )}
          </div>

          {/* CC */}
          {showCc && (
            <div className="flex items-start gap-3">
              <label className="text-sm text-owl-text-secondary w-12 pt-2">{t('compose.cc')}:</label>
              <div className="flex-1">
                <RecipientInput
                  recipients={cc}
                  onChange={setCc}
                  placeholder={t('compose.addCcPlaceholder')}
                />
              </div>
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="flex items-start gap-3">
              <label className="text-sm text-owl-text-secondary w-12 pt-2">{t('compose.bcc')}:</label>
              <div className="flex-1">
                <RecipientInput
                  recipients={bcc}
                  onChange={setBcc}
                  placeholder={t('compose.addBccPlaceholder')}
                />
              </div>
            </div>
          )}

          {/* Recipient count warning */}
          {to.length + cc.length + bcc.length > 8 && (
            <div className="flex items-center gap-1.5 px-1 py-1 text-yellow-400/80 text-[11px]">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              {to.length + cc.length + bcc.length} alıcı — bazı sunucular toplu gönderimi sınırlayabilir
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-owl-text-secondary w-12">{t('compose.subjectLabel')}</label>
            <div className="flex-1 relative">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => { setSubjectFocused(true); setRecentSubjects(getRecentSubjects()); }}
                onBlur={() => setTimeout(() => setSubjectFocused(false), 150)}
                placeholder={t('compose.subjectPlaceholder')}
                maxLength={500}
                className="w-full px-3 py-2 bg-transparent text-owl-text placeholder-owl-text-secondary focus:outline-none"
              />
              {subjectFocused && !subject && recentSubjects.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-owl-surface border border-owl-border/60 rounded-xl shadow-owl-lg overflow-hidden">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-owl-text-secondary/50 font-semibold border-b border-owl-border/30">Son Konular</div>
                  {recentSubjects.slice(0, 6).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setSubject(s); setSubjectFocused(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-owl-text-secondary hover:bg-owl-surface-2/60 hover:text-owl-text transition-colors truncate"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAiSubject}
              disabled={isAiSubject}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-owl-accent/70 hover:text-owl-accent hover:bg-owl-accent/10 rounded-lg transition-colors disabled:opacity-40"
              title="AI ile konu öner"
            >
              {isAiSubject ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              )}
              ✨
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <RichTextEditor
            content={editorBodyHtml}
            onChange={(html) => setEditorBodyHtml(html)}
            onPaste={handleImagePaste}
            placeholder={t('compose.bodyPlaceholder')}
            disabled={isSending}
          />
          {/* Signature preview — rendered separately from editor for proper table/HTML layout */}
          {/* Signature — between message and quote */}
          {signatureHtml && (
            <div className="mx-6 mb-2 pt-2 border-t border-owl-border/30">
              <div
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizeForCompose(signatureHtml) }}
              />
            </div>
          )}
          {/* Quote — below signature */}
          {quoteHtml && (
            <div className="mx-6 mb-4 text-sm text-owl-text-secondary">
              <div dangerouslySetInnerHTML={{ __html: sanitizeForCompose(quoteHtml) }} />
            </div>
          )}
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className={`py-3 border-t border-owl-border ${mobile ? 'px-4' : 'px-6'}`}>
            <AttachmentList
              attachments={attachments}
              onRemove={handleRemoveAttachment}
            />
          </div>
        )}

        {/* Footer */}
        <div className={`border-t border-owl-border bg-owl-surface-2/50 flex items-center justify-between ${mobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <div className="flex items-center gap-2">
            {/* Priority selector */}
            <button
              onClick={() => setPriority(p => p === 'high' ? 'normal' : p === 'normal' ? 'low' : 'high')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                priority === 'high' ? 'text-red-400 border-red-400/40 bg-red-400/10' :
                priority === 'low' ? 'text-green-400 border-green-400/40 bg-green-400/10' :
                'text-owl-text-secondary/60 border-owl-border/50 hover:border-owl-border'
              }`}
              title={priority === 'high' ? 'Yüksek öncelik' : priority === 'low' ? 'Düşük öncelik' : 'Normal öncelik — tıkla değiştir'}
            >
              <span>{priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡'}</span>
              <span>{priority === 'high' ? 'Yüksek' : priority === 'low' ? 'Düşük' : 'Normal'}</span>
            </button>

            {/* Attach Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-owl-text-secondary hover:text-owl-text hover:bg-owl-surface rounded-lg transition-colors"
              title={t('compose.attachTooltip')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* AI Button */}
            <button
              className="p-2.5 text-owl-text-secondary hover:text-owl-accent hover:bg-owl-accent/10 rounded-lg transition-colors"
              title={t('compose.aiTooltip')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>

            {/* Template Button */}
            <button
              onClick={() => setShowTemplateSelector(true)}
              className="p-2.5 text-owl-text-secondary hover:text-owl-primary hover:bg-owl-primary/10 rounded-lg transition-colors"
              title={t('compose.templateTooltip')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!mobile && (() => {
              const bodyText = editorBodyHtml.replace(/<[^>]*>/g, '').trim();
              const words = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
              const chars = bodyText.length;
              if (words === 0) return null;
              return (
                <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="text-owl-text-secondary/50">{words} kelime · {chars} karakter</span>
                  {chars > 10000 && (
                    <span className="text-yellow-400/80 font-medium flex items-center gap-0.5" title="Email çok uzun — bazı istemciler kısaltabilir">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                      Uzun
                    </span>
                  )}
                </span>
              );
            })()}
            {!mobile && (
              <span className="text-xs text-owl-text-secondary">
                <kbd className="px-1.5 py-0.5 bg-owl-surface border border-owl-border rounded text-[10px]">Ctrl+Enter</kbd> {t('compose.ctrlEnterSend')}
              </span>
            )}

            {/* AI Rewrite */}
            {prevBodyHtml !== null && (
              <button
                onClick={() => { setEditorBodyHtml(prevBodyHtml); setPrevBodyHtml(null); }}
                className="px-2.5 py-2 text-xs text-owl-accent border border-owl-accent/40 hover:bg-owl-accent/10 rounded-lg transition-colors font-medium"
                title="Geri Al — önceki versiyona dön"
              >↩ Geri Al</button>
            )}
            <div className="relative">
              <button
                onClick={() => { setShowRewriteMenu(p => !p); setShowAiCompose(false); setShowSchedulePicker(false); }}
                disabled={isRewriting}
                className="p-2.5 text-owl-text-secondary hover:text-owl-accent hover:bg-owl-accent/10 rounded-lg transition-colors border border-owl-border/50 relative"
                title="Metni yeniden yaz"
              >
                {isRewriting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                )}
                <span className="absolute -top-1 -right-1 text-[8px] leading-none text-owl-accent font-bold">AI</span>
              </button>
              {showRewriteMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-owl-surface border border-owl-border/60 rounded-xl shadow-owl-lg py-1 z-50 animate-scale-in" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-1.5 text-[10px] text-owl-text-secondary/50 font-semibold uppercase tracking-wider">Yeniden Yaz</div>
                  {REWRITE_STYLES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleAiRewrite(s.id)}
                      className="w-full text-left px-3 py-2 text-sm text-owl-text hover:bg-owl-accent/10 hover:text-owl-accent transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* AI Full Compose */}
            <div className="relative">
              <button
                onClick={() => { setShowAiCompose(p => !p); setShowSchedulePicker(false); setShowRewriteMenu(false); }}
                disabled={isAiComposing}
                className="p-2.5 text-owl-text-secondary hover:text-owl-accent hover:bg-owl-accent/10 rounded-lg transition-colors border border-owl-border/50 relative"
                title="AI ile yaz"
              >
                {isAiComposing ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                )}
                <span className="absolute -top-1 -right-1 text-[8px] leading-none text-owl-accent font-bold">AI</span>
              </button>
              {showAiCompose && (
                <div className="absolute bottom-full right-0 mb-2 w-72 bg-owl-surface border border-owl-border/60 rounded-xl shadow-owl-lg p-3 z-50 animate-scale-in" onClick={e => e.stopPropagation()}>
                  <div className="text-[11px] text-owl-text-secondary/60 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="text-owl-accent">✨</span> AI ile Email Yaz
                  </div>
                  <textarea
                    autoFocus
                    placeholder="Ne hakkında email yazayım? (örn: toplantı talebi, teşekkür mesajı, bilgi isteği...)"
                    value={aiComposePrompt}
                    onChange={e => setAiComposePrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAiCompose(); } if (e.key === 'Escape') setShowAiCompose(false); }}
                    rows={3}
                    className="w-full bg-owl-bg text-owl-text text-sm rounded-lg px-3 py-2 border border-owl-border/60 focus:border-owl-accent/50 focus:outline-none mb-2 resize-none placeholder-owl-text-secondary/40"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAiCompose}
                      disabled={!aiComposePrompt.trim() || isAiComposing}
                      className="flex-1 py-2 bg-owl-accent/90 hover:bg-owl-accent disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isAiComposing ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : '✨'}
                      {isAiComposing ? 'Yazıyor...' : 'Yaz'}
                    </button>
                    <button onClick={() => setShowAiCompose(false)} className="px-3 py-2 text-sm text-owl-text-secondary hover:text-owl-text hover:bg-owl-bg rounded-lg transition-colors">İptal</button>
                  </div>
                  <p className="text-[10px] text-owl-text-secondary/40 mt-1.5">Ctrl+Enter ile gönder</p>
                </div>
              )}
            </div>

            {/* Schedule Send */}
            {onSchedule && (
              <div className="relative">
                <button
                  onClick={() => { setShowSchedulePicker(p => !p); setShowAiCompose(false); setShowRewriteMenu(false); }}
                  disabled={isSending}
                  className="p-2.5 text-owl-text-secondary hover:text-owl-accent hover:bg-owl-accent/10 rounded-lg transition-colors border border-owl-border/50"
                  title="Zamanlanmış gönder"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </button>
                {showSchedulePicker && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-owl-surface border border-owl-border/60 rounded-xl shadow-owl-lg p-3 z-50 animate-scale-in">
                    <div className="text-[11px] text-owl-text-secondary/60 font-semibold uppercase tracking-wider mb-2">Zamanla</div>
                    <input
                      type="datetime-local"
                      value={scheduleDateTime}
                      onChange={(e) => setScheduleDateTime(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0,16)}
                      className="w-full bg-owl-bg text-owl-text text-sm rounded-lg px-3 py-2 border border-owl-border/60 focus:border-owl-accent/50 focus:outline-none mb-2"
                    />
                    <button
                      onClick={() => { handleScheduleSend(); setShowSchedulePicker(false); }}
                      disabled={!scheduleDateTime}
                      className="w-full py-2 bg-owl-accent/90 hover:bg-owl-accent disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Zamanla
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Templates */}
            <div className="relative">
              <button
                onClick={() => { setShowQuickTpls(p => !p); setQuickTplSaving(false); setShowAiCompose(false); setShowRewriteMenu(false); setShowSchedulePicker(false); }}
                className="p-2.5 text-owl-text-secondary hover:text-owl-accent hover:bg-owl-accent/10 rounded-lg transition-colors border border-owl-border/50"
                title="Hızlı şablonlar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </button>
              {showQuickTpls && (
                <div className="absolute bottom-full right-0 mb-2 w-72 bg-owl-surface border border-owl-border/60 rounded-xl shadow-owl-lg z-50 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="px-3 pt-2.5 pb-2 border-b border-owl-border/40 flex items-center justify-between">
                    <span className="text-[11px] text-owl-text-secondary/60 font-semibold uppercase tracking-wider">📄 Hızlı Şablonlar</span>
                    <button
                      onClick={() => { setQuickTplSaving(true); setQuickTplName(subject || 'Şablon'); }}
                      className="text-[11px] text-owl-accent hover:text-owl-accent/80 font-medium"
                    >+ Mevcut Taslağı Kaydet</button>
                  </div>
                  {quickTplSaving && (
                    <div className="px-3 py-2 border-b border-owl-border/30 bg-owl-bg/50">
                      <input
                        autoFocus
                        type="text"
                        value={quickTplName}
                        onChange={e => setQuickTplName(e.target.value)}
                        placeholder="Şablon adı…"
                        className="w-full text-xs bg-owl-bg border border-owl-border/60 rounded px-2 py-1 text-owl-text focus:border-owl-accent/50 focus:outline-none mb-1.5"
                        onKeyDown={e => { if (e.key === 'Enter') { const tpl: QuickTemplate = { id: Date.now().toString(), name: quickTplName || 'Şablon', subject: subject, body: editorBodyHtml }; saveQuickTemplate(tpl); setQuickTpls(getQuickTemplates()); setQuickTplSaving(false); } if (e.key === 'Escape') setQuickTplSaving(false); }}
                      />
                      <div className="flex gap-1">
                        <button onClick={() => { const tpl: QuickTemplate = { id: Date.now().toString(), name: quickTplName || 'Şablon', subject: subject, body: editorBodyHtml }; saveQuickTemplate(tpl); setQuickTpls(getQuickTemplates()); setQuickTplSaving(false); }} className="flex-1 text-xs py-1 bg-owl-accent text-white rounded hover:bg-owl-accent/80 transition-colors">Kaydet</button>
                        <button onClick={() => setQuickTplSaving(false)} className="text-xs px-2 py-1 text-owl-text-secondary hover:text-owl-text rounded border border-owl-border/50 transition-colors">İptal</button>
                      </div>
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto py-1">
                    {quickTpls.length === 0 ? (
                      <div className="text-center py-4 text-[12px] text-owl-text-secondary/50">Henüz şablon yok</div>
                    ) : quickTpls.map(tpl => (
                      <div key={tpl.id} className="flex items-center gap-1 px-2 py-1 hover:bg-owl-bg group">
                        <button
                          onClick={() => { if (tpl.subject) setSubject(tpl.subject); setEditorBodyHtml(tpl.body); setShowQuickTpls(false); }}
                          className="flex-1 text-left"
                        >
                          <div className="text-xs text-owl-text font-medium truncate">{tpl.name}</div>
                          <div className="text-[11px] text-owl-text-secondary/50 truncate">{tpl.subject || '(konu yok)'}</div>
                        </button>
                        <button onClick={() => { deleteQuickTemplate(tpl.id); setQuickTpls(getQuickTemplates()); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-all">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* BCC Self toggle */}
            <button
              onClick={() => { const next = !bccSelf; setBccSelf(next); localStorage.setItem('owlmail-bcc-self', next ? '1' : '0'); }}
              className={`p-2.5 rounded-lg border transition-colors text-[11px] font-semibold ${bccSelf ? 'border-owl-accent/50 text-owl-accent bg-owl-accent/10' : 'border-owl-border/50 text-owl-text-secondary/50 hover:border-owl-border hover:text-owl-text-secondary'}`}
              title={bccSelf ? "Kendine BCC — aktif" : "Kendine BCC ekle"}
            >BCC</button>

            {/* Gönder ve Arşivle (reply/replyAll only) */}
            {(mode === 'reply' || mode === 'replyAll') && onArchiveOriginal && (
              <button
                onClick={() => { archiveAfterSendRef.current = true; handleSend(); }}
                disabled={isSending || to.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-owl-border/50 text-owl-text-secondary hover:bg-owl-surface-2 hover:text-owl-text rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Gönder ve orijinal emaili arşivle"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"/></svg>
              </button>
            )}

            <button
              onClick={handleSend}
              disabled={isSending || to.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-owl-accent hover:bg-owl-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isSending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('compose.sending')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {t('compose.send')}
                </>
              )}
            </button>
          </div>
        </div>
        {/* Resize handle — bottom-right corner */}
        {!mobile && (
          <div
            onPointerDown={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{ touchAction: 'none' }}
          >
            <svg className="w-4 h-4 text-owl-text-secondary/30" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 16H16V14H14V16ZM10 16H12V14H10V16ZM14 12H16V10H14V12Z" />
            </svg>
          </div>
        )}
      </div>

      {/* Template Selector Modal */}
      {showTemplateSelector && defaultAccount && (
        <TemplateSelector
          accountId={defaultAccount.id}
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </div>
  );
}

export default Compose;

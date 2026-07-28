// ============================================================================
// OwlMail - AI Settings Component (Multi-Provider)
// ============================================================================

import { useState } from 'react';
import type { Settings } from '../../types';
import { useTranslation } from '../../i18n';
import { PROVIDERS, getEffectiveProvider, type AIProvider } from '../../services/aiService';
import { HOME_AI_URL } from '../../config/homeServer';

interface AISettingsProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function AISettings({ settings, onSettingsChange }: AISettingsProps) {
  const { t } = useTranslation();
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [ollamaDetail, setOllamaDetail] = useState('');

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const activeProvider = getEffectiveProvider(settings);
  const providerInfo = PROVIDERS[activeProvider];
  const apiKey = settings.aiApiKey || settings.geminiApiKey || '';

  // Authenticated end-to-end probe: reports *why* it failed (401 vs network)
  // rather than just a red dot.
  const checkOllama = async () => {
    setOllamaStatus('checking');
    setOllamaDetail('');
    try {
      const { diagnose } = await import('../../services/mcpService');
      const result = await diagnose();
      setOllamaStatus(result.ok ? 'connected' : 'error');
      setOllamaDetail(result.detail);
    } catch (err) {
      setOllamaStatus('error');
      setOllamaDetail(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-owl-text">{t('settings.aiSettings.title')}</h2>
        <p className="text-owl-text-secondary mt-1">{t('settings.aiSettings.subtitle')}</p>
      </div>

      {/* ─── Provider Selection ─── */}
      <section className="bg-owl-surface border border-owl-border rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-medium text-owl-text mb-4">{t('settings.aiSettings.providerTitle')}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(PROVIDERS) as [AIProvider, typeof PROVIDERS[AIProvider]][]).map(([id, info]) => {
            const isActive = activeProvider === id;

            return (
              <button
                key={id}
                onClick={() => updateSetting('aiProvider', id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  isActive
                    ? 'border-owl-accent bg-owl-accent/5'
                    : 'border-owl-border hover:border-owl-accent/40 hover:bg-owl-surface-2'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-owl-text">{info.name}</span>
                  {isActive && (
                    <span className="text-[10px] font-semibold text-owl-accent bg-owl-accent/15 px-1.5 py-0.5 rounded-full">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-owl-text-secondary">{info.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── API Key / Connection ─── */}
      {providerInfo.requiresApiKey ? (
        <section className="bg-owl-surface border border-owl-border rounded-xl p-4 sm:p-6">
          <h3 className="text-lg font-medium text-owl-text mb-4">
            {providerInfo.name} API Key
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-owl-text">{t('settings.aiSettings.apiKeyLabel')}</label>
              <p className="text-xs text-owl-text-secondary mt-0.5 mb-2">
                {t('settings.aiSettings.apiKeyHelp')}
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    updateSetting('aiApiKey', e.target.value);
                    // Also update legacy field for backward compat
                    if (activeProvider === 'gemini') {
                      updateSetting('geminiApiKey', e.target.value);
                    }
                  }}
                  placeholder={providerInfo.apiKeyPlaceholder}
                  className="flex-1 px-4 py-2 bg-owl-bg border border-owl-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-accent text-sm text-owl-text"
                />
                {providerInfo.apiKeyUrl && (
                  <a
                    href={providerInfo.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-owl-accent hover:bg-owl-accent-hover text-white text-sm rounded-lg transition-colors whitespace-nowrap"
                  >
                    {t('settings.aiSettings.getApiKey')}
                  </a>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              {apiKey ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-500">{t('settings.aiSettings.apiKeySet')}</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-sm text-yellow-500">{t('settings.aiSettings.apiKeyNotSet')}</span>
                </>
              )}
            </div>
          </div>
        </section>
      ) : activeProvider === 'ollama' ? (
        <section className="bg-owl-surface border border-owl-border rounded-xl p-4 sm:p-6">
          <h3 className="text-lg font-medium text-owl-text mb-1">Claude Code Bridge</h3>
          <p className="text-xs text-owl-text-secondary mb-4">
            Kendi ev sunucunuzdaki köprü üzerinden Claude Code aboneliğinizi kullanır —
            API anahtarı gerekmez, kullandıkça ödeme yoktur.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-owl-text">Server URL</label>
              <input
                type="text"
                value={settings.ollamaUrl || HOME_AI_URL}
                onChange={(e) => updateSetting('ollamaUrl', e.target.value)}
                placeholder={HOME_AI_URL}
                className="mt-1 w-full px-4 py-2 bg-owl-bg border border-owl-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-accent text-sm text-owl-text"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-owl-text">Model</label>
              {/* A dropdown, not free text: the bridge only accepts these
                  aliases and a typo here silently breaks every AI feature. */}
              <select
                value={providerInfo.models.includes(settings.ollamaModel) ? settings.ollamaModel : providerInfo.defaultModel}
                onChange={(e) => updateSetting('ollamaModel', e.target.value)}
                className="mt-1 w-full px-4 py-2 bg-owl-bg border border-owl-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-accent text-sm text-owl-text"
              >
                {providerInfo.models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <p className="text-xs text-owl-text-secondary mt-1">
                Claude Code abonelik modelleri — varsayılan {providerInfo.defaultModel}.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={checkOllama}
                disabled={ollamaStatus === 'checking'}
                className="px-4 py-2 bg-owl-accent hover:bg-owl-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {ollamaStatus === 'checking' ? 'Checking...' : 'Test Connection'}
              </button>
              {ollamaStatus === 'connected' && (
                <span className="flex items-center gap-1.5 text-sm text-green-500">
                  <div className="w-2 h-2 rounded-full bg-green-500" /> Connected
                </span>
              )}
              {ollamaStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-sm text-red-400">
                  <div className="w-2 h-2 rounded-full bg-red-500" /> Bağlantı başarısız
                </span>
              )}
            </div>

            {ollamaDetail && (
              <p className={`text-xs ${ollamaStatus === 'error' ? 'text-red-400' : 'text-owl-text-secondary'}`}>
                {ollamaDetail}
              </p>
            )}
          </div>
        </section>
      ) : null}

      {/* ─── Model Selection (for cloud providers) ─── */}
      {activeProvider !== 'ollama' && (
        <section className="bg-owl-surface border border-owl-border rounded-xl p-4 sm:p-6">
          <h3 className="text-lg font-medium text-owl-text mb-4">{t('settings.aiSettings.modelTitle')}</h3>

          <div>
            <label className="text-sm font-medium text-owl-text">Model</label>
            <select
              value={settings.aiModel || providerInfo.defaultModel}
              onChange={(e) => updateSetting('aiModel', e.target.value)}
              className="mt-1 w-full px-4 py-2 bg-owl-bg border border-owl-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-accent text-sm text-owl-text appearance-none cursor-pointer"
            >
              {providerInfo.models.map(m => (
                <option key={m} value={m} className="bg-owl-bg text-owl-text">
                  {m}{m === providerInfo.defaultModel ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* ─── AI Features ─── */}
      <section className="bg-owl-surface border border-owl-border rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-medium text-owl-text mb-4">{t('settings.aiSettings.features')}</h3>

        <div className="space-y-4">
          {/* Reply Tone */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-owl-text">{t('settings.aiSettings.replyTone')}</label>
              <p className="text-xs text-owl-text-secondary mt-0.5">{t('settings.aiSettings.replyToneDesc')}</p>
            </div>
            <select
              value={settings.aiReplyTone}
              onChange={(e) => updateSetting('aiReplyTone', e.target.value as Settings['aiReplyTone'])}
              className="px-4 py-2 bg-owl-bg border border-owl-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-accent text-sm text-owl-text appearance-none cursor-pointer"
            >
              <option value="professional">{t('settings.aiSettings.professional')}</option>
              <option value="friendly">{t('settings.aiSettings.friendly')}</option>
              <option value="formal">{t('settings.aiSettings.formal')}</option>
              <option value="casual">{t('settings.aiSettings.casual')}</option>
            </select>
          </div>

          {/* Auto Summarize */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-owl-text">{t('settings.aiSettings.autoSummarize')}</label>
              <p className="text-xs text-owl-text-secondary mt-0.5">{t('settings.aiSettings.autoSummarizeDesc')}</p>
            </div>
            <Toggle enabled={settings.aiAutoSummarize} onChange={(v) => updateSetting('aiAutoSummarize', v)} />
          </div>

          {/* Auto Phishing Detection */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-owl-text">{t('settings.aiSettings.autoPhishing')}</label>
              <p className="text-xs text-owl-text-secondary mt-0.5">{t('settings.aiSettings.autoPhishingDesc')}</p>
            </div>
            <Toggle enabled={settings.autoPhishingDetection} onChange={(v) => updateSetting('autoPhishingDetection', v)} />
          </div>
        </div>
      </section>

      {/* Privacy Note */}
      <section className="bg-owl-surface border border-owl-border rounded-xl p-4 sm:p-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-owl-accent flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-owl-accent">{t('settings.aiSettings.privacyNote')}</p>
            <p className="text-xs text-owl-text-secondary mt-1">
              {activeProvider === 'ollama'
                ? 'Ollama runs 100% locally — no data ever leaves your device.'
                : `Email content is sent to ${providerInfo.name} for AI processing. No data is stored by the provider.`}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Toggle switch component
function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled ? 'bg-owl-accent' : 'bg-owl-surface-2 border border-owl-border'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
          enabled ? 'translate-x-6 bg-white' : 'translate-x-1 bg-owl-text-secondary'
        }`}
      />
    </button>
  );
}

export default AISettings;

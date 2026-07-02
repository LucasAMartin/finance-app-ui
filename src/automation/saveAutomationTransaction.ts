import { inferExpenseCategory } from '../voice/parseVoiceExpense';
import type { AppSettings, Category, SettingsRepo, Transaction, TransactionsRepo } from '../repositories/types';
import { categoryMap } from '../repositories/categoryUtils';
import {
  parseTransactionIntake,
  transactionAutomationFingerprint,
  type TransactionIntakeDraft,
  type TransactionIntakeSource,
} from './parseTransactionIntake';
import { normalizeTransactionDraft } from './normalizeTransaction';

export type AutomationSaveStatus = 'saved' | 'duplicate';

export interface SaveAutomationTransactionResult {
  status: AutomationSaveStatus;
  draft: TransactionIntakeDraft;
  transaction?: Transaction;
  duplicate?: Transaction;
  settingsMeta: Record<string, unknown> | undefined;
}

export interface SaveAutomationTransactionOptions {
  background?: boolean;
  initialDraft?: TransactionIntakeDraft;
  ledgerId?: string;
  createdByUserId?: string;
}

export interface SaveAutomationTransactionDeps {
  settings?: AppSettings;
  settingsRepo: SettingsRepo;
  transactionsRepo: TransactionsRepo;
  transactions: Transaction[];
  categories: Category[];
}

function normalizedMerchant(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sameCents(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function metaString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function generateAutomationInstallationId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `install_${Date.now().toString(36)}_${random}`;
}

export function cleanMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const next = { ...meta };
  Object.keys(next).forEach(key => {
    if (next[key] === undefined) delete next[key];
  });
  return next;
}

export function likelyDuplicate(rows: Transaction[], draft: TransactionIntakeDraft): Transaction | undefined {
  const fingerprint = transactionAutomationFingerprint(draft);
  if (fingerprint) {
    const exact = rows.find(tx => tx.type !== 'income' && tx.meta?.automationFingerprint === fingerprint);
    if (exact) return exact;
  }

  const draftTime = draft.occurredAt ? new Date(draft.occurredAt).getTime() : Date.now();
  const merchant = normalizedMerchant(draft.merchant);
  return rows.find(tx => {
    if (tx.type === 'income') return false;
    if (!sameCents(tx.amount, draft.amount)) return false;
    if (merchant && normalizedMerchant(tx.merchant) !== merchant) return false;
    const txCard = metaString(tx.meta?.cardLast4);
    if (draft.cardLast4 && txCard && draft.cardLast4 !== txCard) return false;
    const txTime = tx.occurredAt ? new Date(tx.occurredAt).getTime() : draftTime;
    return Math.abs(txTime - draftTime) <= 5 * 60 * 1000;
  });
}

export function automationMetaPrefix(source: TransactionIntakeSource): string | undefined {
  if (source === 'wallet') return 'applePayAutomation';
  if (source === 'sms') return 'textAutomation';
  return undefined;
}

export function automationFallbackMerchant(source: TransactionIntakeSource): string {
  if (source === 'wallet') return 'Apple Pay';
  if (source === 'sms') return 'Text alert';
  return 'Automation';
}

export function automationDisplaySource(source: TransactionIntakeSource): string {
  if (source === 'wallet') return 'Apple Pay';
  if (source === 'sms') return 'text alert';
  return 'automation';
}

function looksLikeUntrimmedSmsMerchant(merchant: string): boolean {
  return /\b(?:no\s+action\s+needed|see\s+it|reply\s+stop|text\s+stop|msg\s*&?\s*data|https?:\/\/)\b/i.test(merchant)
    || /\s+on\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}\b/i.test(merchant);
}

export function repairSmsDraftBeforeSave(draft: TransactionIntakeDraft): TransactionIntakeDraft {
  if (draft.source !== 'sms' || !draft.rawText || !looksLikeUntrimmedSmsMerchant(draft.merchant)) {
    return draft;
  }

  const reparsed = parseTransactionIntake(draft.rawText, 'sms');
  if (!reparsed?.merchant || looksLikeUntrimmedSmsMerchant(reparsed.merchant)) {
    return draft;
  }

  return {
    ...draft,
    merchant: reparsed.merchant,
    rawDescriptor: reparsed.rawDescriptor ?? draft.rawDescriptor,
    normalizedDescriptor: reparsed.normalizedDescriptor ?? draft.normalizedDescriptor,
    processorName: reparsed.processorName ?? draft.processorName,
    merchantCandidates: reparsed.merchantCandidates ?? draft.merchantCandidates,
    confidence: Math.max(draft.confidence, reparsed.confidence),
  };
}

export function automationRunMeta(
  currentMeta: Record<string, unknown> | undefined,
  status: 'saved' | 'duplicate' | 'review' | 'failed' | 'ignored' | 'queued',
  draft: TransactionIntakeDraft,
  options: { transactionId?: string; error?: string; background?: boolean } = {},
): Record<string, unknown> {
  const prefix = automationMetaPrefix(draft.source);
  if (!prefix) return currentMeta ?? {};

  const occurredAt = draft.occurredAt ?? new Date().toISOString();
  const fingerprint = transactionAutomationFingerprint({ ...draft, occurredAt });
  const nextMeta: Record<string, unknown> = {
    ...(currentMeta ?? {}),
    [`${prefix}LastStatus`]: status,
    [`${prefix}LastRunAt`]: new Date().toISOString(),
    [`${prefix}LastMerchant`]: draft.merchant || automationFallbackMerchant(draft.source),
    [`${prefix}LastAmount`]: draft.amount > 0 ? draft.amount : undefined,
    [`${prefix}LastOccurredAt`]: occurredAt,
    [`${prefix}LastFingerprint`]: fingerprint,
    [`${prefix}LastTransactionId`]: options.transactionId,
    [`${prefix}LastError`]: options.error,
    [`${prefix}LastBackground`]: options.background === true,
  };

  nextMeta[`${prefix}LastReplayText`] = draft.rawText;
  nextMeta[`${prefix}LastReplayAmount`] = draft.amount;
  nextMeta[`${prefix}LastReplayMerchant`] = draft.merchant;
  nextMeta[`${prefix}LastReplayOccurredAt`] = occurredAt;
  nextMeta[`${prefix}LastReplayCategory`] = draft.cat;
  nextMeta[`${prefix}LastReplayCardLast4`] = draft.cardLast4;

  Object.keys(nextMeta).forEach(key => {
    if (nextMeta[key] === undefined) delete nextMeta[key];
  });
  return nextMeta;
}

export async function saveAutomationTransaction(
  inputDraft: TransactionIntakeDraft,
  deps: SaveAutomationTransactionDeps,
  options: SaveAutomationTransactionOptions = {},
): Promise<SaveAutomationTransactionResult> {
  const currentSettings = deps.settingsRepo.get('settings') ?? deps.settings;
  const existingInstallationId = metaString(currentSettings?.meta?.transactionNormalizationInstallationId);
  const installationId = existingInstallationId ?? generateAutomationInstallationId();
  const baseSettingsMeta = existingInstallationId
    ? currentSettings?.meta
    : { ...(currentSettings?.meta ?? {}), transactionNormalizationInstallationId: installationId };

  if (!existingInstallationId) {
    deps.settingsRepo.update('settings', { meta: baseSettingsMeta });
  }

  const normalization = await normalizeTransactionDraft(inputDraft, installationId, {
    cache: baseSettingsMeta?.transactionNormalizationCache,
  });

  const settingsMetaWithCache = normalization.nextCache
    ? { ...(baseSettingsMeta ?? {}), transactionNormalizationCache: normalization.nextCache }
    : baseSettingsMeta;
  const draft = repairSmsDraftBeforeSave(normalization.draft);
  const duplicate = likelyDuplicate(deps.transactions, draft);
  if (duplicate) {
    const meta = automationRunMeta(settingsMetaWithCache, 'duplicate', draft, {
      transactionId: duplicate.id,
      background: options.background,
    });
    deps.settingsRepo.update('settings', { meta });
    return { status: 'duplicate', draft, duplicate, settingsMeta: meta };
  }

  const cats = categoryMap(deps.categories);
  const cat = cats[draft.cat] ? draft.cat : deps.categories[0]?.id ?? 'shopping';
  const rawMerchant = draft.merchant.trim();
  const merchant = rawMerchant || cats[cat]?.label || automationFallbackMerchant(draft.source);
  const occurredAt = draft.occurredAt ?? new Date().toISOString();
  const automationFingerprint = transactionAutomationFingerprint({
    ...draft,
    merchant,
    occurredAt,
  });
  const initialDraft = options.initialDraft ?? inputDraft;
  const tx = deps.transactionsRepo.create({
    amount: draft.amount,
    cat,
    merchant,
    note: draft.note,
    occurredAt,
    type: 'expense',
    visibility: 'shared',
    ledgerId: options.ledgerId,
    createdByUserId: options.createdByUserId ?? 'local',
    updatedByUserId: options.createdByUserId ?? 'local',
    meta: cleanMeta({
      merchantSource: rawMerchant ? 'automation' : 'fallback',
      automationSource: draft.source,
      automationConfidence: draft.confidence,
      cardLast4: draft.cardLast4,
      automationOccurredAt: occurredAt,
      automationFingerprint,
      rawDescriptor: draft.rawDescriptor,
      normalizedDescriptor: draft.normalizedDescriptor,
      processorName: draft.processorName,
      normalizationStatus: normalization.status,
      normalizationProvider: normalization.provider,
      normalizationDomain: normalization.domain,
      normalizationProviderCategories: normalization.providerCategories,
      normalizationError: normalization.errorCode,
      normalizationReason: normalization.normalizationReason,
      normalizationCacheHit: normalization.cacheHit,
      normalizationCacheKey: normalization.cacheKey,
      localParsedMerchant: initialDraft.merchant !== merchant ? initialDraft.merchant : undefined,
      backgroundImported: options.background === true,
    }),
  });

  const meta = automationRunMeta(settingsMetaWithCache, 'saved', { ...draft, merchant, occurredAt }, {
    transactionId: tx.id,
    background: options.background,
  });
  deps.settingsRepo.update('settings', { meta });
  return { status: 'saved', draft: { ...draft, merchant, occurredAt }, transaction: tx, settingsMeta: meta };
}

export function draftFromAutomationHints(input: {
  source: TransactionIntakeSource;
  rawText?: string;
  amountHint?: number;
  merchantHint?: string;
  categoryHint?: string;
  occurredAtHint?: string;
  cardLast4Hint?: string;
}): TransactionIntakeDraft | null {
  const parsed = input.rawText ? parseTransactionIntake(input.rawText, input.source) : null;
  if (parsed) {
    if (input.source === 'wallet') {
      const merchant = input.merchantHint?.trim() || parsed.merchant || '';
      const amount = input.amountHint && input.amountHint > 0 ? input.amountHint : parsed.amount;
      if (!amount || amount <= 0) return null;
      return {
        ...parsed,
        amount,
        merchant,
        cat: input.categoryHint || parsed.cat || inferExpenseCategory(`${merchant} ${input.rawText ?? ''}`),
        cardLast4: input.cardLast4Hint ?? parsed.cardLast4,
        occurredAt: input.occurredAtHint ?? parsed.occurredAt,
        confidence: Math.max(parsed.confidence, input.merchantHint || input.amountHint ? 0.92 : parsed.confidence),
      };
    }

    const merchant = parsed.merchant || input.merchantHint?.trim() || '';
    return {
      ...parsed,
      amount: parsed.amount > 0 ? parsed.amount : input.amountHint ?? parsed.amount,
      merchant,
      cat: parsed.cat || inferExpenseCategory(`${merchant} ${input.rawText ?? ''}`),
      cardLast4: parsed.cardLast4 ?? input.cardLast4Hint,
      occurredAt: parsed.occurredAt ?? input.occurredAtHint,
      confidence: Math.max(parsed.confidence, input.merchantHint || input.amountHint ? 0.9 : parsed.confidence),
    };
  }

  if (!input.amountHint || input.amountHint <= 0) return null;
  if (input.source === 'sms') return null;

  const merchant = input.merchantHint?.trim() ?? '';
  return {
    amount: input.amountHint,
    merchant,
    cat: input.categoryHint || inferExpenseCategory(`${merchant} ${input.rawText ?? ''}`),
    source: input.source,
    note: input.source === 'wallet' ? 'Imported from Wallet shortcut' : 'Imported from automation',
    cardLast4: input.cardLast4Hint,
    occurredAt: input.occurredAtHint,
    rawText: input.rawText,
    confidence: merchant ? 0.9 : 0.55,
  };
}

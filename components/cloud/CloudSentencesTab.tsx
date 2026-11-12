// The cloud window's sentence bank tab (moved out of CloudManagerModal, F7).
import type { CloudManagerTab } from '../CloudManagerModal';
import React from 'react';
import { Trash2 } from 'lucide-react';
import { CEFRLevel, QuestionType, SoundEffect } from '../../types';
import { CEFR_LEVELS, GRAMMAR_TOPICS } from '../../constants';
import ActionButton from '../ActionButton';
import { CloudCuratedSentence } from '../../services/firebaseService';
import { isGapType, isOptionType, questionTypeLabel } from '../../game/questionTypes';

export interface CloudSentencesTabProps {
  activeTab: CloudManagerTab;
  cardCls: "p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.12]";
  staticCounts: { binaryCount: number; clozeCount: number; wordFormationCount: number; keyWordTransformationCount: number; totalCount: number; };
  sentences: CloudCuratedSentence[];
  handleSeedBuiltInToCloud: () => Promise<void>;
  playSound: (sound: SoundEffect) => void;
  missingBuiltInSeedCount: number;
  isSeedingBuiltIn: boolean;
  isBatchGenerating: boolean;
  seedProgress: { done: number; total: number; };
  batchTopic: string;
  setBatchTopic: React.Dispatch<React.SetStateAction<string>>;
  inputCls: "w-full h-11 px-3 rounded-gc-sm border border-gc-line/[0.2] bg-gc-bg/60 text-gc-body text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30";
  batchLevel: CEFRLevel;
  setBatchLevel: React.Dispatch<React.SetStateAction<CEFRLevel>>;
  batchFormat: QuestionType;
  setBatchFormat: React.Dispatch<React.SetStateAction<QuestionType>>;
  batchCount: number;
  setBatchCount: React.Dispatch<React.SetStateAction<number>>;
  handleBatchGenerateWithAi: () => Promise<void>;
  batchProgress: { done: number; total: number; };
  sentenceSearch: string;
  setSentenceSearch: React.Dispatch<React.SetStateAction<string>>;
  sentenceTopicFilter: string;
  setSentenceTopicFilter: React.Dispatch<React.SetStateAction<string>>;
  sentenceLevelFilter: string;
  setSentenceLevelFilter: React.Dispatch<React.SetStateAction<string>>;
  sentenceFormatFilter: string;
  setSentenceFormatFilter: React.Dispatch<React.SetStateAction<string>>;
  filteredSentences: CloudCuratedSentence[];
  confirmDeleteSentenceId: string;
  handleDeleteSentence: (sentenceId: string) => Promise<void>;
  setConfirmDeleteSentenceId: React.Dispatch<React.SetStateAction<string>>;
}

export function CloudSentencesTab({
  activeTab,
  cardCls,
  staticCounts,
  sentences,
  handleSeedBuiltInToCloud,
  playSound,
  missingBuiltInSeedCount,
  isSeedingBuiltIn,
  isBatchGenerating,
  seedProgress,
  batchTopic,
  setBatchTopic,
  inputCls,
  batchLevel,
  setBatchLevel,
  batchFormat,
  setBatchFormat,
  batchCount,
  setBatchCount,
  handleBatchGenerateWithAi,
  batchProgress,
  sentenceSearch,
  setSentenceSearch,
  sentenceTopicFilter,
  setSentenceTopicFilter,
  sentenceLevelFilter,
  setSentenceLevelFilter,
  sentenceFormatFilter,
  setSentenceFormatFilter,
  filteredSentences,
  confirmDeleteSentenceId,
  handleDeleteSentence,
  setConfirmDeleteSentenceId,
}: CloudSentencesTabProps) {

  return (
    <>
      {activeTab === 'sentences' && (
        <div className="space-y-4">
          <div className={`${cardCls} space-y-3.5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-gc-body font-bold text-gc-ink">
                  Auto-growing Cloud &amp; Offline sentence bank
                </h3>
                <p className="text-gc-small text-gc-quiet">
                  Uses incremental delta-syncing so large banks of 1,000+ sentences cost almost zero daily Firestore reads.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="h-7 px-3 inline-flex items-center rounded-full bg-gc-line/[0.08] text-gc-cap font-bold text-gc-ink tabular-nums"
                  title={`Right/Wrong: ${staticCounts.binaryCount} · MC/Open Cloze: ${staticCounts.clozeCount} · Word Form: ${staticCounts.wordFormationCount} · Key Word: ${staticCounts.keyWordTransformationCount}`}
                >
                  Built-in Offline: {staticCounts.totalCount}
                </span>
                <span className="h-7 px-3 inline-flex items-center rounded-full bg-gc-win/15 border border-gc-win/30 text-gc-cap font-bold text-gc-win tabular-nums">
                  Firestore Cloud: {sentences.length}
                </span>
              </div>
            </div>

            {/* Format Breakdown & One-Click Cloud Seeder */}
            <div className="pt-2.5 border-t border-gc-line/[0.1] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 text-gc-cap text-gc-quiet tabular-nums">
                <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                  ⚖️ Binary: <strong>{staticCounts.binaryCount}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                  🔠/✍️ Cloze: <strong>{staticCounts.clozeCount}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                  🧬 Word Form: <strong>{staticCounts.wordFormationCount}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-gc-bg/60 border border-gc-line/[0.12]">
                  🔑 Key Word: <strong>{staticCounts.keyWordTransformationCount}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  type="button"
                  onClick={handleSeedBuiltInToCloud}
                  playSound={playSound}
                  variant={missingBuiltInSeedCount > 0 ? 'primary' : 'ghost'}
                  disabled={isSeedingBuiltIn || isBatchGenerating || missingBuiltInSeedCount === 0}
                  className="h-9 px-3.5 text-gc-cap font-bold"
                  title="Batch-upload all built-in curated sentences to Firestore curated_sentences"
                >
                  {isSeedingBuiltIn && seedProgress
                    ? `Pushing to Cloud (${seedProgress.done}/${seedProgress.total})…`
                    : missingBuiltInSeedCount > 0
                      ? `⬆️ Push Built-in Bank to Cloud (+${missingBuiltInSeedCount})`
                      : '✓ All Built-in Sentences in Cloud'}
                </ActionButton>
              </div>
            </div>
          </div>

          {/* AI Batch Generator into Cloud Bank */}
          <div className={`${cardCls} space-y-2.5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-gc-small font-bold text-gc-ink">
                  ✨ Batch-Populate Cloud Bank with AI (Groq GPT-OSS 120B)
                </h4>
                <p className="text-gc-cap text-gc-quiet">
                  Generate a fresh batch of verified Cambridge-style sentences and archive them directly to Firestore for offline play.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
              <select
                value={batchTopic}
                onChange={(e) => setBatchTopic(e.target.value)}
                disabled={isBatchGenerating}
                aria-label="Batch generation grammar topic"
                className={`sm:col-span-3 ${inputCls}`}
              >
                {GRAMMAR_TOPICS.filter((t) => t !== 'My own choice').map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="Passive Voice">Passive Voice</option>
              </select>

              <select
                value={batchLevel}
                onChange={(e) => setBatchLevel(e.target.value as CEFRLevel)}
                disabled={isBatchGenerating}
                aria-label="Batch generation CEFR level"
                className={`sm:col-span-2 ${inputCls}`}
              >
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </select>

              <select
                value={batchFormat}
                onChange={(e) => setBatchFormat(e.target.value as QuestionType)}
                disabled={isBatchGenerating}
                aria-label="Batch generation format"
                className={`sm:col-span-3 ${inputCls}`}
              >
                <option value="binary">⚖️ Right or Wrong</option>
                <option value="multipleChoice">🔠 Multiple-Choice Gap</option>
                <option value="openCloze">✍️ Open Cloze</option>
                <option value="wordFormation">🧬 Word Formation</option>
                <option value="keyWordTransformation">🔑 Key Word Transformation</option>
              </select>

              <select
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                disabled={isBatchGenerating}
                aria-label="Number of sentences to generate"
                className={`sm:col-span-2 ${inputCls}`}
              >
                <option value={3}>3 sentences</option>
                <option value={5}>5 sentences</option>
                <option value={8}>8 sentences</option>
              </select>

              <div className="sm:col-span-2 flex">
                <ActionButton
                  type="button"
                  onClick={handleBatchGenerateWithAi}
                  playSound={playSound}
                  variant="primary"
                  disabled={isBatchGenerating || isSeedingBuiltIn}
                  className="w-full h-11 px-3 text-gc-cap font-bold"
                >
                  {isBatchGenerating && batchProgress
                    ? `${batchProgress.done}/${batchProgress.total}…`
                    : 'Generate'}
                </ActionButton>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input
              type="text"
              value={sentenceSearch}
              onChange={(e) => setSentenceSearch(e.target.value)}
              placeholder="Search sentence or rule…"
              className={inputCls}
            />
            <select
              value={sentenceTopicFilter}
              onChange={(e) => setSentenceTopicFilter(e.target.value)}
              className={inputCls}
            >
              <option value="ALL">All topics</option>
              {GRAMMAR_TOPICS.filter((t) => t !== 'My own choice').map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="Passive Voice">Passive Voice</option>
            </select>
            <select
              value={sentenceLevelFilter}
              onChange={(e) => setSentenceLevelFilter(e.target.value)}
              className={inputCls}
            >
              <option value="ALL">All CEFR levels</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={sentenceFormatFilter}
              onChange={(e) => setSentenceFormatFilter(e.target.value)}
              className={inputCls}
            >
              <option value="ALL">All formats</option>
              <option value="binary">⚖️ Right or Wrong</option>
              <option value="multipleChoice">🔠 Multiple-Choice Gap</option>
              <option value="openCloze">✍️ Open Cloze</option>
              <option value="wordFormation">🧬 Word Formation</option>
              <option value="keyWordTransformation">🔑 Key Word Transformation</option>
            </select>
          </div>

          {/* Cloud Sentences List */}
          {filteredSentences.length === 0 ? (
            <div className={`${cardCls} py-8 text-center space-y-1.5`}>
              <p className="text-gc-body font-bold text-gc-ink">
                {sentences.length === 0
                  ? 'No Cloud AI sentences archived yet'
                  : 'No sentences match your filter'}
              </p>
              <p className="text-gc-small text-gc-quiet max-w-md mx-auto">
                {sentences.length === 0
                  ? 'Generated sentences will automatically appear here when you are signed in.'
                  : 'Try clearing your search or selecting "All topics" and "All CEFR levels".'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1 modal-content-scroll">
              {filteredSentences.map((item) => {
                const isCloze =
                  isGapType(item.questionType);
                return (
                  <div
                    key={item.id}
                    className={`${cardCls} flex items-start justify-between gap-3`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-gc-cap font-bold tabular-nums">
                        <span className="px-2 py-0.5 rounded-full bg-gc-gold/15 border border-gc-gold/40 text-gc-ink">
                          {item.topic} &middot; {item.level}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-gc-line/[0.08] text-gc-quiet">
                          {item.questionType === 'spotError' || item.questionType === 'wordOrder'
                            ? questionTypeLabel(item.questionType)
                            : isOptionType(item.questionType)
                            ? '🔠 MC Cloze'
                            : item.questionType === 'openCloze'
                              ? '✍️ Open Cloze'
                              : item.questionType === 'wordFormation'
                                ? `🧬 Word Form (${item.baseWord || 'ROOT'})`
                                : item.questionType === 'keyWordTransformation'
                                  ? `🔑 Key Word (${item.baseWord || 'KEY'})`
                                  : '⚖️ Right or Wrong'}
                        </span>
                        {isCloze ? (
                          <span className="px-2 py-0.5 rounded-full bg-gc-win/15 text-gc-win">
                            Answer: &ldquo;{item.correctAnswer}&rdquo;
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              item.isCorrect
                                ? 'bg-gc-win/15 text-gc-win'
                                : 'bg-gc-loss/15 text-gc-loss'
                            }`}
                          >
                            {item.isCorrect ? '✓ Right' : '✕ Wrong'}
                          </span>
                        )}
                      </div>

                      <p className="text-gc-body font-semibold text-gc-ink">
                        &ldquo;{item.text}&rdquo;
                      </p>

                      {(!item.isCorrect || isCloze) && item.correction && (
                        <p className="text-gc-small text-gc-win font-medium">
                          <strong>Correct form:</strong> &ldquo;{item.correction}&rdquo;
                        </p>
                      )}

                      <p className="text-gc-small text-gc-quiet leading-relaxed">
                        {item.explanation}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {confirmDeleteSentenceId === item.id ? (
                        <div className="flex flex-col gap-1">
                          <ActionButton
                            type="button"
                            onClick={() => handleDeleteSentence(item.id)}
                            variant="danger"
                            className="h-8 px-2.5 text-gc-cap font-bold"
                          >
                            Delete
                          </ActionButton>
                          <ActionButton
                            type="button"
                            onClick={() => setConfirmDeleteSentenceId(null)}
                            variant="ghost"
                            className="h-8 px-2 text-gc-cap font-bold"
                          >
                            Cancel
                          </ActionButton>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSentenceId(item.id)}
                          className="w-9 h-9 rounded-full border border-gc-loss/30 hover:border-gc-loss bg-gc-loss/10 text-gc-loss grid place-items-center transition-colors cursor-pointer"
                          title="Remove sentence from Cloud Sentence Bank"
                          aria-label="Remove sentence"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

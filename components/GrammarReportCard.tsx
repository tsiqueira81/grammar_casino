import React, { useState, useMemo } from 'react';
import { RoundHistoryRecord, SoundEffect, Player, Settings, GameMode } from '../types';
import { Check, ChevronDown, Copy, Download, FileText, Lightbulb, Loader2, Printer } from 'lucide-react';
import { generateGrammarReportPDF } from '../utils/pdfGenerator';
import { getAlternativeAcceptedAnswers } from '../utils/roundSettlement';
import { PlayerAvatar } from './PlayerAvatar';
import { getAvatarPlainText } from '../utils/characterAvatars';

interface GrammarReportCardProps {
  history: RoundHistoryRecord[];
  players: Player[];
  winner: Player | null;
  playSound?: (sound: SoundEffect) => void;
  onRestartGame: () => void;
  settings?: Settings;
  gameMode?: GameMode;
  totalRounds?: number | string;
  targetAmount?: number | string;
}

type FilterTab = 'all' | 'errors' | 'missed' | 'perfect';

export const GrammarReportCard: React.FC<GrammarReportCardProps> = ({
  history,
  players,
  winner,
  playSound,
  onRestartGame,
  settings,
  gameMode,
  totalRounds,
  targetAmount,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({});
  const [copiedToast, setCopiedToast] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfToast, setPdfToast] = useState<string | null>(null);
  const [showPdfOptions, setShowPdfOptions] = useState(false);

  // Toggle round card expansion
  const toggleExpand = (roundNum: number) => {
    playSound?.('click');
    setExpandedRounds(prev => ({
      ...prev,
      [roundNum]: !prev[roundNum],
    }));
  };

  const expandAll = () => {
    playSound?.('click');
    const allExpanded: Record<number, boolean> = {};
    history.forEach(r => { allExpanded[r.round] = true; });
    setExpandedRounds(allExpanded);
  };

  const collapseAll = () => {
    playSound?.('click');
    setExpandedRounds({});
  };

  // --- Analytical Metrics ---
  const stats = useMemo(() => {
    if (!history || history.length === 0) {
      return {
        totalRounds: 0,
        totalVotes: 0,
        correctVotes: 0,
        accuracyPct: 0,
        errorSentencesCount: 0,
        cleanSentencesCount: 0,
        missedSentencesCount: 0,
        playerStats: {},
        topGrammarian: null as { name: string; avatar: string; accuracy: number; wins: number } | null,
      };
    }

    let totalVotes = 0;
    let correctVotes = 0;
    let errorSentencesCount = 0;
    let cleanSentencesCount = 0;
    let missedSentencesCount = 0;

    const playerStatsMap: Record<number, { name: string; avatar: string; totalBets: number; wins: number; totalWon: number; correctionsAttempted: number; correctionsAccepted: number }> = {};

    players.forEach(p => {
      playerStatsMap[p.id] = {
        name: p.name,
        avatar: p.avatar,
        totalBets: 0,
        wins: 0,
        totalWon: 0,
        correctionsAttempted: 0,
        correctionsAccepted: 0,
      };
    });

    history.forEach(round => {
      if (round.sentence.isCorrect) {
        cleanSentencesCount++;
      } else {
        errorSentencesCount++;
      }

      let anyPlayerMissed = false;

      round.playerResults.forEach(res => {
        totalVotes++;
        if (res.isWin) {
          correctVotes++;
        } else {
          anyPlayerMissed = true;
        }

        if (!playerStatsMap[res.playerId]) {
          playerStatsMap[res.playerId] = {
            name: res.playerName,
            avatar: res.playerAvatar,
            totalBets: 0,
            wins: 0,
            totalWon: 0,
            correctionsAttempted: 0,
            correctionsAccepted: 0,
          };
        }

        const ps = playerStatsMap[res.playerId];
        ps.totalBets++;
        if (res.isWin) ps.wins++;
        ps.totalWon += res.amountChanged;
        if (res.userCorrection?.trim()) {
          ps.correctionsAttempted++;
          if (res.correctionFeedback?.includes('Accepted')) {
            ps.correctionsAccepted++;
          }
        }
      });

      if (anyPlayerMissed) {
        missedSentencesCount++;
      }
    });

    const accuracyPct = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0;

    // Find top grammarian (highest win accuracy)
    let topGrammarian: { name: string; avatar: string; accuracy: number; wins: number } | null = null;
    let highestAcc = -1;

    Object.values(playerStatsMap).forEach(ps => {
      if (ps.totalBets > 0) {
        const acc = Math.round((ps.wins / ps.totalBets) * 100);
        if (acc > highestAcc) {
          highestAcc = acc;
          topGrammarian = {
            name: ps.name,
            avatar: ps.avatar,
            accuracy: acc,
            wins: ps.wins,
          };
        }
      }
    });

    return {
      totalRounds: history.length,
      totalVotes,
      correctVotes,
      accuracyPct,
      errorSentencesCount,
      cleanSentencesCount,
      missedSentencesCount,
      playerStats: playerStatsMap,
      topGrammarian,
    };
  }, [history, players]);

  // Filtered sentences
  const filteredHistory = useMemo(() => {
    if (activeTab === 'errors') {
      return history.filter(r => !r.sentence.isCorrect);
    }
    if (activeTab === 'missed') {
      return history.filter(r => r.playerResults.some(pr => !pr.isWin));
    }
    if (activeTab === 'perfect') {
      return history.filter(r => r.playerResults.every(pr => pr.isWin));
    }
    return history;
  }, [history, activeTab]);

  // Generate plain text report card for clipboard export
  const copyReportToClipboard = () => {
    playSound?.('click');
    let report = `=========================================\n`;
    report += `       GRAMMAR CASINO: REPORT CARD        \n`;
    report += `=========================================\n\n`;
    report += `Total Rounds: ${stats.totalRounds}\n`;
    report += `Class Accuracy: ${stats.accuracyPct}% (${stats.correctVotes}/${stats.totalVotes} correct votes)\n`;
    if (stats.topGrammarian) {
      report += `MVP Grammarian: ${getAvatarPlainText(stats.topGrammarian.avatar)} ${stats.topGrammarian.name} (${stats.topGrammarian.accuracy}% accuracy)\n`;
    }
    report += `\n-----------------------------------------\n`;
    report += `ROUND-BY-ROUND GRAMMAR BREAKDOWN\n`;
    report += `-----------------------------------------\n\n`;

    history.forEach((round) => {
      const qType = round.sentence.questionType || 'binary';
      const isCloze =
        qType === 'multipleChoice' ||
        qType === 'openCloze' ||
        qType === 'wordFormation' ||
        qType === 'keyWordTransformation';
      if (isCloze) {
        const modeLabel =
          qType === 'multipleChoice'
            ? 'MULTIPLE-CHOICE CLOZE'
            : qType === 'wordFormation'
              ? `WORD FORMATION (${round.sentence.baseWord || 'ROOT'})`
              : qType === 'keyWordTransformation'
                ? `KEY WORD TRANSFORMATION (${round.sentence.baseWord || 'KEY'})`
                : 'OPEN CLOZE';
        report += `[Round ${round.round}] [${modeLabel}] - Official Answer: "${round.sentence.correctAnswer || ''}"\n`;
        report += `Prompt: "${round.sentence.text}"${qType === 'wordFormation' && round.sentence.baseWord ? ` (${round.sentence.baseWord})` : ''}\n`;
        if (qType === 'multipleChoice' && round.sentence.options) {
          report += `Options: ${round.sentence.options.map((opt, idx) => `${['A', 'B', 'C', 'D'][idx]}) ${opt}`).join(' | ')}\n`;
        }
        const altAnswers = getAlternativeAcceptedAnswers(round.sentence.correctAnswer, round.sentence.acceptedAnswers);
        if ((qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') && altAnswers.length > 0) {
          report += `Also Accepted: ${altAnswers.join(', ')}\n`;
        }
        if (round.sentence.correction) {
          report += `Completed Sentence: "${round.sentence.correction}"\n`;
        }
      } else {
        report += `[Round ${round.round}] ${round.sentence.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}\n`;
        report += `Sentence: "${round.sentence.text}"\n`;
        if (!round.sentence.isCorrect && round.sentence.correction) {
          report += `Correction: "${round.sentence.correction}"\n`;
        }
      }
      report += `Explanation: ${round.sentence.explanation}\n`;
      report += `Player Results:\n`;
      round.playerResults.forEach(pr => {
        const answerLabel = pr.playerAnswerDisplay || pr.opinion.toUpperCase();
        report += `  - ${pr.playerName}: Bet $${pr.bet} on ${answerLabel} -> ${pr.isWin ? 'WON (+$' + pr.amountChanged + ')' : 'LOST (-$' + Math.abs(pr.amountChanged) + ')'}\n`;
        if (!isCloze && pr.userCorrection) {
          report += `    Student Correction: "${pr.userCorrection}" [${pr.correctionFeedback || 'Evaluated'}]\n`;
        } else if (isCloze && pr.correctionFeedback) {
          report += `    Evaluation: [${pr.correctionFeedback}]\n`;
        }
      });
      report += `\n`;
    });

    report += `=========================================\n`;
    report += `Generated by Grammar Casino\n`;

    navigator.clipboard.writeText(report).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    });
  };

  const handleGeneratePDF = (onlyFiltered = false) => {
    playSound?.('click');
    setIsGeneratingPDF(true);
    setShowPdfOptions(false);

    // Short timeout allows React to render the loading spinner immediately
    setTimeout(() => {
      try {
        const filterTitle = onlyFiltered && activeTab !== 'all'
          ? (activeTab === 'errors' ? 'Error Sentences Only' : activeTab === 'missed' ? 'Missed Sentences Only' : 'Flawless Sentences Only')
          : 'All Rounds';

        const doc = generateGrammarReportPDF({
          history,
          players,
          winner,
          settings,
          gameMode,
          totalRounds: typeof totalRounds === 'number' ? totalRounds : (totalRounds ? parseInt(String(totalRounds), 10) : 10),
          targetAmount: typeof targetAmount === 'number' ? targetAmount : (targetAmount ? parseInt(String(targetAmount), 10) : 2000),
          filteredRounds: onlyFiltered && activeTab !== 'all' ? filteredHistory : undefined,
          filterName: filterTitle,
        });

        const dateStamp = new Date().toISOString().slice(0, 10);
        const fileName = `Grammar_Casino_Report_Card_${dateStamp}.pdf`;
        doc.save(fileName);

        playSound?.('success');
        setPdfToast('✨ Beautiful PDF Report downloaded!');
        setTimeout(() => setPdfToast(null), 4000);
      } catch (err) {
        console.error('Failed to generate PDF:', err);
        setPdfToast('⚠️ Error generating PDF. Please try again.');
        setTimeout(() => setPdfToast(null), 4000);
      } finally {
        setIsGeneratingPDF(false);
      }
    }, 120);
  };

  const handlePrint = () => {
    playSound?.('click');
    try {
      window.print();
    } catch {
      // In sandboxed/cross-origin iframes where window.print throws, automatically fall back to downloading the PDF
      handleGeneratePDF(false);
    }
  };

  const tabCls = (on: boolean) =>
    `h-9 px-3.5 rounded-full text-gc-small font-semibold transition-colors cursor-pointer border ${
      on ? 'bg-gc-gold/15 border-gc-gold text-gc-ink' : 'bg-gc-line/[0.05] border-gc-line/[0.14] text-gc-quiet hover:text-gc-ink hover:border-gc-line/30'
    }`;
  const toolBtn =
    'h-10 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-gc-line/[0.06] border border-gc-line/[0.16] hover:border-gc-line/30 text-gc-small font-semibold text-gc-ink transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
  const label = 'text-gc-cap font-bold text-gc-quiet mb-1';
  const formatName = (q: string) =>
    q === 'multipleChoice'
      ? 'Multiple choice'
      : q === 'wordFormation'
        ? 'Word formation'
        : q === 'keyWordTransformation'
          ? 'Key word'
          : 'Open cloze';

  return (
    <div className="w-full max-w-5xl mx-auto my-8 print:my-0 print:max-w-none relative text-left">
      {/* Message after making the PDF */}
      {pdfToast && (
        <div role="status" className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-gc gc-panel text-gc-small font-semibold flex items-center gap-2.5 animate-gc-slide-up">
          <span>{pdfToast}</span>
        </div>
      )}

      <section className="gc-surface rounded-gc-lg p-5 md:p-7" aria-labelledby="gc-report-title">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gc-line/[0.12]">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 shrink-0 rounded-full bg-gc-gold/15 text-gc-money grid place-items-center">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="gc-report-title" className="text-gc-title font-bold text-gc-ink">Report card</h2>
              <p className="text-gc-small text-gc-quiet">Every sentence from this game, with the answer, the rule and each player's bet.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden relative">
            <button type="button" onClick={copyReportToClipboard} className={toolBtn} title="Copy a short summary to paste somewhere else">
              {copiedToast ? <Check className="w-4 h-4 text-gc-win" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              {copiedToast ? 'Copied' : 'Copy summary'}
            </button>

            <div className="relative inline-flex items-center">
              <button
                type="button"
                onClick={() => handleGeneratePDF(false)}
                disabled={isGeneratingPDF}
                className={`${toolBtn} rounded-r-none pr-3`}
                title="Download the whole report as a PDF"
              >
                {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
                {isGeneratingPDF ? 'Making the PDF…' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => setShowPdfOptions(prev => !prev)}
                disabled={isGeneratingPDF}
                className={`${toolBtn} rounded-l-none border-l-0 px-2.5`}
                aria-label="More PDF options"
                aria-expanded={showPdfOptions}
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>

              {showPdfOptions && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-72 p-1.5 rounded-gc bg-gc-raised border border-gc-line/[0.14] shadow-gc-2 z-50">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleGeneratePDF(false)}
                    className="w-full text-left px-3 py-2.5 rounded-gc-sm hover:bg-gc-line/[0.07] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="text-gc-small font-semibold text-gc-ink">Whole report ({history.length} hands)</span>
                    <span className="text-gc-cap text-gc-quiet">Best</span>
                  </button>
                  {activeTab !== 'all' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleGeneratePDF(true)}
                      className="w-full text-left px-3 py-2.5 rounded-gc-sm hover:bg-gc-line/[0.07] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-gc-small font-semibold text-gc-ink">Only this list ({filteredHistory.length} hands)</span>
                    </button>
                  )}
                  <div className="my-1 border-t border-gc-line/[0.12]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowPdfOptions(false); handlePrint(); }}
                    className="w-full text-left px-3 py-2.5 rounded-gc-sm hover:bg-gc-line/[0.07] flex items-center gap-2 text-gc-small font-semibold text-gc-ink cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-gc-quiet" aria-hidden="true" />
                    Open the print window
                  </button>
                </div>
              )}
            </div>

            <button type="button" onClick={handlePrint} className={toolBtn} title="Print the report card">
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print
            </button>
          </div>
        </div>

        {/* Numbers for the whole class */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 my-5">
          <div className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.1]">
            <div className={label}>Class accuracy</div>
            <div className="text-gc-display font-extrabold text-gc-win tabular-nums">{stats.accuracyPct}%</div>
            <div className="text-gc-cap text-gc-quiet tabular-nums">{stats.correctVotes} of {stats.totalVotes} bets right</div>
          </div>
          <div className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.1]">
            <div className={label}>Sentences</div>
            <div className="text-gc-display font-extrabold text-gc-ink tabular-nums">{stats.totalRounds}</div>
            <div className="text-gc-cap text-gc-quiet tabular-nums">{stats.errorSentencesCount} with a mistake, {stats.cleanSentencesCount} correct</div>
          </div>
          <div className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.1]">
            <div className={label}>Missed by someone</div>
            <div className="text-gc-display font-extrabold text-gc-loss tabular-nums">{stats.missedSentencesCount}</div>
            <div className="text-gc-cap text-gc-quiet">hands where at least one player lost</div>
          </div>
          <div className="p-4 rounded-gc bg-gc-line/[0.04] border border-gc-line/[0.1]">
            <div className={label}>Best player</div>
            {stats.topGrammarian ? (
              <>
                <div className="text-gc-lead font-bold text-gc-ink truncate flex items-center gap-2 min-h-[40px]">
                  <PlayerAvatar value={stats.topGrammarian.avatar} size="sm" />
                  <span className="truncate">{stats.topGrammarian.name}</span>
                </div>
                <div className="text-gc-cap text-gc-quiet tabular-nums">{stats.topGrammarian.accuracy}% of bets right</div>
              </>
            ) : (
              <div className="text-gc-body text-gc-quiet min-h-[40px] flex items-center">Not enough bets yet</div>
            )}
          </div>
        </div>

        {/* Which hands to show */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-gc-line/[0.12] print:hidden">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Show">
            <button type="button" aria-pressed={activeTab === 'all'} onClick={() => { playSound?.('click'); setActiveTab('all'); }} className={tabCls(activeTab === 'all')}>
              All <span className="tabular-nums">({history.length})</span>
            </button>
            <button type="button" aria-pressed={activeTab === 'errors'} onClick={() => { playSound?.('click'); setActiveTab('errors'); }} className={tabCls(activeTab === 'errors')}>
              With a mistake <span className="tabular-nums">({stats.errorSentencesCount})</span>
            </button>
            <button type="button" aria-pressed={activeTab === 'missed'} onClick={() => { playSound?.('click'); setActiveTab('missed'); }} className={tabCls(activeTab === 'missed')}>
              Missed by someone <span className="tabular-nums">({stats.missedSentencesCount})</span>
            </button>
            <button type="button" aria-pressed={activeTab === 'perfect'} onClick={() => { playSound?.('click'); setActiveTab('perfect'); }} className={tabCls(activeTab === 'perfect')}>
              Everyone right <span className="tabular-nums">({history.length - stats.missedSentencesCount})</span>
            </button>
          </div>
          <div className="flex items-center gap-3 text-gc-small font-semibold text-gc-quiet">
            <button type="button" onClick={expandAll} className="hover:text-gc-ink underline-offset-4 hover:underline cursor-pointer">Open all</button>
            <button type="button" onClick={collapseAll} className="hover:text-gc-ink underline-offset-4 hover:underline cursor-pointer">Close all</button>
          </div>
        </div>

        {/* The hands */}
        <div className="space-y-3 mt-5">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-10 text-gc-body text-gc-quiet rounded-gc border border-dashed border-gc-line/[0.2]">
              No hands in this list.
            </div>
          ) : (
            filteredHistory.map((record) => {
              const isExpanded = expandedRounds[record.round] ?? true;
              const qType = record.sentence.questionType || 'binary';
              const isCloze = qType === 'multipleChoice' || qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation';
              const hasError = !isCloze && !record.sentence.isCorrect;
              const anyPlayerLost = record.playerResults.some(pr => !pr.isWin);
              const chip = 'h-7 px-2.5 inline-flex items-center gap-1 rounded-full text-gc-cap font-bold shrink-0';

              return (
                <div key={record.round} className="rounded-gc border border-gc-line/[0.14] bg-gc-line/[0.03] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(record.round)}
                    aria-expanded={isExpanded}
                    className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-gc-line/[0.04] transition-colors"
                  >
                    <span className="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                      <span className={`${chip} bg-gc-line/[0.08] text-gc-ink tabular-nums`}>Hand {record.round}</span>
                      {isCloze ? (
                        <span className={`${chip} bg-gc-info/15 text-gc-info`}>
                          {formatName(qType)}
                          {(qType === 'wordFormation' || qType === 'keyWordTransformation') && record.sentence.baseWord ? ` · ${record.sentence.baseWord.toUpperCase()}` : ''}
                        </span>
                      ) : (
                        <span className={`${chip} ${hasError ? 'bg-gc-loss/15 text-gc-loss' : 'bg-gc-win/15 text-gc-win'}`}>
                          {hasError ? 'Flawed' : 'Valid'}
                        </span>
                      )}
                      {isCloze && record.sentence.correctAnswer && (
                        <span className={`${chip} hidden sm:inline-flex bg-gc-win/15 text-gc-win max-w-[12rem] truncate`}>Answer: {record.sentence.correctAnswer}</span>
                      )}
                      {anyPlayerLost && <span className={`${chip} hidden sm:inline-flex bg-gc-line/[0.08] text-gc-quiet`}>Missed by someone</span>}
                      <span className="text-gc-body font-sentence italic text-gc-ink truncate flex-1 min-w-0 basis-full sm:basis-auto">&ldquo;{record.sentence.text}&rdquo;</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-gc-cap text-gc-quiet hidden md:inline-block">{record.topic} · {record.level}</span>
                      <ChevronDown className={`w-5 h-5 text-gc-quiet transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-5 md:px-5 pt-4 border-t border-gc-line/[0.1] space-y-4 animate-gc-fade">
                      <div className="p-4 rounded-gc-sm bg-gc-card/60 border border-gc-line/[0.1]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className={label}>
                            {qType === 'keyWordTransformation' ? 'Second sentence' : isCloze ? 'The gap sentence' : 'The sentence'}
                          </div>
                          {qType === 'wordFormation' && record.sentence.baseWord && (
                            <span className={`${chip} bg-gc-gold/15 text-gc-money`}>Word to change: {record.sentence.baseWord.toUpperCase()}</span>
                          )}
                          {qType === 'keyWordTransformation' && record.sentence.baseWord && (
                            <span className={`${chip} bg-gc-gold/15 text-gc-money`}>Key word: {record.sentence.baseWord.toUpperCase()}</span>
                          )}
                        </div>
                        {qType === 'keyWordTransformation' && record.sentence.leadInSentence && (
                          <p className="mb-2 text-gc-body font-sentence italic text-gc-quiet">
                            <span className="not-italic font-sans text-gc-cap font-bold block">First sentence</span>
                            &ldquo;{record.sentence.leadInSentence}&rdquo;
                          </p>
                        )}
                        <p className="text-gc-lead font-sentence italic text-gc-ink">&ldquo;{record.sentence.text}&rdquo;</p>
                        {qType === 'multipleChoice' && record.sentence.options && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {record.sentence.options.map((opt, idx) => {
                              const isOfficial = opt.trim().toLowerCase() === (record.sentence.correctAnswer || '').trim().toLowerCase();
                              return (
                                <span
                                  key={idx}
                                  className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-gc-small font-semibold border ${
                                    isOfficial ? 'bg-gc-win/15 border-gc-win/40 text-gc-ink' : 'bg-gc-line/[0.04] border-gc-line/[0.14] text-gc-quiet'
                                  }`}
                                >
                                  <b>{['A', 'B', 'C', 'D'][idx]}</b> {opt}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {isCloze && (
                        <div className="p-4 rounded-gc-sm bg-gc-win/[0.08] border border-gc-win/30">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className={`${label} !text-gc-win`}>Answer: {record.sentence.correctAnswer}</div>
                            {(qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation') && (() => {
                              const altAnswers = getAlternativeAcceptedAnswers(record.sentence.correctAnswer, record.sentence.acceptedAnswers);
                              return altAnswers.length > 0 ? (
                                <span className="text-gc-cap text-gc-quiet">Also accepted: {altAnswers.join(', ')}</span>
                              ) : null;
                            })()}
                          </div>
                          {record.sentence.correction && (
                            <p className="text-gc-body font-medium text-gc-ink">&ldquo;{record.sentence.correction}&rdquo;</p>
                          )}
                        </div>
                      )}

                      {hasError && record.sentence.correction && (
                        <div className="p-4 rounded-gc-sm bg-gc-win/[0.08] border border-gc-win/30">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className={`${label} !text-gc-win`}>The correction</div>
                            {record.sentence.errorPhrase && (
                              <span className={`${chip} bg-gc-loss/15 text-gc-loss`}>
                                Mistake: {record.sentence.errorPhrase}{record.sentence.mistakeType ? ` (${record.sentence.mistakeType})` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-gc-body font-medium text-gc-ink">&ldquo;{record.sentence.correction}&rdquo;</p>
                        </div>
                      )}

                      <div className="p-4 rounded-gc-sm bg-gc-gold/[0.08] border border-gc-gold/25">
                        <div className={`${label} flex items-center gap-1.5`}>
                          <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                          Why
                        </div>
                        <p className="text-gc-body text-gc-ink">{record.sentence.explanation}</p>
                        {record.sentence.grammarPhrase && (
                          <p className="mt-2 text-gc-small text-gc-quiet">
                            <span className="font-semibold">Look at: </span>
                            <span className="px-1.5 py-0.5 rounded bg-gc-gold/15 text-gc-ink">{record.sentence.grammarPhrase}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <div className={label}>Bets</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {record.playerResults.map((pr, pidx) => (
                            <div key={pidx} className="p-3 rounded-gc-sm border border-gc-line/[0.12] bg-gc-card/50 text-gc-small">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="flex items-center gap-1.5 truncate font-bold text-gc-ink">
                                  <PlayerAvatar value={pr.playerAvatar} size="xs" />
                                  <span className="truncate">{pr.playerName}</span>
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                  {qType === 'keyWordTransformation' && pr.marksAwarded !== undefined && (
                                    <span className={`${chip} !h-6 bg-gc-gold/15 text-gc-money tabular-nums`}>{pr.marksAwarded} of 2 marks</span>
                                  )}
                                  <span className={`font-bold tabular-nums ${pr.amountChanged > 0 ? 'text-gc-win' : pr.amountChanged < 0 ? 'text-gc-loss' : 'text-gc-quiet'}`}>
                                    {pr.amountChanged >= 0 ? `+$${pr.amountChanged}` : `−$${Math.abs(pr.amountChanged)}`}
                                  </span>
                                </span>
                              </div>
                              <div className="text-gc-quiet truncate">
                                {isCloze ? 'Answer: ' : 'Pick: '}
                                <b className="text-gc-ink">{pr.playerAnswerDisplay || pr.opinion}</b>
                                <span className={`ml-1.5 ${pr.isWin ? 'text-gc-win' : 'text-gc-loss'}`}>· {pr.isWin ? 'won' : 'lost'}</span>
                              </div>
                              {!isCloze && pr.userCorrection && (
                                <div className="mt-2 pt-2 border-t border-gc-line/[0.1]">
                                  <div className="text-gc-cap font-semibold text-gc-quiet">Their correction</div>
                                  <div className="font-sentence italic text-gc-ink">&ldquo;{pr.userCorrection}&rdquo;</div>
                                  {pr.correctionFeedback && <div className="text-gc-cap text-gc-money mt-0.5">{pr.correctionFeedback}</div>}
                                </div>
                              )}
                              {isCloze && pr.correctionFeedback && (
                                <div className="mt-1.5 pt-1.5 border-t border-gc-line/[0.1] text-gc-cap text-gc-money">{pr.correctionFeedback}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

export default GrammarReportCard;

import React, { useState, useMemo } from 'react';
import { RoundHistoryRecord, SoundEffect, Player, Settings, GameMode } from '../types';
import ActionButton from './ActionButton';
import { generateGrammarReportPDF } from '../utils/pdfGenerator';

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
      report += `MVP Grammarian: ${stats.topGrammarian.avatar} ${stats.topGrammarian.name} (${stats.topGrammarian.accuracy}% accuracy)\n`;
    }
    report += `\n-----------------------------------------\n`;
    report += `ROUND-BY-ROUND GRAMMAR BREAKDOWN\n`;
    report += `-----------------------------------------\n\n`;

    history.forEach((round, idx) => {
      report += `[Round ${round.round}] ${round.sentence.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}\n`;
      report += `Sentence: "${round.sentence.text}"\n`;
      if (!round.sentence.isCorrect && round.sentence.correction) {
        report += `Correction: "${round.sentence.correction}"\n`;
      }
      report += `Explanation: ${round.sentence.explanation}\n`;
      report += `Player Results:\n`;
      round.playerResults.forEach(pr => {
        report += `  - ${pr.playerName}: Bet $${pr.bet} on ${pr.opinion.toUpperCase()} -> ${pr.isWin ? 'WON (+$' + pr.amountChanged + ')' : 'LOST (-$' + Math.abs(pr.amountChanged) + ')'}\n`;
        if (pr.userCorrection) {
          report += `    Student Correction: "${pr.userCorrection}" [${pr.correctionFeedback || 'Evaluated'}]\n`;
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

  return (
    <div className="w-full max-w-5xl mx-auto my-8 animate-fade-in print:my-0 print:max-w-none relative">
      {/* Toast Notification for PDF Generation */}
      {pdfToast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl bg-slate-900/95 dark:bg-[#071e12]/95 text-amber-200 border-2 border-amber-400 shadow-2xl font-serif text-sm font-bold flex items-center gap-2.5 animate-bounce">
          <span>{pdfToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="luxury-card rounded-2xl p-6 md:p-8 border-2 border-amber-400 dark:border-amber-500/40 shadow-2xl relative overflow-visible bg-white/95 dark:bg-[#071e12]/95 backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-amber-200 dark:border-amber-900/60">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-4xl filter drop-shadow">📜</span>
              <div>
                <h2 className="text-2xl md:text-3xl font-serif font-black text-slate-900 dark:text-amber-100 uppercase tracking-wide">
                  Grammar Report Card
                </h2>
                <p className="text-sm text-slate-600 dark:text-emerald-300/80 font-medium">
                  End-of-Game Pedagogical Review & Error Analysis
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Tools */}
          <div className="flex items-center gap-2 flex-wrap justify-end print:hidden relative">
            <button
              onClick={copyReportToClipboard}
              className="px-3.5 py-2 text-xs font-serif font-bold uppercase tracking-wider rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-600/60 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              title="Copy formatted summary to clipboard"
            >
              <span>{copiedToast ? '✅' : '📋'}</span>
              <span>{copiedToast ? 'Copied to Clipboard!' : 'Copy Summary'}</span>
            </button>

            {/* Split / Unified PDF Action Button */}
            <div className="relative inline-flex items-center shadow-md rounded-lg">
              <button
                onClick={() => handleGeneratePDF(false)}
                disabled={isGeneratingPDF}
                className="px-4 py-2 text-xs font-serif font-bold uppercase tracking-wider rounded-l-lg bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black border border-amber-400 dark:border-amber-300 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-60"
                title="Generate and download complete pedagogical PDF report"
              >
                {isGeneratingPDF ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <span className="text-base leading-none">📄</span>
                    <span>Download PDF</span>
                  </>
                )}
              </button>
              
              <button
                onClick={() => setShowPdfOptions(prev => !prev)}
                disabled={isGeneratingPDF}
                className="px-2.5 py-2 text-xs font-bold rounded-r-lg bg-amber-600 hover:bg-amber-500 text-slate-950 border-t border-b border-r border-amber-400 border-l border-l-amber-700/50 transition-colors cursor-pointer disabled:opacity-60"
                title="More PDF export options"
                aria-label="PDF export options"
              >
                ▾
              </button>

              {/* PDF Dropdown Menu */}
              {showPdfOptions && (
                <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-white dark:bg-[#0a2316] border border-amber-300 dark:border-amber-600/60 shadow-2xl z-50 p-2 text-xs font-serif animate-fade-in">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2.5 py-1 font-bold">
                    Export PDF Options
                  </div>
                  <button
                    onClick={() => handleGeneratePDF(false)}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <span>📄</span> Full Report ({history.length} Rounds)
                    </span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">Recommended</span>
                  </button>
                  
                  {activeTab !== 'all' && (
                    <button
                      onClick={() => handleGeneratePDF(true)}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-bold flex items-center gap-1.5">
                        <span>📑</span> Filtered ({filteredHistory.length} Rounds)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono capitalize">{activeTab}</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                  
                  <button
                    onClick={() => { setShowPdfOptions(false); handlePrint(); }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🖨️</span> Open Browser Print Dialog
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 text-xs font-serif font-bold uppercase tracking-wider rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              title="Print report card directly"
            >
              <span>🖨️</span>
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Analytics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 my-6">
          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-black/40 border border-amber-200 dark:border-amber-800/40 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
              Table Accuracy
            </div>
            <div className="text-3xl font-black font-serif text-emerald-600 dark:text-emerald-400">
              {stats.accuracyPct}%
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {stats.correctVotes} of {stats.totalVotes} bets correct
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-black/40 border border-amber-200 dark:border-amber-800/40 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
              Sentences Played
            </div>
            <div className="text-3xl font-black font-serif text-amber-600 dark:text-amber-400">
              {stats.totalRounds}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {stats.errorSentencesCount} errors / {stats.cleanSentencesCount} clean
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-black/40 border border-amber-200 dark:border-amber-800/40 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
              Tricky Rounds
            </div>
            <div className="text-3xl font-black font-serif text-rose-600 dark:text-rose-400">
              {stats.missedSentencesCount}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              had at least 1 miss
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-black/40 border border-amber-200 dark:border-amber-800/40 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
              Top Grammarian
            </div>
            {stats.topGrammarian ? (
              <>
                <div className="text-xl font-bold font-serif text-slate-900 dark:text-white truncate flex items-center justify-center gap-1.5">
                  <span>{stats.topGrammarian.avatar}</span>
                  <span className="truncate">{stats.topGrammarian.name}</span>
                </div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold mt-0.5">
                  {stats.topGrammarian.accuracy}% win rate
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400 italic mt-2">N/A</div>
            )}
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 print:hidden">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => { playSound?.('click'); setActiveTab('all'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Sentences ({history.length})
            </button>

            <button
              onClick={() => { playSound?.('click'); setActiveTab('errors'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'errors'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              ⚠️ Error Sentences ({stats.errorSentencesCount})
            </button>

            <button
              onClick={() => { playSound?.('click'); setActiveTab('missed'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'missed'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              ⚡ Missed by Players ({stats.missedSentencesCount})
            </button>

            <button
              onClick={() => { playSound?.('click'); setActiveTab('perfect'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'perfect'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              ✅ Perfect Calls ({history.length - stats.missedSentencesCount})
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <button
              onClick={expandAll}
              className="hover:text-amber-600 dark:hover:text-amber-400 hover:underline cursor-pointer"
            >
              Expand All
            </button>
            <span>•</span>
            <button
              onClick={collapseAll}
              className="hover:text-amber-600 dark:hover:text-amber-400 hover:underline cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Sentences List */}
        <div className="space-y-4 mt-6">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 font-serif italic bg-slate-50 dark:bg-black/20 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
              No sentences matched the selected filter tab.
            </div>
          ) : (
            filteredHistory.map((record) => {
              const isExpanded = expandedRounds[record.round] ?? true;
              const hasError = !record.sentence.isCorrect;
              const anyPlayerLost = record.playerResults.some(pr => !pr.isWin);

              return (
                <div
                  key={record.round}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    hasError
                      ? 'border-rose-300/80 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                      : 'border-emerald-300/80 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                  }`}
                >
                  {/* Round Item Bar / Header */}
                  <div
                    onClick={() => toggleExpand(record.round)}
                    className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors select-none"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="px-2.5 py-1 rounded-md text-xs font-serif font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        R{record.round}
                      </span>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                          hasError
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        }`}
                      >
                        <span>{hasError ? '❌ Error' : '✔️ Flawless'}</span>
                      </span>

                      {anyPlayerLost && (
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                          Class Miss
                        </span>
                      )}

                      <p className="text-sm md:text-base font-serif font-medium text-slate-900 dark:text-slate-100 truncate flex-1">
                        "{record.sentence.text}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 hidden md:inline-block">
                        {record.topic} ({record.level})
                      </span>
                      <span className="text-lg text-slate-400 group-hover:text-amber-500 transition-transform">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Content Area */}
                  {isExpanded && (
                    <div className="p-4 md:p-6 border-t border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-black/30 space-y-5 animate-fade-in">
                      {/* Sentence Comparison Box */}
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                            Original Sentence
                          </div>
                          <div className="text-base md:text-lg font-serif text-slate-900 dark:text-slate-100 leading-relaxed">
                            "{record.sentence.text}"
                          </div>
                        </div>

                        {hasError && record.sentence.correction && (
                          <div className="p-3.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/50">
                            <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span>✅</span>
                                <span>Corrected Version</span>
                              </span>
                              {record.sentence.errorPhrase && (
                                <span className="font-mono text-rose-700 dark:text-rose-300 font-medium normal-case bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 text-[11px]">
                                  Mistake: "{record.sentence.errorPhrase}" {record.sentence.mistakeType ? `(${record.sentence.mistakeType})` : ''}
                                </span>
                              )}
                            </div>
                            <div className="text-base md:text-lg font-serif font-medium text-emerald-900 dark:text-emerald-200 leading-relaxed">
                              "{record.sentence.correction}"
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Explanation & Linguistic Rule */}
                      <div className="p-4 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/30">
                        <div className="text-xs font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                          <span>💡</span>
                          <span>Grammar Explanation & Rule</span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                          {record.sentence.explanation}
                        </p>
                        {record.sentence.grammarPhrase && (
                          <div className="mt-2 text-xs font-medium text-amber-900 dark:text-amber-200/90">
                            <span className="font-bold">Key Target Phrase:</span>{' '}
                            <code className="px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 font-mono text-[11px]">
                              {record.sentence.grammarPhrase}
                            </code>
                          </div>
                        )}
                      </div>

                      {/* Player Votes & Outcomes Grid */}
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                          <span>🎲</span>
                          <span>Player Bets & Performance</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {record.playerResults.map((pr, pidx) => (
                            <div
                              key={pidx}
                              className={`p-3 rounded-lg border flex flex-col justify-between text-xs ${
                                pr.isWin
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-950 dark:text-emerald-200'
                                  : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-950 dark:text-rose-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-1.5 truncate font-serif font-bold">
                                  <span>{pr.playerAvatar}</span>
                                  <span className="truncate">{pr.playerName}</span>
                                </div>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    pr.isWin
                                      ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100'
                                      : 'bg-rose-200 dark:bg-rose-800 text-rose-900 dark:text-rose-100'
                                  }`}
                                >
                                  {pr.isWin ? 'Won' : 'Lost'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                                <span>Voted: <strong className="uppercase">{pr.opinion}</strong></span>
                                <span className="font-mono font-bold">
                                  {pr.amountChanged >= 0 ? `+$${pr.amountChanged}` : `-$${Math.abs(pr.amountChanged)}`}
                                </span>
                              </div>

                              {pr.userCorrection && (
                                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                                  <div className="font-semibold text-slate-500 dark:text-slate-400">Correction submitted:</div>
                                  <div className="italic font-serif">"{pr.userCorrection}"</div>
                                  {pr.correctionFeedback && (
                                    <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 font-medium">
                                      {pr.correctionFeedback}
                                    </div>
                                  )}
                                </div>
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
      </div>
    </div>
  );
};

export default GrammarReportCard;

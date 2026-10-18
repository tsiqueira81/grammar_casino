import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RoundHistoryRecord, Player, Settings, GameMode } from '../types';

export interface GeneratePDFOptions {
  history: RoundHistoryRecord[];
  players: Player[];
  winner: Player | null;
  settings?: Settings;
  gameMode?: GameMode;
  totalRounds?: number;
  targetAmount?: number;
  filteredRounds?: RoundHistoryRecord[];
  filterName?: string;
}

/**
 * Strips emoji characters and non-standard symbols so that standard PDF fonts render cleanly
 */
function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Replace smart quotes and special dashes with ASCII equivalents
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    // Replace specific common emojis with textual equivalents
    .replace(/[♠♥♦♣]/g, '*')
    .replace(/🏆/g, '[Champion]')
    .replace(/📜/g, '')
    .replace(/✅|✔️/g, '[OK]')
    .replace(/❌|⚠️/g, '[!]')
    .replace(/💡/g, '[Rule]')
    .replace(/🎲/g, '[Bet]')
    .replace(/💰/g, '$')
    .replace(/🎯/g, '[Goal]')
    .replace(/⏱️/g, '[Rounds]')
    // Remove remaining high-surrogate emojis and symbols
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .trim();
}

/**
 * Formats a currency number with commas
 */
function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function generateGrammarReportPDF(options: GeneratePDFOptions): jsPDF {
  const {
    history,
    players,
    winner,
    settings,
    gameMode = 'lastPlayer',
    totalRounds = 10,
    targetAmount = 2000,
    filteredRounds,
    filterName = 'All Rounds',
  } = options;

  const roundsToRender = filteredRounds || history;

  // Initialize jsPDF (A4 portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm
  let currentY = 0;

  // Color palette (Grammar Casino luxury casino theme)
  const colors = {
    casinoGreen: [7, 30, 18] as [number, number, number],
    casinoGreenLight: [12, 45, 28] as [number, number, number],
    goldAccent: [202, 138, 4] as [number, number, number],
    goldLight: [254, 240, 138] as [number, number, number],
    goldDark: [133, 77, 14] as [number, number, number],
    paperCream: [253, 252, 248] as [number, number, number],
    slateDark: [15, 23, 42] as [number, number, number],
    slateMuted: [100, 116, 139] as [number, number, number],
    slateBorder: [226, 232, 240] as [number, number, number],
    cardBg: [248, 250, 252] as [number, number, number],
    correctGreenBg: [236, 253, 245] as [number, number, number],
    correctGreenBorder: [52, 211, 153] as [number, number, number],
    correctGreenText: [6, 95, 70] as [number, number, number],
    errorRedBg: [254, 242, 242] as [number, number, number],
    errorRedBorder: [248, 113, 113] as [number, number, number],
    errorRedText: [153, 27, 27] as [number, number, number],
  };

  // Helper to check page boundary and auto-add page
  const ensureSpace = (requiredHeightMm: number) => {
    if (currentY + requiredHeightMm > pageHeight - 20) {
      doc.addPage();
      currentY = 18;
      return true;
    }
    return false;
  };

  // ==========================================
  // 1. HEADER BANNER
  // ==========================================
  const headerHeight = 36;
  doc.setFillColor(...colors.casinoGreen);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // Gold accent ribbon
  doc.setFillColor(...colors.goldAccent);
  doc.rect(0, headerHeight - 1.8, pageWidth, 1.8, 'F');

  // Top Casino Brand Pill
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.goldLight);
  doc.text('* * * GRAMMAR CASINO - EDUCATIONAL SUITE * * *', pageWidth / 2, 8, { align: 'center' });

  // Main Report Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('PEDAGOGICAL GRAMMAR REPORT CARD', pageWidth / 2, 18, { align: 'center' });

  // Subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.goldLight);
  doc.text('End-of-Game Error Analysis, Linguistic Diagnostic & Performance Review', pageWidth / 2, 25, { align: 'center' });

  // Document metadata right underneath header
  currentY = headerHeight + 5;

  // ==========================================
  // 2. METADATA SUMMARY BAR
  // ==========================================
  doc.setFillColor(...colors.cardBg);
  doc.setDrawColor(...colors.slateBorder);
  doc.roundedRect(marginX, currentY, contentWidth, 16, 2, 2, 'FD');

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const topicName = cleanText(settings?.topic || history[0]?.topic || 'General Grammar');
  const levelName = settings?.level || history[0]?.level || 'B1';
  const themeName = cleanText(settings?.theme || history[0]?.theme || 'Casino');
  
  let winModeDesc = 'Last Survivor';
  if (gameMode === 'rounds') winModeDesc = `Fixed Rounds (${totalRounds})`;
  if (gameMode === 'targetAmount') winModeDesc = `Target Bankroll ($${targetAmount.toLocaleString()})`;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.slateDark);
  
  // Row 1 inside meta bar
  doc.text(`DATE: ${dateStr}`, marginX + 4, currentY + 5.5);
  doc.text(`TOPIC: ${topicName} (CEFR ${levelName})`, marginX + 65, currentY + 5.5);
  doc.text(`THEME: ${themeName}`, marginX + 135, currentY + 5.5);

  // Row 2 inside meta bar
  doc.setFont('helvetica', 'normal');
  doc.text(`MODE: ${winModeDesc}`, marginX + 4, currentY + 11.5);
  
  const winnerText = winner ? `CHAMPION: ${cleanText(winner.name)} ($${winner.money.toLocaleString()})` : 'OUTCOME: House Won (No survivors)';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.goldDark);
  doc.text(winnerText, marginX + 65, currentY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.slateMuted);
  doc.text(`FILTER: ${filterName}`, marginX + 135, currentY + 11.5);

  currentY += 21;

  // ==========================================
  // 3. ANALYTICAL METRICS (KPI BOXES)
  // ==========================================
  let totalVotes = 0;
  let correctVotes = 0;
  let errorSentences = 0;
  let cleanSentences = 0;
  let missedRounds = 0;

  history.forEach(r => {
    if (r.sentence.isCorrect) cleanSentences++;
    else errorSentences++;

    let roundMissed = false;
    r.playerResults.forEach(pr => {
      totalVotes++;
      if (pr.isWin) correctVotes++;
      else roundMissed = true;
    });
    if (roundMissed) missedRounds++;
  });

  const accuracyPct = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0;

  // Render 4 KPI Cards
  const kpiCount = 4;
  const kpiGap = 3;
  const kpiWidth = (contentWidth - kpiGap * (kpiCount - 1)) / kpiCount;
  const kpiHeight = 18;

  const kpis = [
    {
      label: 'TABLE ACCURACY',
      val: `${accuracyPct}%`,
      sub: `${correctVotes}/${totalVotes} bets correct`,
      valColor: [6, 95, 70] as [number, number, number],
    },
    {
      label: 'SENTENCES PLAYED',
      val: `${history.length}`,
      sub: `${errorSentences} errors / ${cleanSentences} clean`,
      valColor: [180, 83, 9] as [number, number, number],
    },
    {
      label: 'TRICKY ROUNDS',
      val: `${missedRounds}`,
      sub: `rounds with missed bets`,
      valColor: [190, 24, 93] as [number, number, number],
    },
    {
      label: 'TOP GRAMMARIAN',
      val: winner ? cleanText(winner.name).substring(0, 10) : 'N/A',
      sub: winner ? `$${winner.money.toLocaleString()} final bankroll` : 'All eliminated',
      valColor: [7, 30, 18] as [number, number, number],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const kpiX = marginX + idx * (kpiWidth + kpiGap);
    doc.setFillColor(...colors.cardBg);
    doc.setDrawColor(...colors.slateBorder);
    doc.roundedRect(kpiX, currentY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');

    // Title
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.slateMuted);
    doc.text(kpi.label, kpiX + kpiWidth / 2, currentY + 4.5, { align: 'center' });

    // Value
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...kpi.valColor);
    doc.text(kpi.val, kpiX + kpiWidth / 2, currentY + 11, { align: 'center' });

    // Subtitle
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slateMuted);
    doc.text(kpi.sub, kpiX + kpiWidth / 2, currentY + 15.5, { align: 'center' });
  });

  currentY += kpiHeight + 6;

  // ==========================================
  // 4. STUDENT PERFORMANCE ROSTER TABLE
  // ==========================================
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.casinoGreen);
  doc.text('STUDENT STANDINGS & BETTING ACCURACY', marginX, currentY);
  currentY += 2;

  // Calculate per-player aggregates
  const playerStatsList = players.map(player => {
    let totalBetsPlaced = 0;
    let winsCount = 0;
    let netGain = 0;
    let correctionsSubmitted = 0;
    let correctionsAccepted = 0;

    history.forEach(r => {
      const res = r.playerResults.find(pr => pr.playerId === player.id);
      if (res) {
        totalBetsPlaced++;
        if (res.isWin) winsCount++;
        netGain += res.amountChanged;
        if (res.userCorrection?.trim()) {
          correctionsSubmitted++;
          if (res.correctionFeedback?.toLowerCase().includes('accepted') || res.correctionFeedback?.toLowerCase().includes('bonus')) {
            correctionsAccepted++;
          }
        }
      }
    });

    const winRate = totalBetsPlaced > 0 ? `${Math.round((winsCount / totalBetsPlaced) * 100)}%` : '0%';

    return {
      id: player.id,
      name: cleanText(player.name),
      finalMoney: player.money,
      winRate,
      record: `${winsCount}W - ${totalBetsPlaced - winsCount}L`,
      corrections: `${correctionsAccepted}/${correctionsSubmitted}`,
      isWinner: winner?.id === player.id,
    };
  }).sort((a, b) => b.finalMoney - a.finalMoney);

  const tableBody = playerStatsList.map((p, idx) => [
    `#${idx + 1}${p.isWinner ? ' [Champion]' : ''}`,
    p.name,
    formatMoney(p.finalMoney),
    p.record,
    p.winRate,
    p.corrections,
    p.finalMoney > 0 ? 'Active' : 'Bust',
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['Rank', 'Student Name', 'Bankroll', 'Bets Record', 'Win Rate', 'Corrections', 'Status']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: colors.casinoGreen,
      textColor: colors.goldLight,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: colors.slateDark,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 24 },
      1: { halign: 'left', fontStyle: 'bold' },
      2: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'center' },
      4: { halign: 'center', fontStyle: 'bold' },
      5: { halign: 'center' },
      6: { halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: colors.cardBg,
    },
  });

  // @ts-expect-error autoTable adds lastAutoTable to doc
  currentY = doc.lastAutoTable.finalY + 8;

  // ==========================================
  // 5. DETAILED SENTENCE-BY-SENTENCE BREAKDOWN
  // ==========================================
  ensureSpace(20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.casinoGreen);
  doc.text(`PEDAGOGICAL SENTENCE ANALYSIS (${roundsToRender.length} ROUNDS EVALUATED)`, marginX, currentY);
  currentY += 4;

  roundsToRender.forEach((record) => {
    const isError = !record.sentence.isCorrect;
    const cleanSentenceText = cleanText(record.sentence.text);
    const cleanCorrectionText = cleanText(record.sentence.correction);
    const cleanExplanationText = cleanText(record.sentence.explanation);
    const cleanTopic = cleanText(record.topic || 'Grammar');
    const cleanErrorPhrase = cleanText(record.sentence.errorPhrase || '');
    const cleanMistakeType = cleanText(record.sentence.mistakeType || '');

    // Calculate accurate dynamic card height based on text wrapping
    const splitOriginal = doc.splitTextToSize(`"${cleanSentenceText}"`, contentWidth - 14);
    const splitCorrection = (isError && cleanCorrectionText) ? doc.splitTextToSize(`Corrected: "${cleanCorrectionText}"`, contentWidth - 14) : [];
    const splitExplanation = doc.splitTextToSize(`Rule: ${cleanExplanationText}`, contentWidth - 14);

    const studentSummaryParts = record.playerResults.map(pr => {
      const pName = cleanText(pr.playerName);
      const outcome = pr.isWin ? `Won +$${pr.amountChanged}` : `Lost -$${Math.abs(pr.amountChanged)}`;
      const vote = pr.opinion.toUpperCase();
      let extra = '';
      if (pr.userCorrection?.trim()) {
        extra = ` [Student Correction: "${cleanText(pr.userCorrection)}"${pr.correctionFeedback ? ` -> ${cleanText(pr.correctionFeedback)}` : ''}]`;
      }
      return `${pName}: ${vote} -> ${outcome}${extra}`;
    });

    const splitStudents = doc.splitTextToSize(`Student Bets: ${studentSummaryParts.join('  •  ')}`, contentWidth - 14);

    let calculatedCardHeight = 11; // header & top padding
    calculatedCardHeight += splitOriginal.length * 3.8 + 2;
    if (isError) {
      if (cleanErrorPhrase) calculatedCardHeight += 4.5;
      if (splitCorrection.length > 0) calculatedCardHeight += splitCorrection.length * 3.8 + 2;
    }
    calculatedCardHeight += splitExplanation.length * 3.4 + 3;
    calculatedCardHeight += splitStudents.length * 3.2 + 4;

    const actualCardHeight = Math.max(calculatedCardHeight, 28);
    ensureSpace(actualCardHeight);

    // Card background
    doc.setFillColor(...colors.paperCream);
    doc.setDrawColor(...(isError ? colors.errorRedBorder : colors.correctGreenBorder));
    doc.roundedRect(marginX, currentY, contentWidth, actualCardHeight, 2, 2, 'FD');

    // Left color status stripe
    doc.setFillColor(...(isError ? colors.errorRedText : colors.correctGreenText));
    doc.rect(marginX, currentY, 3, actualCardHeight, 'F');

    // Header line inside card
    const cardHeaderY = currentY + 5;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.slateDark);
    doc.text(`ROUND ${record.round} • ${cleanTopic.toUpperCase()} (${record.level})`, marginX + 6, cardHeaderY);

    // Status Badge on right of card header
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    if (isError) {
      doc.setTextColor(...colors.errorRedText);
      doc.text('[!] GRAMMATICAL ERROR IN SENTENCE', marginX + contentWidth - 4, cardHeaderY, { align: 'right' });
    } else {
      doc.setTextColor(...colors.correctGreenText);
      doc.text('[OK] ACCURATE / FLAWLESS SENTENCE', marginX + contentWidth - 4, cardHeaderY, { align: 'right' });
    }

    let insideY = currentY + 9;

    // Original Sentence Display
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...colors.slateDark);
    doc.text(splitOriginal, marginX + 6, insideY);
    insideY += splitOriginal.length * 3.8 + 1.5;

    // If Erroneous, show error highlight & correction
    if (isError) {
      // Mistake phrase if present
      if (cleanErrorPhrase) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.errorRedText);
        doc.text(`Identified Mistake: "${cleanErrorPhrase}" ${cleanMistakeType ? `(${cleanMistakeType})` : ''}`, marginX + 6, insideY);
        insideY += 4;
      }

      // Corrected sentence
      if (splitCorrection.length > 0) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.correctGreenText);
        doc.text(splitCorrection, marginX + 6, insideY);
        insideY += splitCorrection.length * 3.8 + 1.5;
      }
    }

    // Explanation & Pedagogical Rule
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slateMuted);
    doc.text(splitExplanation, marginX + 6, insideY);
    insideY += splitExplanation.length * 3.4 + 2;

    // Student outcomes summary
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.slateDark);
    doc.text(splitStudents, marginX + 6, insideY);

    currentY += actualCardHeight + 3.5;
  });

  // ==========================================
  // 6. FOOTERS ON ALL PAGES
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Thin bottom gold rule
    doc.setDrawColor(...colors.goldAccent);
    doc.setLineWidth(0.4);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    // Footer text
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slateMuted);
    doc.text('Grammar Casino - Official Pedagogical Language Assessment & Classroom Review', marginX, pageHeight - 6);

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 6, { align: 'right' });
  }

  return doc;
}

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RoundHistoryRecord, Player, Settings, GameMode } from '../types';
import { getAlternativeAcceptedAnswers } from './roundSettlement';

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
 * Strips emoji characters, variation selectors, and non-Latin1 symbols so that standard PDF fonts
 * never switch into corrupted UTF-16 spacing or render stray glyphs.
 */
function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Strip variation selectors and zero-width joiners FIRST so emoji replacements don't leave孤立 \uFE0F behind
    .replace(/[\uFE00-\uFE0F\u200B-\u200D\u2060\uFEFF]/g, '')
    // Replace smart quotes, bullets, and special dashes with clean ASCII equivalents
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '|')
    // Replace specific game status emojis cleanly
    .replace(/Sat Out\s*⏱/gi, 'Sat Out')
    .replace(/Frozen\s*❄/gi, 'Frozen')
    .replace(/[♠♥♦♣]/g, '*')
    .replace(/🏆/g, '[Champion]')
    .replace(/📜/g, '')
    .replace(/✅|✔/g, '[OK]')
    .replace(/❌|⚠/g, '[!]')
    .replace(/💡/g, '[Rule]')
    .replace(/🎲/g, '[Bet]')
    .replace(/💰/g, '$')
    .replace(/🎯/g, '[Goal]')
    .replace(/⏱/g, '')
    .replace(/❄/g, '')
    // Remove any remaining surrogate-pair emojis and dingbats
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2300-\u27BF]/g, '')
    // Strip any remaining characters outside printable ASCII + Latin-1 supplement
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
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

  /**
   * Sets the exact font & size BEFORE measuring so jsPDF wraps lines accurately within maxWidthMm.
   */
  const wrapText = (
    rawText: string,
    maxWidthMm: number,
    fontSize: number,
    fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal'
  ): string[] => {
    const cleaned = cleanText(rawText);
    if (!cleaned) return [];
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    doc.setCharSpace(0);
    return doc.splitTextToSize(cleaned, maxWidthMm) as string[];
  };

  /**
   * Guarantees a single-line string never exceeds maxWidthMm by truncating with '...' if needed.
   */
  const fitSingleLine = (
    rawText: string,
    maxWidthMm: number,
    fontSize: number,
    fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal'
  ): string => {
    const cleaned = cleanText(rawText);
    if (!cleaned) return '';
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    doc.setCharSpace(0);
    if (doc.getTextWidth(cleaned) <= maxWidthMm) return cleaned;
    let truncated = cleaned;
    while (truncated.length > 1 && doc.getTextWidth(`${truncated}...`) > maxWidthMm) {
      truncated = truncated.slice(0, -1).trimEnd();
    }
    return `${truncated}...`;
  };

  /**
   * Draws wrapped lines one by one with deterministic line-height and zero character-space drift.
   */
  const drawWrappedLines = (
    lines: string[],
    x: number,
    startY: number,
    lineHeightMm: number
  ): number => {
    doc.setCharSpace(0);
    lines.forEach((line, idx) => {
      doc.text(line, x, startY + idx * lineHeightMm);
    });
    return startY + lines.length * lineHeightMm;
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

  // Row 1 inside meta bar (bounded to column widths: col1=58mm, col2=66mm, col3=44mm)
  const metaDate = fitSingleLine(`DATE: ${dateStr}`, 58, 8, 'bold');
  const metaTopic = fitSingleLine(`TOPIC: ${topicName} (CEFR ${levelName})`, 66, 8, 'bold');
  const metaTheme = fitSingleLine(`THEME: ${themeName}`, 43, 8, 'bold');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.slateDark);
  doc.text(metaDate, marginX + 4, currentY + 5.5);
  doc.text(metaTopic, marginX + 65, currentY + 5.5);
  doc.text(metaTheme, marginX + 135, currentY + 5.5);

  // Row 2 inside meta bar
  const metaMode = fitSingleLine(`MODE: ${winModeDesc}`, 58, 8, 'normal');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.slateDark);
  doc.text(metaMode, marginX + 4, currentY + 11.5);
  
  const rawWinnerText = winner ? `CHAMPION: ${cleanText(winner.name)} ($${winner.money.toLocaleString()})` : 'OUTCOME: House Won (No survivors)';
  const metaWinner = fitSingleLine(rawWinnerText, 66, 8, 'bold');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.goldDark);
  doc.text(metaWinner, marginX + 65, currentY + 11.5);

  const metaFilter = fitSingleLine(`FILTER: ${filterName}`, 43, 8, 'normal');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.slateMuted);
  doc.text(metaFilter, marginX + 135, currentY + 11.5);

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
      val: winner ? cleanText(winner.name) : 'N/A',
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
    const safeLabel = fitSingleLine(kpi.label, kpiWidth - 3, 6.5, 'bold');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.slateMuted);
    doc.text(safeLabel, kpiX + kpiWidth / 2, currentY + 4.5, { align: 'center' });

    // Value
    const safeVal = fitSingleLine(kpi.val, kpiWidth - 3, 12, 'bold');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...kpi.valColor);
    doc.text(safeVal, kpiX + kpiWidth / 2, currentY + 11, { align: 'center' });

    // Subtitle
    const safeSub = fitSingleLine(kpi.sub, kpiWidth - 3, 6, 'normal');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.slateMuted);
    doc.text(safeSub, kpiX + kpiWidth / 2, currentY + 15.5, { align: 'center' });
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

  const innerPaddingLeft = 6;
  const innerPaddingRight = 6;
  const innerWidth = contentWidth - innerPaddingLeft - innerPaddingRight; // 170mm strictly inside card

  roundsToRender.forEach((record) => {
    const qType = record.sentence.questionType || 'binary';
    const isCloze = qType === 'multipleChoice' || qType === 'openCloze' || qType === 'wordFormation' || qType === 'keyWordTransformation';
    const isError = !isCloze && !record.sentence.isCorrect;
    const cleanLeadIn = cleanText(record.sentence.leadInSentence || '');
    const cleanSentenceText = cleanText(record.sentence.text);
    const cleanCorrectionText = cleanText(record.sentence.correction);
    const cleanExplanationText = cleanText(record.sentence.explanation);
    const cleanTopic = cleanText(record.topic || 'Grammar');
    const cleanErrorPhrase = cleanText(record.sentence.errorPhrase || '');
    const cleanMistakeType = cleanText(record.sentence.mistakeType || '');
    const cleanOfficialAnswer = cleanText(record.sentence.correctAnswer || '');
    const cleanBaseWord = cleanText(record.sentence.baseWord || '');

    const altAccepted = getAlternativeAcceptedAnswers(record.sentence.correctAnswer, record.sentence.acceptedAnswers);
    const optionsLine = (qType === 'multipleChoice' && record.sentence.options)
      ? `Options: ${record.sentence.options.map((opt, idx) => `${['A', 'B', 'C', 'D'][idx]}) ${cleanText(opt)}`).join('   ')}`
      : (qType === 'keyWordTransformation')
        ? `KEY WORD: [${cleanBaseWord || 'KEY'}]${altAccepted.length > 0 ? `   |   Also Accepted: ${altAccepted.map(a => cleanText(a)).join(' / ')}` : ''}`
        : (qType === 'wordFormation')
          ? `Base Word: (${cleanBaseWord || 'ROOT'})${altAccepted.length > 0 ? `   |   Also Accepted: ${altAccepted.map(a => cleanText(a)).join(', ')}` : ''}`
          : (qType === 'openCloze' && altAccepted.length > 0)
            ? `Also Accepted: ${altAccepted.map(a => cleanText(a)).join(', ')}`
            : '';

    const mistakeLine = (isError && cleanErrorPhrase)
      ? `Identified Mistake: "${cleanErrorPhrase}"${cleanMistakeType ? ` (${cleanMistakeType})` : ''}`
      : '';

    const promptDisplay = (qType === 'keyWordTransformation' && cleanLeadIn)
      ? `Lead-in: "${cleanLeadIn}"  ->  Target: "${cleanSentenceText}"`
      : `"${cleanSentenceText}"`;

    // Measure every block with its exact font & size so wrapped lines never overflow innerWidth
    const splitOriginal = wrapText(promptDisplay, innerWidth, 8, 'italic');
    const splitOptions = optionsLine ? wrapText(optionsLine, innerWidth, 7.2, 'bold') : [];
    const splitMistake = mistakeLine ? wrapText(mistakeLine, innerWidth, 7.5, 'bold') : [];
    const splitCorrection = ((isError || isCloze) && cleanCorrectionText)
      ? wrapText(`${isCloze ? 'Completed' : 'Corrected'}: "${cleanCorrectionText}"`, innerWidth, 7.5, 'bold')
      : [];
    const splitExplanation = wrapText(`Rule: ${cleanExplanationText}`, innerWidth, 7, 'normal');

    const studentSummaryParts = record.playerResults.map(pr => {
      const pName = cleanText(pr.playerName);
      const marksLabel = (qType === 'keyWordTransformation' && pr.marksAwarded !== undefined)
        ? ` (${pr.marksAwarded}/2M)`
        : '';
      const outcome = pr.isWin ? `Won${marksLabel} +$${pr.amountChanged}` : `Lost${marksLabel} -$${Math.abs(pr.amountChanged)}`;
      const vote = cleanText(pr.playerAnswerDisplay || pr.opinion.toUpperCase());
      let extra = '';
      if (!isCloze && pr.userCorrection?.trim()) {
        extra = ` [Correction: "${cleanText(pr.userCorrection)}"${pr.correctionFeedback ? ` -> ${cleanText(pr.correctionFeedback)}` : ''}]`;
      } else if (isCloze && pr.correctionFeedback) {
        extra = ` [${cleanText(pr.correctionFeedback)}]`;
      }
      return `${pName}: ${vote} -> ${outcome}${extra}`;
    });

    const splitStudents = wrapText(
      `Student Bets: ${studentSummaryParts.join('  |  ')}`,
      innerWidth,
      6.8,
      'bold'
    );

    const origLineH = 3.8;
    const optLineH = 3.5;
    const mistakeLineH = 3.5;
    const corrLineH = 3.8;
    const explLineH = 3.4;
    const studLineH = 3.3;

    // Exact height calculation matching insideY increments
    let calculatedCardHeight = 9.5; // top to first body line baseline
    calculatedCardHeight += splitOriginal.length * origLineH + 1.5;
    if (splitOptions.length > 0) {
      calculatedCardHeight += splitOptions.length * optLineH + 1.5;
    }
    if (isError || isCloze) {
      if (splitMistake.length > 0) {
        calculatedCardHeight += splitMistake.length * mistakeLineH + 1.2;
      }
      if (splitCorrection.length > 0) {
        calculatedCardHeight += splitCorrection.length * corrLineH + 1.5;
      }
    }
    calculatedCardHeight += splitExplanation.length * explLineH + 1.8;
    calculatedCardHeight += splitStudents.length * studLineH + 2.5; // bottom padding

    const actualCardHeight = Math.max(calculatedCardHeight, 26);
    ensureSpace(actualCardHeight);

    // Card background
    doc.setFillColor(...colors.paperCream);
    doc.setDrawColor(...(isError ? colors.errorRedBorder : colors.correctGreenBorder));
    doc.roundedRect(marginX, currentY, contentWidth, actualCardHeight, 2, 2, 'FD');

    // Left color status stripe
    doc.setFillColor(...(isError ? colors.errorRedText : colors.correctGreenText));
    doc.rect(marginX, currentY, 3, actualCardHeight, 'F');

    // Status Badge on right of card header (measured first so left header never collides)
    const cardHeaderY = currentY + 5;
    const rawBadgeText = isCloze
      ? `[ANSWER: "${cleanOfficialAnswer}"]`
      : isError
        ? '[!] GRAMMATICAL ERROR IN SENTENCE'
        : '[OK] ACCURATE / FLAWLESS SENTENCE';
    const safeBadgeText = fitSingleLine(rawBadgeText, 68, 7.5, 'bold');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const badgeWidth = doc.getTextWidth(safeBadgeText);
    if (isError) {
      doc.setTextColor(...colors.errorRedText);
    } else {
      doc.setTextColor(...colors.correctGreenText);
    }
    doc.text(safeBadgeText, marginX + contentWidth - innerPaddingRight, cardHeaderY, { align: 'right' });

    // Header line inside card (left side, bounded so it never touches the right badge)
    const modePrefix =
      qType === 'multipleChoice'
        ? ' - MULTIPLE-CHOICE CLOZE'
        : qType === 'keyWordTransformation'
          ? ` - KEY WORD TRANSFORMATION (${cleanBaseWord || 'KEY'})`
          : qType === 'wordFormation'
            ? ` - WORD FORMATION (${cleanBaseWord || 'ROOT'})`
            : qType === 'openCloze'
              ? ' - OPEN CLOZE'
              : '';
    const rawLeftHeader = `ROUND ${record.round} - ${cleanTopic.toUpperCase()} (${record.level})${modePrefix}`;
    const safeLeftHeader = fitSingleLine(rawLeftHeader, Math.max(60, innerWidth - badgeWidth - 4), 8.5, 'bold');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.slateDark);
    doc.text(safeLeftHeader, marginX + innerPaddingLeft, cardHeaderY);

    let insideY = currentY + 9.5;
    const textX = marginX + innerPaddingLeft;

    // Original Sentence Display
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...colors.slateDark);
    insideY = drawWrappedLines(splitOriginal, textX, insideY, origLineH) + 1.5;

    // Options / Accepted Answers
    if (splitOptions.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...colors.slateMuted);
      insideY = drawWrappedLines(splitOptions, textX, insideY, optLineH) + 1.5;
    }

    // If Erroneous or Cloze, show error highlight & correction/completed sentence
    if (isError || isCloze) {
      if (splitMistake.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.errorRedText);
        insideY = drawWrappedLines(splitMistake, textX, insideY, mistakeLineH) + 1.2;
      }

      if (splitCorrection.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.correctGreenText);
        insideY = drawWrappedLines(splitCorrection, textX, insideY, corrLineH) + 1.5;
      }
    }

    // Explanation & Pedagogical Rule
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colors.slateMuted);
    insideY = drawWrappedLines(splitExplanation, textX, insideY, explLineH) + 1.8;

    // Student outcomes summary
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...colors.slateDark);
    drawWrappedLines(splitStudents, textX, insideY, studLineH);

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

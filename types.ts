
export type Step = 'PLAYER_SETUP' | 'SETTINGS' | 'IN_GAME' | 'RESULTS' | 'GAME_OVER';

export type GameMode = 'lastPlayer' | 'rounds' | 'targetAmount';

export type SoundEffect =
  | 'click'
  | 'addPlayer'
  | 'startGame'
  | 'win'
  | 'lose'
  | 'hint'
  | 'powerUp'
  | 'gameOver'
  | 'bet'
  | 'flip'
  | 'error'
  | 'success'
  | 'tick'
  | 'timeUp'
  | 'chipClink'
  | 'potSweep'
  | 'boomerangWhoosh'
  | 'drumroll'
  | 'lockIn'
  | 'bankrupt'
  | 'wheelTick'
  | 'roundWin'
  | 'roundLose';

// --- Per-player betting turn timer ---
// 'idle'    -> turn not started yet (player cannot act while the timer feature is on)
// 'running' -> countdown active; the deadline is stored as an absolute `endsAt` epoch timestamp
// 'paused'  -> teacher paused; `remainingMs` holds the frozen time left
// 'locked'  -> time ran out (or teacher locked / player was skipped); no more changes allowed
export type TurnTimerStatus = 'idle' | 'running' | 'paused' | 'locked';

export interface PlayerTurnTimer {
  status: TurnTimerStatus;
  endsAt?: number;       // Absolute deadline (Date.now() based) while running and not held
  remainingMs?: number;  // Time left while paused or held
  held?: boolean;        // Auto-held by the system (popup open / hint loading) while running
  skipped?: boolean;     // Auto-locked because the player was frozen (Deep Freeze / Sub-Zero)
}

export interface PlayerHistory {
  round: number;
  sentence: string;
  amount: number;
  spent: number;
  endTotal: number;
}

export interface PlayerEffect {
  type: 'BLESSING' | 'CRUCIO' | 'SILENCED' | 'SECOND_CHANCE' | 'TEACHERS_PET' | 'SUB_ZERO' | 'BET_CAP';
  roundsLeft: number; // -1 for indefinite (until consumed)
}

export interface Player {
  id: number;
  name: string;
  money: number;
  history: PlayerHistory[];
  avatar: string;
  winStreak: number;
  effects: PlayerEffect[];
}

export type GrammarTopic = 'Tenses' | 'Prepositions' | 'Articles' | 'Conditionals' | 'Modals' | 'Phrasal Verbs' | 'Reported Speech' | 'Collocations' | 'My own choice';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Theme = 'Fantasy 🐉' | 'Sci-Fi 🚀' | 'History 🏛️' | 'Everyday Life ☕' | 'Business 💼' | 'Technology 💻' | 'Pop Culture 🍿' | 'Custom ✍️';

export type QuestionType = 'binary' | 'multipleChoice' | 'openCloze' | 'wordFormation' | 'keyWordTransformation';
export type ChallengeFormat = QuestionType | 'mixed';

export interface Settings {
  topic: string;
  level: CEFRLevel;
  theme: string;
  challengeFormat?: ChallengeFormat;
  mixedFormats?: QuestionType[];
}

export interface GeneratedSentence {
  /** Package L3: how an AI item was checked ("two models" or "rules"); absent for bank items. */
  checkedBy?: 'two models' | 'rules';
  text: string;
  isCorrect: boolean;
  correction: string;
  explanation: string;
  grammarPhrase: string; // For the 'Grammar Goggles' power-up
  errorPhrase?: string; // Exact mistake/erroneous phrase if incorrect (e.g. "more lesser", "has went")
  mistakeType?: string; // Short descriptor of the specific error mechanism (e.g. "double comparative")
  questionType?: QuestionType;
  // Set by the offline bank when it ran out of items for the chosen topic and
  // served one from another topic at the same level.
  bankTopic?: string;
  options?: string[];
  acceptedAnswers?: string[];
  correctAnswer?: string;
  baseWord?: string;
  leadInSentence?: string;
  mark1Parts?: string[];
  mark2Parts?: string[];
}

export interface Bet {
  opinion?: 'correct' | 'incorrect';
  bet?: number | '';
  userCorrection?: string;
  splitCorrectPercent?: number; // 0-100, used for SPLIT_BET in binary mode
  questionType?: QuestionType;
  options?: string[];
  selectedOption?: string;
  splitOptions?: string[]; // 50/50 Two-Option Pick in Multiple-Choice Cloze
  clozeAnswer?: string;
  splitClozeAnswers?: [string, string]; // 2 candidate words in Open Cloze (50% wager on each)
}

export interface Hint {
  text: string;
  isLoading: boolean;
}

export interface RoundResultInfo {
  name: string;
  bet: number;
  opinion: 'correct' | 'incorrect';
  outcomeText: string;
  newTotal: number;
  correctionFeedback: string;
  amountChanged: number;
  questionType?: QuestionType;
  playerAnswerDisplay?: string;
  marksAwarded?: 0 | 1 | 2;
}

export interface GameError {
  title: string;
  message: string;
}

export interface PowerUp {
  name: string;
  description: string;
  icon: string;
  requiresTarget: boolean;
}

export interface WheelItem {
  id: string;
  name: string;
  type: 'positive' | 'negative';
  icon: string;
  shortDesc: string;
  description: string;
  color: string;
  textColor: string;
}

export type PowerUpKey = 
  | 'GRAMMAR_GOGGLES' 
  | 'THE_WHEEL' 
  | 'SAFETY_NET' 
  | 'IMMUNITY_IDOL' 
  | 'TAXMAN' 
  | 'BET_CAP' 
  | 'HALF_BAKED' 
  | 'GENEROUS'
  | 'JACKPOT'
  | 'BLESSING'
  | 'BOUNTY_HUNTER'
  | 'CRUCIO'
  | 'GUARDIAN_ANGEL'
  | 'POWER_SURGE'
  | 'SAVINGS_ACCOUNT'
  | 'SHIELD'
  | 'SNOWBALL'
  | 'SPLIT_BET'
  | 'SUB_ZERO'
  | 'THE_PUNISHER'
  | 'THE_TITHE'
  | 'ROBIN_HOOD'
  | 'SILENCER'
  | 'SECOND_CHANCE'
  | 'TEACHERS_PET'
  | 'CORRECTION_BOUNTY'
  | 'LONE_WOLF'
  | 'SWAP'
  | 'SCALPEL'
  | 'PEEKABOO'
  | 'COPYCAT'
  | 'BLOOD_PACT'
  | 'CROWD_SURFER'
  | 'HIGH_ROLLER'
  | 'DOUBLE_OR_NOTHING'
  | 'BOOMERANG'
  | 'PICKPOCKET'
  | 'AUDIENCE_POLL'
  | 'UNDERDOG'
  | 'SCAVENGER';

export interface ActivePowerUp {
  type: PowerUpKey;
  target?: number; // Player ID of the target
  amount?: number; // Cap amount or custom value
  eliminatedOptions?: string[]; // Eliminated MC options for 50/50 Scalpel
}

export interface UsedPowerUp {
  key: PowerUpKey;
  targetId?: number;
}

export interface ShowPowerUpModalPayload {
  title: string;
  message: string;
  icon?: string;
}

export interface ShowTargetModalPayload {
  powerUp: PowerUpKey;
  playerId: number; // The player who is using the power-up
}

export interface RoundPlayerResult {
  playerId: number;
  playerName: string;
  playerAvatar: string;
  bet: number;
  opinion: 'correct' | 'incorrect';
  isWin: boolean;
  amountChanged: number;
  newTotal: number;
  userCorrection?: string;
  correctionFeedback?: string;
  splitPercent?: number;
  questionType?: QuestionType;
  options?: string[];
  playerAnswerDisplay?: string;
  selectedOption?: string;
  splitOptions?: string[];
  clozeAnswer?: string;
  splitClozeAnswers?: [string, string];
  marksAwarded?: 0 | 1 | 2;
}

export interface RoundHistoryRecord {
  round: number;
  sentence: GeneratedSentence;
  topic: string;
  level: string;
  theme: string;
  playerResults: RoundPlayerResult[];
  timestamp?: number;
}

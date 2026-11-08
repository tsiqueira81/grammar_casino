export type WordDerivativePos =
  | 'noun'
  | 'person_noun'
  | 'verb'
  | 'adj_positive'
  | 'adj_negative'
  | 'adv_positive'
  | 'adv_negative';

export interface WordFamilyEntry {
  baseWord: string;
  forms: Partial<Record<WordDerivativePos, string[]>>;
}

/**
 * Curated Derivational Word-Family Lexicon (inspired by hippo-ai/word_forms & Cambridge Use of English Part 3).
 * Maps uppercase root lemmas to their valid grammatical derivations by part of speech and polarity.
 */
export const WORD_FAMILY_LEXICON: Record<string, WordFamilyEntry> = {
  DECIDE: {
    baseWord: 'DECIDE',
    forms: {
      noun: ['decision', 'decisions', 'decisiveness', 'indecision', 'indecisiveness'],
      verb: ['decide', 'decides', 'decided', 'deciding'],
      adj_positive: ['decisive', 'decided'],
      adj_negative: ['indecisive', 'undecided'],
      adv_positive: ['decisively', 'decidedly'],
      adv_negative: ['indecisively'],
    },
  },
  PRODUCE: {
    baseWord: 'PRODUCE',
    forms: {
      noun: ['product', 'products', 'production', 'productivity'],
      person_noun: ['producer', 'producers'],
      verb: ['produce', 'produces', 'produced', 'producing', 'reproduce'],
      adj_positive: ['productive'],
      adj_negative: ['unproductive', 'counterproductive'],
      adv_positive: ['productively'],
      adv_negative: ['unproductively'],
    },
  },
  FORTUNATE: {
    baseWord: 'FORTUNATE',
    forms: {
      noun: ['fortune', 'fortunes', 'misfortune', 'misfortunes'],
      adj_positive: ['fortunate'],
      adj_negative: ['unfortunate'],
      adv_positive: ['fortunately'],
      adv_negative: ['unfortunately'],
    },
  },
  FORTUNE: {
    baseWord: 'FORTUNE',
    forms: {
      noun: ['fortune', 'fortunes', 'misfortune', 'misfortunes'],
      adj_positive: ['fortunate'],
      adj_negative: ['unfortunate'],
      adv_positive: ['fortunately'],
      adv_negative: ['unfortunately'],
    },
  },
  RELY: {
    baseWord: 'RELY',
    forms: {
      noun: ['reliance', 'reliability', 'unreliability'],
      verb: ['rely', 'relies', 'relied', 'relying'],
      adj_positive: ['reliable', 'reliant'],
      adj_negative: ['unreliable'],
      adv_positive: ['reliably'],
      adv_negative: ['unreliably'],
    },
  },
  SUCCESS: {
    baseWord: 'SUCCESS',
    forms: {
      noun: ['success', 'successes'],
      verb: ['succeed', 'succeeds', 'succeeded', 'succeeding'],
      adj_positive: ['successful'],
      adj_negative: ['unsuccessful'],
      adv_positive: ['successfully'],
      adv_negative: ['unsuccessfully'],
    },
  },
  SUCCEED: {
    baseWord: 'SUCCEED',
    forms: {
      noun: ['success', 'successes'],
      verb: ['succeed', 'succeeds', 'succeeded', 'succeeding'],
      adj_positive: ['successful'],
      adj_negative: ['unsuccessful'],
      adv_positive: ['successfully'],
      adv_negative: ['unsuccessfully'],
    },
  },
  AVAILABLE: {
    baseWord: 'AVAILABLE',
    forms: {
      noun: ['availability', 'unavailability'],
      adj_positive: ['available'],
      adj_negative: ['unavailable'],
    },
  },
  BELIEVE: {
    baseWord: 'BELIEVE',
    forms: {
      noun: ['belief', 'beliefs', 'disbelief'],
      person_noun: ['believer', 'believers', 'nonbeliever'],
      verb: ['believe', 'believes', 'believed', 'believing', 'disbelieve'],
      adj_positive: ['believable'],
      adj_negative: ['unbelievable'],
      adv_positive: ['believably'],
      adv_negative: ['unbelievably'],
    },
  },
  COMFORT: {
    baseWord: 'COMFORT',
    forms: {
      noun: ['comfort', 'comforts', 'discomfort'],
      verb: ['comfort', 'comforts', 'comforted', 'comforting'],
      adj_positive: ['comfortable', 'comforting'],
      adj_negative: ['uncomfortable', 'comfortless'],
      adv_positive: ['comfortably'],
      adv_negative: ['uncomfortably'],
    },
  },
  CARE: {
    baseWord: 'CARE',
    forms: {
      noun: ['care', 'carefulness', 'carelessness'],
      person_noun: ['carer', 'caregiver'],
      verb: ['care', 'cares', 'cared', 'caring'],
      adj_positive: ['careful', 'caring'],
      adj_negative: ['careless', 'uncaring'],
      adv_positive: ['carefully'],
      adv_negative: ['carelessly'],
    },
  },
  FRIEND: {
    baseWord: 'FRIEND',
    forms: {
      noun: ['friend', 'friends', 'friendship', 'friendships', 'friendliness', 'unfriendliness'],
      verb: ['befriend', 'befriended'],
      adj_positive: ['friendly', 'friendlier', 'friendliest'],
      adj_negative: ['unfriendly', 'friendless'],
    },
  },
  HAPPY: {
    baseWord: 'HAPPY',
    forms: {
      noun: ['happiness', 'unhappiness'],
      adj_positive: ['happy', 'happier', 'happiest'],
      adj_negative: ['unhappy'],
      adv_positive: ['happily'],
      adv_negative: ['unhappily'],
    },
  },
  POSSIBLE: {
    baseWord: 'POSSIBLE',
    forms: {
      noun: ['possibility', 'possibilities', 'impossibility'],
      adj_positive: ['possible'],
      adj_negative: ['impossible'],
      adv_positive: ['possibly'],
      adv_negative: ['impossibly'],
    },
  },
  PATIENT: {
    baseWord: 'PATIENT',
    forms: {
      noun: ['patience', 'impatience', 'patient', 'patients'],
      adj_positive: ['patient'],
      adj_negative: ['impatient'],
      adv_positive: ['patiently'],
      adv_negative: ['impatiently'],
    },
  },
  POLITE: {
    baseWord: 'POLITE',
    forms: {
      noun: ['politeness', 'impoliteness'],
      adj_positive: ['polite', 'politer', 'politest'],
      adj_negative: ['impolite'],
      adv_positive: ['politely'],
      adv_negative: ['impolitely'],
    },
  },
  AGREE: {
    baseWord: 'AGREE',
    forms: {
      noun: ['agreement', 'agreements', 'disagreement', 'disagreements'],
      verb: ['agree', 'agrees', 'agreed', 'agreeing', 'disagree', 'disagrees', 'disagreed'],
      adj_positive: ['agreeable'],
      adj_negative: ['disagreeable'],
      adv_positive: ['agreeably'],
      adv_negative: ['disagreeably'],
    },
  },
  APPEAR: {
    baseWord: 'APPEAR',
    forms: {
      noun: ['appearance', 'appearances', 'disappearance', 'disappearances'],
      verb: ['appear', 'appears', 'appeared', 'appearing', 'disappear', 'disappears', 'disappeared', 'reappear'],
      adj_positive: ['apparent'],
      adv_positive: ['apparently'],
    },
  },
  APPROVE: {
    baseWord: 'APPROVE',
    forms: {
      noun: ['approval', 'disapproval'],
      verb: ['approve', 'approves', 'approved', 'approving', 'disapprove', 'disapproves', 'disapproved'],
      adj_positive: ['approving'],
      adj_negative: ['disapproving', 'unapproved'],
      adv_positive: ['approvingly'],
      adv_negative: ['disapprovingly'],
    },
  },
  AWARE: {
    baseWord: 'AWARE',
    forms: {
      noun: ['awareness', 'unawareness'],
      adj_positive: ['aware'],
      adj_negative: ['unaware'],
    },
  },
  CERTAIN: {
    baseWord: 'CERTAIN',
    forms: {
      noun: ['certainty', 'certainties', 'uncertainty', 'uncertainties'],
      verb: ['ascertain'],
      adj_positive: ['certain'],
      adj_negative: ['uncertain'],
      adv_positive: ['certainly'],
      adv_negative: ['uncertainly'],
    },
  },
  COMPARE: {
    baseWord: 'COMPARE',
    forms: {
      noun: ['comparison', 'comparisons', 'comparability'],
      verb: ['compare', 'compares', 'compared', 'comparing'],
      adj_positive: ['comparable', 'comparative'],
      adj_negative: ['incomparable'],
      adv_positive: ['comparably', 'comparatively'],
      adv_negative: ['incomparably'],
    },
  },
  COMPETE: {
    baseWord: 'COMPETE',
    forms: {
      noun: ['competition', 'competitions', 'competitiveness'],
      person_noun: ['competitor', 'competitors'],
      verb: ['compete', 'competes', 'competed', 'competing'],
      adj_positive: ['competitive'],
      adj_negative: ['uncompetitive'],
      adv_positive: ['competitively'],
    },
  },
  CONCLUDE: {
    baseWord: 'CONCLUDE',
    forms: {
      noun: ['conclusion', 'conclusions', 'inconclusiveness'],
      verb: ['conclude', 'concludes', 'concluded', 'concluding'],
      adj_positive: ['conclusive'],
      adj_negative: ['inconclusive'],
      adv_positive: ['conclusively'],
      adv_negative: ['inconclusively'],
    },
  },
  CONTRIBUTE: {
    baseWord: 'CONTRIBUTE',
    forms: {
      noun: ['contribution', 'contributions'],
      person_noun: ['contributor', 'contributors'],
      verb: ['contribute', 'contributes', 'contributed', 'contributing'],
      adj_positive: ['contributory'],
    },
  },
  CREATE: {
    baseWord: 'CREATE',
    forms: {
      noun: ['creation', 'creations', 'creativity', 'recreation'],
      person_noun: ['creator', 'creators'],
      verb: ['create', 'creates', 'created', 'creating', 'recreate'],
      adj_positive: ['creative'],
      adj_negative: ['uncreative'],
      adv_positive: ['creatively'],
    },
  },
  CRITIC: {
    baseWord: 'CRITIC',
    forms: {
      noun: ['criticism', 'criticisms', 'critique'],
      person_noun: ['critic', 'critics'],
      verb: ['criticize', 'criticise', 'criticized', 'criticised', 'criticizing', 'criticising'],
      adj_positive: ['critical'],
      adj_negative: ['uncritical'],
      adv_positive: ['critically'],
      adv_negative: ['uncritically'],
    },
  },
  DANGER: {
    baseWord: 'DANGER',
    forms: {
      noun: ['danger', 'dangers'],
      verb: ['endanger', 'endangers', 'endangered', 'endangering'],
      adj_positive: ['dangerous', 'endangered'],
      adv_positive: ['dangerously'],
    },
  },
  DEPEND: {
    baseWord: 'DEPEND',
    forms: {
      noun: ['dependence', 'dependency', 'independence', 'dependability'],
      person_noun: ['dependant', 'dependent'],
      verb: ['depend', 'depends', 'depended', 'depending'],
      adj_positive: ['dependent', 'dependable'],
      adj_negative: ['independent', 'undependable'],
      adv_positive: ['dependently', 'dependably'],
      adv_negative: ['independently'],
    },
  },
  DIFFER: {
    baseWord: 'DIFFER',
    forms: {
      noun: ['difference', 'differences', 'indifference'],
      verb: ['differ', 'differs', 'differed', 'differing', 'differentiate'],
      adj_positive: ['different'],
      adj_negative: ['indifferent'],
      adv_positive: ['differently'],
      adv_negative: ['indifferently'],
    },
  },
  DOUBT: {
    baseWord: 'DOUBT',
    forms: {
      noun: ['doubt', 'doubts'],
      person_noun: ['doubter'],
      verb: ['doubt', 'doubts', 'doubted', 'doubting'],
      adj_positive: ['doubtful', 'dubious'],
      adj_negative: ['undoubted', 'doubtless'],
      adv_positive: ['doubtfully'],
      adv_negative: ['undoubtedly', 'doubtlessly'],
    },
  },
  EFFECT: {
    baseWord: 'EFFECT',
    forms: {
      noun: ['effect', 'effects', 'effectiveness', 'ineffectiveness'],
      verb: ['effect', 'effected'],
      adj_positive: ['effective'],
      adj_negative: ['ineffective', 'ineffectual'],
      adv_positive: ['effectively'],
      adv_negative: ['ineffectively'],
    },
  },
  EMPLOY: {
    baseWord: 'EMPLOY',
    forms: {
      noun: ['employment', 'unemployment'],
      person_noun: ['employer', 'employers', 'employee', 'employees'],
      verb: ['employ', 'employs', 'employed', 'employing'],
      adj_positive: ['employed', 'employable'],
      adj_negative: ['unemployed', 'unemployable'],
    },
  },
  COURAGE: {
    baseWord: 'COURAGE',
    forms: {
      noun: ['courage', 'encouragement', 'discouragement'],
      verb: ['encourage', 'encourages', 'encouraged', 'encouraging', 'discourage', 'discouraged', 'discouraging'],
      adj_positive: ['courageous', 'encouraging'],
      adj_negative: ['discouraging'],
      adv_positive: ['courageously', 'encouragingly'],
      adv_negative: ['discouragingly'],
    },
  },
  ENTHUSE: {
    baseWord: 'ENTHUSE',
    forms: {
      noun: ['enthusiasm'],
      person_noun: ['enthusiast', 'enthusiasts'],
      verb: ['enthuse', 'enthused'],
      adj_positive: ['enthusiastic'],
      adj_negative: ['unenthusiastic'],
      adv_positive: ['enthusiastically'],
      adv_negative: ['unenthusiastically'],
    },
  },
  ENVIRONMENT: {
    baseWord: 'ENVIRONMENT',
    forms: {
      noun: ['environment', 'environments', 'environmentalism'],
      person_noun: ['environmentalist', 'environmentalists'],
      adj_positive: ['environmental'],
      adv_positive: ['environmentally'],
    },
  },
  EXPECT: {
    baseWord: 'EXPECT',
    forms: {
      noun: ['expectation', 'expectations', 'expectancy'],
      verb: ['expect', 'expects', 'expected', 'expecting'],
      adj_positive: ['expected', 'expectant'],
      adj_negative: ['unexpected'],
      adv_positive: ['expectantly'],
      adv_negative: ['unexpectedly'],
    },
  },
  EXPLAIN: {
    baseWord: 'EXPLAIN',
    forms: {
      noun: ['explanation', 'explanations'],
      verb: ['explain', 'explains', 'explained', 'explaining'],
      adj_positive: ['explanatory'],
      adj_negative: ['inexplicable', 'unexplained'],
      adv_negative: ['inexplicably'],
    },
  },
  FAIL: {
    baseWord: 'FAIL',
    forms: {
      noun: ['failure', 'failures'],
      verb: ['fail', 'fails', 'failed', 'failing'],
      adj_negative: ['unfailing'],
      adv_negative: ['unfailingly'],
    },
  },
  FAME: {
    baseWord: 'FAME',
    forms: {
      noun: ['fame', 'infamy'],
      adj_positive: ['famous'],
      adj_negative: ['infamous', 'unfamous'],
      adv_positive: ['famously'],
      adv_negative: ['infamously'],
    },
  },
  FASHION: {
    baseWord: 'FASHION',
    forms: {
      noun: ['fashion', 'fashions'],
      verb: ['fashion', 'fashioned'],
      adj_positive: ['fashionable'],
      adj_negative: ['unfashionable', 'old-fashioned'],
      adv_positive: ['fashionably'],
      adv_negative: ['unfashionably'],
    },
  },
  GROW: {
    baseWord: 'GROW',
    forms: {
      noun: ['growth', 'undergrowth', 'outgrowth'],
      person_noun: ['grower', 'growers'],
      verb: ['grow', 'grows', 'grew', 'grown', 'growing', 'outgrow'],
      adj_positive: ['growing', 'grown'],
    },
  },
  HARM: {
    baseWord: 'HARM',
    forms: {
      noun: ['harm', 'harmfulness', 'harmlessness'],
      verb: ['harm', 'harms', 'harmed', 'harming'],
      adj_positive: ['harmful'],
      adj_negative: ['harmless', 'unharmed'],
      adv_positive: ['harmfully'],
      adv_negative: ['harmlessly'],
    },
  },
  HELP: {
    baseWord: 'HELP',
    forms: {
      noun: ['help', 'helpfulness', 'helplessness'],
      person_noun: ['helper', 'helpers'],
      verb: ['help', 'helps', 'helped', 'helping'],
      adj_positive: ['helpful'],
      adj_negative: ['unhelpful', 'helpless'],
      adv_positive: ['helpfully'],
      adv_negative: ['unhelpfully', 'helplessly'],
    },
  },
  HONEST: {
    baseWord: 'HONEST',
    forms: {
      noun: ['honesty', 'dishonesty'],
      adj_positive: ['honest'],
      adj_negative: ['dishonest'],
      adv_positive: ['honestly'],
      adv_negative: ['dishonestly'],
    },
  },
  IMAGINE: {
    baseWord: 'IMAGINE',
    forms: {
      noun: ['imagination', 'imaginations'],
      verb: ['imagine', 'imagines', 'imagined', 'imagining'],
      adj_positive: ['imaginative', 'imaginable', 'imaginary'],
      adj_negative: ['unimaginative', 'unimaginable'],
      adv_positive: ['imaginatively'],
      adv_negative: ['unimaginably'],
    },
  },
  IMPRESS: {
    baseWord: 'IMPRESS',
    forms: {
      noun: ['impression', 'impressions', 'impressiveness'],
      verb: ['impress', 'impresses', 'impressed', 'impressing'],
      adj_positive: ['impressive', 'impressionable'],
      adj_negative: ['unimpressed', 'unimpressive'],
      adv_positive: ['impressively'],
    },
  },
  INFORM: {
    baseWord: 'INFORM',
    forms: {
      noun: ['information', 'misinformation'],
      person_noun: ['informant', 'informer'],
      verb: ['inform', 'informs', 'informed', 'informing', 'misinform'],
      adj_positive: ['informative', 'informed'],
      adj_negative: ['uninformative', 'uninformed', 'misinformed'],
      adv_positive: ['informatively'],
    },
  },
  INTEND: {
    baseWord: 'INTEND',
    forms: {
      noun: ['intention', 'intentions', 'intent'],
      verb: ['intend', 'intends', 'intended', 'intending'],
      adj_positive: ['intentional', 'intended'],
      adj_negative: ['unintentional', 'unintended'],
      adv_positive: ['intentionally'],
      adv_negative: ['unintentionally'],
    },
  },
  KNOW: {
    baseWord: 'KNOW',
    forms: {
      noun: ['knowledge'],
      verb: ['know', 'knows', 'knew', 'known', 'knowing'],
      adj_positive: ['knowledgeable', 'known', 'well-known'],
      adj_negative: ['unknown', 'unknowing'],
      adv_positive: ['knowingly', 'knowledgeably'],
      adv_negative: ['unknowingly'],
    },
  },
  LEGAL: {
    baseWord: 'LEGAL',
    forms: {
      noun: ['legality', 'illegality', 'legalization', 'legalisation'],
      verb: ['legalize', 'legalise', 'legalized', 'legalised'],
      adj_positive: ['legal'],
      adj_negative: ['illegal'],
      adv_positive: ['legally'],
      adv_negative: ['illegally'],
    },
  },
  LONG: {
    baseWord: 'LONG',
    forms: {
      noun: ['length', 'lengths', 'longevity'],
      verb: ['lengthen', 'lengthens', 'lengthened', 'lengthening', 'prolong'],
      adj_positive: ['long', 'longer', 'longest', 'lengthy'],
      adv_positive: ['lengthily'],
    },
  },
  MAINTAIN: {
    baseWord: 'MAINTAIN',
    forms: {
      noun: ['maintenance'],
      person_noun: ['maintainer'],
      verb: ['maintain', 'maintains', 'maintained', 'maintaining'],
      adj_positive: ['maintainable'],
    },
  },
  MANAGE: {
    baseWord: 'MANAGE',
    forms: {
      noun: ['management', 'mismanagement'],
      person_noun: ['manager', 'managers'],
      verb: ['manage', 'manages', 'managed', 'managing', 'mismanage'],
      adj_positive: ['manageable', 'managerial'],
      adj_negative: ['unmanageable'],
    },
  },
  MEASURE: {
    baseWord: 'MEASURE',
    forms: {
      noun: ['measurement', 'measurements', 'measure', 'measures'],
      verb: ['measure', 'measures', 'measured', 'measuring'],
      adj_positive: ['measurable', 'measured'],
      adj_negative: ['immeasurable'],
      adv_negative: ['immeasurably'],
    },
  },
  MEMORISE: {
    baseWord: 'MEMORISE',
    forms: {
      noun: ['memory', 'memories', 'memorization', 'memorisation', 'memorial'],
      verb: ['memorize', 'memorise', 'memorized', 'memorised'],
      adj_positive: ['memorable'],
      adj_negative: ['unmemorable'],
      adv_positive: ['memorably'],
    },
  },
  MEMORY: {
    baseWord: 'MEMORY',
    forms: {
      noun: ['memory', 'memories', 'memorization', 'memorisation', 'memorial'],
      verb: ['memorize', 'memorise', 'memorized', 'memorised'],
      adj_positive: ['memorable'],
      adj_negative: ['unmemorable'],
      adv_positive: ['memorably'],
    },
  },
  NATURE: {
    baseWord: 'NATURE',
    forms: {
      noun: ['nature', 'naturalness'],
      person_noun: ['naturalist'],
      adj_positive: ['natural'],
      adj_negative: ['unnatural', 'supernatural'],
      adv_positive: ['naturally'],
      adv_negative: ['unnaturally'],
    },
  },
  NECESSARY: {
    baseWord: 'NECESSARY',
    forms: {
      noun: ['necessity', 'necessities'],
      verb: ['necessitate', 'necessitates', 'necessitated'],
      adj_positive: ['necessary'],
      adj_negative: ['unnecessary'],
      adv_positive: ['necessarily'],
      adv_negative: ['unnecessarily'],
    },
  },
  OBEY: {
    baseWord: 'OBEY',
    forms: {
      noun: ['obedience', 'disobedience'],
      verb: ['obey', 'obeys', 'obeyed', 'obeying', 'disobey', 'disobeyed'],
      adj_positive: ['obedient'],
      adj_negative: ['disobedient'],
      adv_positive: ['obediently'],
      adv_negative: ['disobediently'],
    },
  },
  ORIGIN: {
    baseWord: 'ORIGIN',
    forms: {
      noun: ['origin', 'origins', 'originality'],
      person_noun: ['originator'],
      verb: ['originate', 'originates', 'originated', 'originating'],
      adj_positive: ['original'],
      adj_negative: ['unoriginal'],
      adv_positive: ['originally'],
    },
  },
  PERFORM: {
    baseWord: 'PERFORM',
    forms: {
      noun: ['performance', 'performances'],
      person_noun: ['performer', 'performers'],
      verb: ['perform', 'performs', 'performed', 'performing', 'outperform'],
    },
  },
  PLEASE: {
    baseWord: 'PLEASE',
    forms: {
      noun: ['pleasure', 'pleasures', 'displeasure'],
      verb: ['please', 'pleases', 'pleased', 'pleasing', 'displease'],
      adj_positive: ['pleasant', 'pleased', 'pleasing', 'pleasurable'],
      adj_negative: ['unpleasant', 'displeased'],
      adv_positive: ['pleasantly', 'pleasingly'],
      adv_negative: ['unpleasantly'],
    },
  },
  POPULAR: {
    baseWord: 'POPULAR',
    forms: {
      noun: ['popularity', 'unpopularity'],
      verb: ['popularize', 'popularise'],
      adj_positive: ['popular'],
      adj_negative: ['unpopular'],
      adv_positive: ['popularly'],
    },
  },
  PRACTICE: {
    baseWord: 'PRACTICE',
    forms: {
      noun: ['practice', 'practices', 'practicality', 'impracticality', 'malpractice'],
      person_noun: ['practitioner', 'practitioners'],
      verb: ['practice', 'practise', 'practiced', 'practised', 'practicing', 'practising'],
      adj_positive: ['practical', 'practicable'],
      adj_negative: ['impractical', 'impracticable'],
      adv_positive: ['practically'],
    },
  },
  PRECEDENT: {
    baseWord: 'PRECEDENT',
    forms: {
      noun: ['precedent', 'precedents', 'precedence'],
      verb: ['precede', 'precedes', 'preceded', 'preceding'],
      adj_positive: ['precedented', 'preceding'],
      adj_negative: ['unprecedented'],
    },
  },
  PREDICT: {
    baseWord: 'PREDICT',
    forms: {
      noun: ['prediction', 'predictions', 'predictability', 'unpredictability'],
      person_noun: ['predictor'],
      verb: ['predict', 'predicts', 'predicted', 'predicting'],
      adj_positive: ['predictable'],
      adj_negative: ['unpredictable'],
      adv_positive: ['predictably'],
      adv_negative: ['unpredictably'],
    },
  },
  PREFER: {
    baseWord: 'PREFER',
    forms: {
      noun: ['preference', 'preferences'],
      verb: ['prefer', 'prefers', 'preferred', 'preferring'],
      adj_positive: ['preferable', 'preferential'],
      adv_positive: ['preferably', 'preferentially'],
    },
  },
  REASON: {
    baseWord: 'REASON',
    forms: {
      noun: ['reason', 'reasons', 'reasoning', 'reasonableness'],
      verb: ['reason', 'reasons', 'reasoned', 'reasoning'],
      adj_positive: ['reasonable'],
      adj_negative: ['unreasonable'],
      adv_positive: ['reasonably'],
      adv_negative: ['unreasonably'],
    },
  },
  RECOGNIZE: {
    baseWord: 'RECOGNIZE',
    forms: {
      noun: ['recognition'],
      verb: ['recognize', 'recognise', 'recognized', 'recognised', 'recognizing', 'recognising'],
      adj_positive: ['recognizable', 'recognisable', 'recognized', 'recognised'],
      adj_negative: ['unrecognizable', 'unrecognisable', 'unrecognized', 'unrecognised'],
      adv_positive: ['recognizably', 'recognisably'],
    },
  },
  RECONCILE: {
    baseWord: 'RECONCILE',
    forms: {
      noun: ['reconciliation'],
      verb: ['reconcile', 'reconciles', 'reconciled', 'reconciling'],
      adj_positive: ['reconcilable'],
      adj_negative: ['irreconcilable'],
      adv_negative: ['irreconcilably'],
    },
  },
  REGULAR: {
    baseWord: 'REGULAR',
    forms: {
      noun: ['regularity', 'irregularity', 'irregularities', 'regulation'],
      verb: ['regulate', 'regulated'],
      adj_positive: ['regular'],
      adj_negative: ['irregular'],
      adv_positive: ['regularly'],
      adv_negative: ['irregularly'],
    },
  },
  RELATE: {
    baseWord: 'RELATE',
    forms: {
      noun: ['relation', 'relations', 'relationship', 'relationships', 'relativity'],
      person_noun: ['relative', 'relatives'],
      verb: ['relate', 'relates', 'related', 'relating'],
      adj_positive: ['related', 'relative', 'relatable'],
      adj_negative: ['unrelated'],
      adv_positive: ['relatively'],
    },
  },
  REPLACE: {
    baseWord: 'REPLACE',
    forms: {
      noun: ['replacement', 'replacements'],
      verb: ['replace', 'replaces', 'replaced', 'replacing'],
      adj_positive: ['replaceable'],
      adj_negative: ['irreplaceable'],
    },
  },
  RESPONSE: {
    baseWord: 'RESPONSE',
    forms: {
      noun: ['response', 'responses', 'responsibility', 'responsibilities', 'responsiveness', 'irresponsibility'],
      person_noun: ['respondent', 'responder'],
      verb: ['respond', 'responds', 'responded', 'responding'],
      adj_positive: ['responsive', 'responsible'],
      adj_negative: ['unresponsive', 'irresponsible'],
      adv_positive: ['responsively', 'responsibly'],
      adv_negative: ['irresponsibly'],
    },
  },
  RESPONSIBLE: {
    baseWord: 'RESPONSIBLE',
    forms: {
      noun: ['responsibility', 'responsibilities', 'irresponsibility'],
      adj_positive: ['responsible'],
      adj_negative: ['irresponsible'],
      adv_positive: ['responsibly'],
      adv_negative: ['irresponsibly'],
    },
  },
  SATISFY: {
    baseWord: 'SATISFY',
    forms: {
      noun: ['satisfaction', 'dissatisfaction'],
      verb: ['satisfy', 'satisfies', 'satisfied', 'satisfying', 'dissatisfy'],
      adj_positive: ['satisfied', 'satisfying', 'satisfactory'],
      adj_negative: ['unsatisfied', 'dissatisfied', 'unsatisfactory', 'unsatisfying'],
      adv_positive: ['satisfactorily', 'satisfyingly'],
      adv_negative: ['unsatisfactorily'],
    },
  },
  SCIENCE: {
    baseWord: 'SCIENCE',
    forms: {
      noun: ['science', 'sciences'],
      person_noun: ['scientist', 'scientists'],
      adj_positive: ['scientific'],
      adj_negative: ['unscientific'],
      adv_positive: ['scientifically'],
    },
  },
  SENSE: {
    baseWord: 'SENSE',
    forms: {
      noun: ['sense', 'senses', 'sensitivity', 'insensitivity', 'sensibility', 'nonsense'],
      verb: ['sense', 'sensed', 'sensing', 'sensitize'],
      adj_positive: ['sensible', 'sensitive', 'sensory'],
      adj_negative: ['insensible', 'insensitive', 'senseless'],
      adv_positive: ['sensibly', 'sensitively'],
      adv_negative: ['insensitively', 'senselessly'],
    },
  },
  SIGNIFY: {
    baseWord: 'SIGNIFY',
    forms: {
      noun: ['significance', 'insignificance'],
      verb: ['signify', 'signifies', 'signified', 'signifying'],
      adj_positive: ['significant'],
      adj_negative: ['insignificant'],
      adv_positive: ['significantly'],
      adv_negative: ['insignificantly'],
    },
  },
  SOLVE: {
    baseWord: 'SOLVE',
    forms: {
      noun: ['solution', 'solutions', 'solubility'],
      person_noun: ['solver'],
      verb: ['solve', 'solves', 'solved', 'solving', 'resolve'],
      adj_positive: ['solvable', 'soluble'],
      adj_negative: ['unsolvable', 'insoluble', 'unsolved'],
    },
  },
  STRONG: {
    baseWord: 'STRONG',
    forms: {
      noun: ['strength', 'strengths'],
      verb: ['strengthen', 'strengthens', 'strengthened', 'strengthening'],
      adj_positive: ['strong', 'stronger', 'strongest'],
      adv_positive: ['strongly'],
    },
  },
  SUBSTANCE: {
    baseWord: 'SUBSTANCE',
    forms: {
      noun: ['substance', 'substances', 'substantiation'],
      verb: ['substantiate', 'substantiated'],
      adj_positive: ['substantial', 'substantive', 'substantiated'],
      adj_negative: ['insubstantial', 'unsubstantiated'],
      adv_positive: ['substantially'],
    },
  },
  TIRE: {
    baseWord: 'TIRE',
    forms: {
      noun: ['tiredness'],
      verb: ['tire', 'tires', 'tired', 'tiring'],
      adj_positive: ['tired', 'tiring', 'tireless'],
      adv_positive: ['tirelessly', 'tiringly'],
    },
  },
  UNDERSTAND: {
    baseWord: 'UNDERSTAND',
    forms: {
      noun: ['understanding', 'misunderstanding', 'misunderstandings'],
      verb: ['understand', 'understands', 'understood', 'understanding', 'misunderstand', 'misunderstood'],
      adj_positive: ['understandable', 'understanding'],
      adv_positive: ['understandably'],
    },
  },
  USE: {
    baseWord: 'USE',
    forms: {
      noun: ['use', 'usage', 'usefulness', 'uselessness', 'misuse', 'disuse'],
      person_noun: ['user', 'users'],
      verb: ['use', 'uses', 'used', 'using', 'misuse', 'reuse'],
      adj_positive: ['useful', 'usable', 'used', 'reusable'],
      adj_negative: ['useless', 'unused', 'unusable'],
      adv_positive: ['usefully'],
      adv_negative: ['uselessly'],
    },
  },
  VALUABLE: {
    baseWord: 'VALUABLE',
    forms: {
      noun: ['value', 'values', 'valuation', 'evaluation'],
      verb: ['value', 'values', 'valued', 'valuing', 'devalue', 'evaluate'],
      adj_positive: ['valuable', 'invaluable'],
      adj_negative: ['valueless'],
    },
  },
  VALUE: {
    baseWord: 'VALUE',
    forms: {
      noun: ['value', 'values', 'valuation', 'evaluation'],
      verb: ['value', 'values', 'valued', 'valuing', 'devalue', 'evaluate'],
      adj_positive: ['valuable', 'invaluable'],
      adj_negative: ['valueless'],
    },
  },
  VARY: {
    baseWord: 'VARY',
    forms: {
      noun: ['variety', 'varieties', 'variation', 'variations', 'variability', 'variable'],
      verb: ['vary', 'varies', 'varied', 'varying'],
      adj_positive: ['various', 'varied', 'variable'],
      adj_negative: ['invariable', 'unvaried'],
      adv_positive: ['variously', 'variably'],
      adv_negative: ['invariably'],
    },
  },
  WILLING: {
    baseWord: 'WILLING',
    forms: {
      noun: ['willingness', 'unwillingness'],
      adj_positive: ['willing'],
      adj_negative: ['unwilling'],
      adv_positive: ['willingly'],
      adv_negative: ['unwillingly'],
    },
  },
};

const POS_HUMAN_LABEL: Record<WordDerivativePos, string> = {
  noun: 'a noun',
  person_noun: 'a person noun',
  verb: 'a verb form',
  adj_positive: 'a positive adjective',
  adj_negative: 'a negative adjective',
  adv_positive: 'a positive adverb (-ly)',
  adv_negative: 'a negative adverb (-ly)',
};

/**
 * Infers the morphological Part of Speech and polarity of an English word using
 * suffix/prefix heuristics when not explicitly in WORD_FAMILY_LEXICON.
 */
export function inferMorphologicalPos(word: string, baseWord?: string): WordDerivativePos | null {
  const w = (word || '').trim().toLowerCase();
  if (!w) return null;
  const base = (baseWord || '').trim().toLowerCase();
  const hasNegPrefix =
    base &&
    !base.startsWith('un') &&
    !base.startsWith('in') &&
    !base.startsWith('im') &&
    !base.startsWith('ir') &&
    !base.startsWith('il') &&
    !base.startsWith('dis') &&
    !base.startsWith('mis') &&
    /^(un|in|im|ir|il|dis|mis|non)/.test(w);
  const hasNegSuffix = w.endsWith('less') || w.endsWith('lessly');

  if (w.endsWith('ly') && !['friendly', 'lovely', 'lonely', 'silly', 'likely', 'lively', 'costly', 'deadly', 'timely'].includes(w)) {
    return hasNegPrefix || hasNegSuffix ? 'adv_negative' : 'adv_positive';
  }
  if (/(tion|sion|ment|ness|ity|ance|ence|ship|hood|dom|ism|th|al|ure|ery|cy)$/.test(w)) {
    return 'noun';
  }
  if (/(ist|ian|ant|ent|ee)$/.test(w) && w !== base) {
    return 'person_noun';
  }
  if (/(able|ible|ful|less|ous|ive|ic|ical|al|ant|ent|ary|ory|y)$/.test(w)) {
    return hasNegPrefix || hasNegSuffix ? 'adj_negative' : 'adj_positive';
  }
  if (/(ize|ise|ify|en|ate)$/.test(w)) {
    return 'verb';
  }
  return null;
}

/**
 * Looks up a WordFamilyEntry by either its uppercase root key (e.g. "DECIDE")
 * or any derived form in its family (e.g. "unfortunately" -> FORTUNATE).
 */
export function lookupWordFamily(wordOrRoot: string): WordFamilyEntry | null {
  const clean = (wordOrRoot || '').trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  if (WORD_FAMILY_LEXICON[upper]) {
    return WORD_FAMILY_LEXICON[upper];
  }
  const lower = clean.toLowerCase();
  for (const entry of Object.values(WORD_FAMILY_LEXICON)) {
    for (const list of Object.values(entry.forms)) {
      if (list && list.some(item => item.toLowerCase() === lower)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Looks up the Part of Speech category for a word within a root's word family,
 * falling back to suffix/prefix inference.
 */
export function getWordFamilyPos(word: string, baseWord?: string): WordDerivativePos | null {
  const cleanWord = (word || '').trim().toLowerCase();
  const cleanBase = (baseWord || '').trim().toUpperCase();
  const entry = (cleanBase ? WORD_FAMILY_LEXICON[cleanBase] : undefined) || lookupWordFamily(cleanWord);
  if (entry) {
    for (const [pos, list] of Object.entries(entry.forms) as Array<[WordDerivativePos, string[]]>) {
      if (list && list.some(item => item.toLowerCase() === cleanWord)) {
        return pos;
      }
    }
  }
  return inferMorphologicalPos(cleanWord, cleanBase);
}

/**
 * Generates diagnostic pedagogical feedback comparing a student's Word Formation attempt
 * against the intended target derivative.
 */
export function diagnoseWordFormationAttempt(
  candidateWord: string,
  intendedAnswer: string,
  baseWord?: string
): string {
  const cand = (candidateWord || '').trim().toLowerCase();
  const target = (intendedAnswer || '').trim().toLowerCase();
  const base = (baseWord || '').trim().toUpperCase();

  const candPos = getWordFamilyPos(cand, base);
  const targetPos = getWordFamilyPos(target, base);

  if (candPos && targetPos) {
    const candIsNeg = candPos.endsWith('_negative');
    const targetIsNeg = targetPos.endsWith('_negative');
    const candBasePos = candPos.replace(/_(positive|negative)$/, '');
    const targetBasePos = targetPos.replace(/_(positive|negative)$/, '');

    // Case 1: Right Part of Speech (e.g. both adverbs or both adjectives), but missing/wrong negative prefix!
    if (candBasePos === targetBasePos && candIsNeg !== targetIsNeg) {
      if (targetIsNeg) {
        return `Close! "${candidateWord}" is the right part of speech (${POS_HUMAN_LABEL[candPos]}), but the sentence context requires the negative form: "${intendedAnswer}".`;
      }
      return `Close! "${candidateWord}" uses a negative affix, whereas the sentence context requires the positive form: "${intendedAnswer}".`;
    }

    // Case 2: Wrong Part of Speech within the same word family (e.g. adjective instead of adverb, or noun instead of adjective)
    if (candBasePos !== targetBasePos) {
      return `Good root family (${base || 'root'}), but "${candidateWord}" is ${POS_HUMAN_LABEL[candPos]} — this gap requires ${POS_HUMAN_LABEL[targetPos]} ("${intendedAnswer}").`;
    }
  }

  return `"${candidateWord}" does not fit the grammatical slot (expected "${intendedAnswer}"${base ? ` from ${base}` : ''}).`;
}

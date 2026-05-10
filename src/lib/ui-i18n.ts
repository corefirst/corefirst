// UI i18n bag. The UI language is independent from the source/target language
// of any given transform — the learner reads the interface in their preferred
// language, regardless of which language pair they happen to be practicing.
//
// Translatable surfaces:
//   - All chrome (mode tabs, form labels, buttons, placeholders, error states)
//   - Transform-mode teaching hints (CFLT block labels, popovers, footer)
//   - LLM-generated rationales (instructed via {{UI_LANG}} in system_prompt.md)
// NON-translatable surfaces:
//   - Brand text ("CoreFirst", "CFLT", "CFLT")
//   - L1/L2 row content (uses sourceLang/targetLang content as-is)

export const SUPPORTED_LANGS = [
  'English', 'Chinese', 'Japanese', 'Korean', 'Vietnamese', 'Spanish', 'French', 'German',
] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// Mapping for the standardResultHeader template.
const TARGET_LANG_NAME: Record<SupportedLang, Record<SupportedLang, string>> = {
  English: { English: 'English', Chinese: 'Chinese', Japanese: 'Japanese', Korean: 'Korean', Vietnamese: 'Vietnamese', Spanish: 'Spanish', French: 'French', German: 'German' },
  Chinese: { English: '英语', Chinese: '中文', Japanese: '日语', Korean: '韩语', Vietnamese: '越南语', Spanish: '西班牙语', French: '法语', German: '德语' },
  Japanese: { English: '英語', Chinese: '中国語', Japanese: '日本語', Korean: '韓国語', Vietnamese: 'ベトナム語', Spanish: 'スペイン語', French: 'フランス語', German: 'ドイツ語' },
  Korean: { English: '영어', Chinese: '중국어', Japanese: '일본어', Korean: '한국어', Vietnamese: '베트남어', Spanish: '스페인어', French: '프랑스어', German: '독일어' },
  Vietnamese: { English: 'tiếng Anh', Chinese: 'tiếng Trung', Japanese: 'tiếng Nhật', Korean: 'tiếng Hàn', Vietnamese: 'tiếng Việt', Spanish: 'tiếng Tây Ban Nha', French: 'tiếng Pháp', German: 'tiếng Đức' },
  Spanish: { English: 'inglés', Chinese: 'chino', Japanese: 'japonés', Korean: 'coreano', Vietnamese: 'vietnamita', Spanish: 'español', French: 'francés', German: 'alemán' },
  French: { English: 'anglais', Chinese: 'chinois', Japanese: 'japonais', Korean: 'coréen', Vietnamese: 'vietnamien', Spanish: 'espagnol', French: 'français', German: 'allemand' },
  German: { English: 'Englisch', Chinese: 'Chinesisch', Japanese: 'Japanisch', Korean: 'Koreanisch', Vietnamese: 'Vietnamesisch', Spanish: 'Spanisch', French: 'Französisch', German: 'Deutsch' },
};

type DictKey =
  // Header / tabs
  | 'tagline' | 'tabTransform' | 'tabCourse' | 'tabRoleplay' | 'tabStats'
  | 'uiLangLabel'
  // History panel
  | 'historyTransformsHeader' | 'historyRoleplayHeader' | 'historyCoursesHeader'
  | 'historyEmpty'
  | 'historyError' | 'historyMessageCount' | 'historyInputLabel' | 'historyResultLabel'
  | 'historyContextLabel' | 'historyExpand' | 'historyCollapse'
  | 'historyTopicLabel' | 'historyLoadCourse' | 'historyLessonCount'
  // Form
  | 'sourceLangLabel' | 'targetLangLabel' | 'ageGroupLabel' | 'industryLabel'
  | 'transformPlaceholder' | 'coursePlaceholder'
  | 'btnTransform' | 'btnGenerateCourse'
  | 'submitHint'
  | 'errorTransform' | 'errorCourse'
  // Transform result chrome
  | 'cfltThinkingHeader' | 'targetMappingHeader' | 'standardResultHeader' | 'inferredFooter'
  // CFLTBlock empty / filled state
  | 'youDidntSay' | 'suggest' | 'pickOrType' | 'typeYourOwn' | 'typePlaceholder'
  | 'pressEnterToConfirm' | 'youPicked' | 'youTyped'
  // Slot labels (rendered on each block)
  | 'slotCore' | 'slotReason' | 'slotSpace' | 'slotTime'
  // Standardized Method Labels
  | 'labelCore' | 'labelReason' | 'labelSpace' | 'labelTime'
  | 'statusInferred'
  // Stats / progress dashboard
  | 'statsLoading' | 'statsErrorLoad' | 'statsEmptyTitle' | 'statsEmptyBody'
  | 'statsSectionStreak' | 'statsSectionAbility' | 'statsSectionMemory'
  | 'statsCurrentStreak' | 'statsLongestStreak' | 'statsStudyDaysMonth' | 'statsStudyDaysTotal'
  | 'statsActivityHeatmap' | 'statsActivityNoneToday' | 'statsActivityToday'
  | 'statsDays'
  | 'statsTotalSessions' | 'statsTotalAttempts' | 'statsAvgScore'
  | 'statsTotalTransforms' | 'statsTotalRoleplay' | 'statsLearningCurve'
  | 'statsLogicStress' | 'statsPronunciation' | 'statsOverallScore'
  | 'statsLearningCurveSubtitle' | 'statsLearningCurveEmpty'
  | 'statsTopPackages' | 'statsTopPackagesEmpty' | 'statsAttemptsLabel'
  | 'statsLanguagePairs' | 'statsLanguagePairsEmpty'
  | 'statsVocabulary' | 'statsVocabTotal' | 'statsVocabDue'
  | 'statsVocabNew' | 'statsVocabLearning' | 'statsVocabMature' | 'statsVocabEmpty'
  // Language names (for the lang dropdowns)
  | 'langEnglish' | 'langChinese' | 'langJapanese' | 'langKorean' | 'langVietnamese' | 'langSpanish' | 'langFrench' | 'langGerman';

type Resolver = (arg: string, lang: SupportedLang) => string;
type Dict = Record<DictKey, string | Resolver>;

const en: Dict = {
  tagline: 'Core-First Language Method',
  tabTransform: 'Transform', tabCourse: 'Course Mode', tabRoleplay: 'Roleplay', tabStats: 'Stats',
  uiLangLabel: 'Interface',
  historyTransformsHeader: 'Transform History',
  historyRoleplayHeader: 'Roleplay Sessions',
  historyCoursesHeader: 'Course Library',
  historyEmpty: 'Nothing yet — your activity will appear here.',
  historyError: 'Could not load history. Please refresh.',
  historyMessageCount: (n) => `${n} message${Number(n) === 1 ? '' : 's'}`,
  historyInputLabel: 'You wrote',
  historyResultLabel: 'Standard',
  historyContextLabel: 'Context',
  historyExpand: 'Show messages',
  historyCollapse: 'Hide messages',
  historyTopicLabel: 'Topic',
  historyLoadCourse: 'Open',
  historyLessonCount: (n) => `${n} lesson${Number(n) === 1 ? '' : 's'}`,
  sourceLangLabel: 'Native Language', targetLangLabel: 'Target Language',
  ageGroupLabel: 'Target Age Group', industryLabel: 'Industry Context',
  transformPlaceholder: 'Enter a sentence...',
  coursePlaceholder: 'Enter a topic (e.g., At the Zoo, Business Meeting)',
  btnTransform: 'Transform', btnGenerateCourse: 'Generate Course',
  submitHint: 'Press ⌘/Ctrl+Enter to submit',
  errorTransform: 'Transformation failed. Please try again.',
  errorCourse: 'Course generation failed. Please try again.',
  cfltThinkingHeader: 'Core / Reason / Space / Time Structure',
  targetMappingHeader: 'Target Language Mapping',
  standardResultHeader: (lang, ui) => `Standard ${TARGET_LANG_NAME.English[lang as SupportedLang] ?? lang} Result`,
  inferredFooter: "Dashed slots weren't in your input. Core First requires all four — pick a suggestion or type your own to complete the sequence.",
  youDidntSay: (label) => `you didn't say\na ${label.toLowerCase()}`,
  suggest: 'Suggest',
  pickOrType: (label) => `Pick a ${label}, or type your own`,
  typeYourOwn: 'Type your own',
  typePlaceholder: (label) => `Type a ${label.toLowerCase()}...`,
  pressEnterToConfirm: 'Press Enter to confirm.',
  youPicked: 'YOU PICKED', youTyped: 'YOU TYPED',
  slotCore: 'Core', slotReason: 'Reason', slotSpace: 'Space', slotTime: 'Time',
  labelCore: 'CORE', labelReason: 'REASON', labelSpace: 'SPACE', labelTime: 'TIME',
  statusInferred: 'Inferred',
  statsLoading: 'Loading your progress…',
  statsErrorLoad: 'Could not load progress data. Please refresh.',
  statsEmptyTitle: 'Your Journey Begins Soon',
  statsEmptyBody: 'Complete your first transform, voice challenge, or roleplay session to start tracking your progress.',
  statsSectionStreak: 'Daily Habit',
  statsSectionAbility: 'Practice & Skill',
  statsSectionMemory: 'Memory',
  statsCurrentStreak: 'Current Streak',
  statsLongestStreak: 'Longest Streak',
  statsStudyDaysMonth: 'Days This Month',
  statsStudyDaysTotal: 'Total Study Days',
  statsActivityHeatmap: 'Last 30 Days',
  statsActivityNoneToday: 'No activity today yet',
  statsActivityToday: 'Active today',
  statsDays: (n) => `${n} ${Number(n) === 1 ? 'day' : 'days'}`,
  statsTotalSessions: 'Course Sessions',
  statsTotalAttempts: 'Voice Attempts',
  statsAvgScore: 'Avg. Score',
  statsTotalTransforms: 'Transforms',
  statsTotalRoleplay: 'Roleplay Messages',
  statsLearningCurve: 'Learning Curve',
  statsLogicStress: 'Logic Stress',
  statsPronunciation: 'Pronunciation',
  statsOverallScore: 'Overall',
  statsLearningCurveSubtitle: 'Daily average across voice attempts',
  statsLearningCurveEmpty: 'Take your first Voice Challenge to chart your growth.',
  statsTopPackages: 'Most-Practiced Courses',
  statsTopPackagesEmpty: 'No course practice yet.',
  statsAttemptsLabel: (n) => `${n} attempts`,
  statsLanguagePairs: 'Language Pairs',
  statsLanguagePairsEmpty: 'No transforms yet.',
  statsVocabulary: 'Vocabulary',
  statsVocabTotal: 'Total',
  statsVocabDue: 'Due Today',
  statsVocabNew: 'New',
  statsVocabLearning: 'Learning',
  statsVocabMature: 'Mature',
  statsVocabEmpty: 'No vocabulary captured yet — finish a course lesson to build your deck.',
  langEnglish: 'English', langChinese: 'Chinese', langJapanese: 'Japanese',
  langKorean: 'Korean', langVietnamese: 'Vietnamese',
  langSpanish: 'Spanish', langFrench: 'French', langGerman: 'German',
};

const zh: Dict = {
  tagline: '核心先行语言方法',
  tabTransform: '重塑', tabCourse: '课程', tabRoleplay: '角色扮演', tabStats: '统计',
  uiLangLabel: '界面语言',
  historyTransformsHeader: '重塑历史',
  historyRoleplayHeader: '角色扮演会话',
  historyCoursesHeader: '课程库',
  historyEmpty: '暂无记录 —— 你的活动将在这里出现。',
  historyError: '无法加载历史记录，请刷新。',
  historyMessageCount: (n) => `${n} 条消息`,
  historyInputLabel: '你写的',
  historyResultLabel: '标准句',
  historyContextLabel: '场景',
  historyExpand: '展开消息',
  historyCollapse: '收起消息',
  historyTopicLabel: '主题',
  historyLoadCourse: '打开',
  historyLessonCount: (n) => `${n} 节课`,
  sourceLangLabel: '母语', targetLangLabel: '目标语',
  ageGroupLabel: '目标年龄段', industryLabel: '行业背景',
  transformPlaceholder: '输入一句话...',
  coursePlaceholder: '输入主题（例如：动物园、商务会议）',
  btnTransform: '重塑', btnGenerateCourse: '生成课程',
  submitHint: '按 ⌘/Ctrl+Enter 提交',
  errorTransform: '重塑失败，请重试。',
  errorCourse: '课程生成失败，请重试。',
  cfltThinkingHeader: 'Core / Reason / Space / Time 思维结构',
  targetMappingHeader: '目标语映射',
  standardResultHeader: (lang) => `标准${TARGET_LANG_NAME.Chinese[lang as SupportedLang] ?? lang}结果`,
  inferredFooter: '虚线槽是你输入里没说的部分。Core First 要求四元齐全 —— 点候选或自己输入，把它补完整。',
  youDidntSay: (label) => `你没说\n${label}`,
  suggest: '看建议',
  pickOrType: (label) => `选一个${label}，或自己输入`,
  typeYourOwn: '自己输入',
  typePlaceholder: (label) => `输入${label}...`,
  pressEnterToConfirm: '回车确认。',
  youPicked: '你选的', youTyped: '你写的',
  slotCore: '核心', slotReason: '原因', slotSpace: '空间', slotTime: '时间',
  labelCore: 'CORE', labelReason: 'REASON', labelSpace: 'SPACE', labelTime: 'TIME',
  statusInferred: 'AI 补全',
  statsLoading: '正在加载你的进度…',
  statsErrorLoad: '无法加载进度数据，请刷新页面。',
  statsEmptyTitle: '你的旅程即将开始',
  statsEmptyBody: '完成第一次重塑、发音挑战或角色扮演，进度就会出现在这里。',
  statsSectionStreak: '每日打卡',
  statsSectionAbility: '练习与能力',
  statsSectionMemory: '记忆',
  statsCurrentStreak: '当前连续',
  statsLongestStreak: '最长连续',
  statsStudyDaysMonth: '本月学习',
  statsStudyDaysTotal: '累计学习',
  statsActivityHeatmap: '最近 30 天',
  statsActivityNoneToday: '今天还没活动',
  statsActivityToday: '今天已活跃',
  statsDays: (n) => `${n} 天`,
  statsTotalSessions: '课程节数',
  statsTotalAttempts: '发音练习',
  statsAvgScore: '平均分',
  statsTotalTransforms: '重塑次数',
  statsTotalRoleplay: '角色扮演消息',
  statsLearningCurve: '学习曲线',
  statsLogicStress: '逻辑重音',
  statsPronunciation: '发音',
  statsOverallScore: '综合分',
  statsLearningCurveSubtitle: '按日聚合的发音练习均值',
  statsLearningCurveEmpty: '完成一次发音挑战即可绘制成长曲线。',
  statsTopPackages: '练习最多的课程',
  statsTopPackagesEmpty: '还没有课程练习记录。',
  statsAttemptsLabel: (n) => `${n} 次练习`,
  statsLanguagePairs: '语言对',
  statsLanguagePairsEmpty: '还没有重塑记录。',
  statsVocabulary: '词汇',
  statsVocabTotal: '总词数',
  statsVocabDue: '今日待复习',
  statsVocabNew: '新词',
  statsVocabLearning: '学习中',
  statsVocabMature: '已掌握',
  statsVocabEmpty: '尚未收集词汇 —— 完成一节课程后即可建立你的词库。',
  langEnglish: '英语', langChinese: '中文', langJapanese: '日语',
  langKorean: '韩语', langVietnamese: '越南语',
  langSpanish: '西班牙语', langFrench: '法语', langGerman: '德语',
};

const ja: Dict = {
  tagline: 'コアファースト言語学習法',
  tabTransform: '変換', tabCourse: 'コース', tabRoleplay: 'ロールプレイ', tabStats: '統計',
  uiLangLabel: '表示言語',
  historyTransformsHeader: '変換履歴',
  historyRoleplayHeader: 'ロールプレイのセッション',
  historyCoursesHeader: 'コースライブラリ',
  historyEmpty: 'まだ記録がありません — 履歴がここに表示されます。',
  historyError: '履歴を読み込めませんでした。再読み込みしてください。',
  historyMessageCount: (n) => `${n}件のメッセージ`,
  historyInputLabel: '入力した文',
  historyResultLabel: '標準文',
  historyContextLabel: '場面',
  historyExpand: 'メッセージを表示',
  historyCollapse: 'メッセージを隠す',
  historyTopicLabel: 'トピック',
  historyLoadCourse: '開く',
  historyLessonCount: (n) => `${n}レッスン`,
  sourceLangLabel: '母語', targetLangLabel: '学習言語',
  ageGroupLabel: '対象年齢層', industryLabel: '業界・分野',
  transformPlaceholder: '文を入力してください...',
  coursePlaceholder: 'トピックを入力（例：動物園、ビジネス会議）',
  btnTransform: '変換', btnGenerateCourse: 'コースを生成',
  submitHint: '⌘/Ctrl+Enter で送信',
  errorTransform: '変換に失敗しました。もう一度お試しください。',
  errorCourse: 'コース生成に失敗しました。もう一度お試しください。',
  cfltThinkingHeader: 'Core First 思考構造',
  targetMappingHeader: '学習言語へのマッピング',
  standardResultHeader: (lang) => `標準${TARGET_LANG_NAME.Japanese[lang as SupportedLang] ?? lang}結果`,
  inferredFooter: '点線のスロットは入力に含まれていなかった部分です。Core First は4要素すべてを必要とします — 候補を選ぶか自分で入力して文を完成させてください。',
  youDidntSay: (label) => `${label}を\n言っていません`,
  suggest: '候補を見る',
  pickOrType: (label) => `${label}を選ぶか、自分で入力`,
  typeYourOwn: '自分で入力',
  typePlaceholder: (label) => `${label}を入力...`,
  pressEnterToConfirm: 'Enterキーで確定。',
  youPicked: '選んだもの', youTyped: '入力したもの',
  slotCore: 'コア', slotReason: '理由', slotSpace: '場所', slotTime: '時間',
  statsLoading: '進捗を読み込み中…',
  statsErrorLoad: '進捗データを読み込めません。ページを再読み込みしてください。',
  statsEmptyTitle: '学習の旅がもうすぐ始まります',
  statsEmptyBody: '最初の変換・音声チャレンジ・ロールプレイを完了すると、進捗がここに表示されます。',
  statsSectionStreak: '毎日のチェックイン',
  statsSectionAbility: '練習とスキル',
  statsSectionMemory: '記憶',
  statsCurrentStreak: '現在の連続記録',
  statsLongestStreak: '最長連続記録',
  statsStudyDaysMonth: '今月の学習日数',
  statsStudyDaysTotal: '累計学習日数',
  statsActivityHeatmap: '直近 30 日',
  statsActivityNoneToday: '今日はまだ活動がありません',
  statsActivityToday: '今日アクティブ',
  statsDays: (n) => `${n} 日`,
  statsTotalSessions: 'コースセッション',
  statsTotalAttempts: '音声練習',
  statsAvgScore: '平均スコア',
  statsTotalTransforms: '変換回数',
  statsTotalRoleplay: 'ロールプレイのメッセージ',
  statsLearningCurve: '学習曲線',
  statsLogicStress: '論理ストレス',
  statsPronunciation: '発音',
  statsOverallScore: '総合スコア',
  statsLearningCurveSubtitle: '音声練習の日別平均',
  statsLearningCurveEmpty: '最初の音声チャレンジで成長曲線を描き始めましょう。',
  statsTopPackages: 'よく練習しているコース',
  statsTopPackagesEmpty: 'まだコース練習の記録がありません。',
  statsAttemptsLabel: (n) => `${n} 回`,
  statsLanguagePairs: '言語ペア',
  statsLanguagePairsEmpty: 'まだ変換履歴がありません。',
  statsVocabulary: '語彙',
  statsVocabTotal: '総単語数',
  statsVocabDue: '本日復習',
  statsVocabNew: '新規',
  statsVocabLearning: '学習中',
  statsVocabMature: '習得済み',
  statsVocabEmpty: 'まだ語彙が記録されていません — レッスンを完了するとデッキが作られます。',
  langEnglish: '英語', langChinese: '中国語', langJapanese: '日本語',
  langKorean: '韓国語', langVietnamese: 'ベトナム語',
  langSpanish: 'スペイン語', langFrench: 'フランス語', langGerman: 'ドイツ語',
};

const ko: Dict = {
  tagline: '코어 퍼스트 언어 학습법',
  tabTransform: '변환', tabCourse: '코스 모드', tabRoleplay: '역할극', tabStats: '통계',
  uiLangLabel: '인터페이스',
  historyTransformsHeader: '변환 기록',
  historyRoleplayHeader: '역할극 세션',
  historyCoursesHeader: '코스 라이브러리',
  historyEmpty: '아직 기록이 없습니다 — 활동 내역이 여기에 표시됩니다.',
  historyError: '기록을 불러올 수 없습니다. 새로고침 해주세요.',
  historyMessageCount: (n) => `메시지 ${n}개`,
  historyInputLabel: '입력한 문장',
  historyResultLabel: '표준 문장',
  historyContextLabel: '상황',
  historyExpand: '메시지 펼치기',
  historyCollapse: '메시지 접기',
  historyTopicLabel: '주제',
  historyLoadCourse: '열기',
  historyLessonCount: (n) => `${n}개 레슨`,
  sourceLangLabel: '모국어', targetLangLabel: '학습 언어',
  ageGroupLabel: '대상 연령대', industryLabel: '업종 / 분야',
  transformPlaceholder: '문장을 입력하세요...',
  coursePlaceholder: '주제를 입력하세요 (예: 동물원, 비즈니스 회의)',
  btnTransform: '변환', btnGenerateCourse: '코스 생성',
  submitHint: '⌘/Ctrl+Enter 로 전송',
  errorTransform: '변환에 실패했습니다. 다시 시도해 주세요.',
  errorCourse: '코스 생성에 실패했습니다. 다시 시도해 주세요.',
  cfltThinkingHeader: 'Core First 사고 구조',
  targetMappingHeader: '학습 언어 매핑',
  standardResultHeader: (lang) => `표준 ${TARGET_LANG_NAME.Korean[lang as SupportedLang] ?? lang} 결과`,
  inferredFooter: '점선 슬롯은 입력에 없던 항목입니다. Core First는 네 가지 요소가 모두 필요합니다 — 추천을 고르거나 직접 입력해 문장을 완성하세요.',
  youDidntSay: (label) => `${label}을(를)\n말하지 않았어요`,
  suggest: '추천 보기',
  pickOrType: (label) => `${label}을(를) 고르거나 직접 입력하세요`,
  typeYourOwn: '직접 입력',
  typePlaceholder: (label) => `${label} 입력...`,
  pressEnterToConfirm: 'Enter 키로 확인하세요.',
  youPicked: '선택한 항목', youTyped: '입력한 항목',
  slotCore: '핵심', slotReason: '이유', slotSpace: '장소', slotTime: '시간',
  statsLoading: '진행 상황을 불러오는 중…',
  statsErrorLoad: '진행 데이터를 불러올 수 없습니다. 새로고침 해주세요.',
  statsEmptyTitle: '학습 여정이 곧 시작됩니다',
  statsEmptyBody: '첫 변환, 음성 챌린지 또는 역할극을 완료하면 진행 상황이 여기에 표시됩니다.',
  statsSectionStreak: '매일 체크인',
  statsSectionAbility: '연습과 실력',
  statsSectionMemory: '기억',
  statsCurrentStreak: '현재 연속 기록',
  statsLongestStreak: '최장 연속 기록',
  statsStudyDaysMonth: '이번 달 학습 일수',
  statsStudyDaysTotal: '총 학습 일수',
  statsActivityHeatmap: '최근 30일',
  statsActivityNoneToday: '오늘은 아직 활동이 없습니다',
  statsActivityToday: '오늘 활동 중',
  statsDays: (n) => `${n}일`,
  statsTotalSessions: '코스 세션',
  statsTotalAttempts: '음성 연습',
  statsAvgScore: '평균 점수',
  statsTotalTransforms: '변환 횟수',
  statsTotalRoleplay: '역할극 메시지',
  statsLearningCurve: '학습 곡선',
  statsLogicStress: '논리 강세',
  statsPronunciation: '발음',
  statsOverallScore: '종합 점수',
  statsLearningCurveSubtitle: '음성 연습의 일별 평균',
  statsLearningCurveEmpty: '첫 음성 챌린지로 성장 곡선을 그려보세요.',
  statsTopPackages: '가장 많이 연습한 코스',
  statsTopPackagesEmpty: '코스 연습 기록이 아직 없습니다.',
  statsAttemptsLabel: (n) => `${n}회`,
  statsLanguagePairs: '언어 쌍',
  statsLanguagePairsEmpty: '변환 기록이 아직 없습니다.',
  statsVocabulary: '어휘',
  statsVocabTotal: '총 단어',
  statsVocabDue: '오늘 복습',
  statsVocabNew: '신규',
  statsVocabLearning: '학습 중',
  statsVocabMature: '숙달',
  statsVocabEmpty: '아직 어휘가 기록되지 않았습니다 — 레슨을 완료하면 단어장이 만들어집니다.',
  langEnglish: '영어', langChinese: '중국어', langJapanese: '일본어',
  langKorean: '한국어', langVietnamese: '베트남어',
  langSpanish: '스페인어', langFrench: '프랑스어', langGerman: '독일어',
};

const vi: Dict = {
  tagline: 'Phương pháp học ngôn ngữ Core-First',
  tabTransform: 'Chuyển đổi', tabCourse: 'Khóa học', tabRoleplay: 'Đóng vai', tabStats: 'Thống kê',
  uiLangLabel: 'Giao diện',
  historyTransformsHeader: 'Lịch sử chuyển đổi',
  historyRoleplayHeader: 'Phiên đóng vai',
  historyCoursesHeader: 'Thư viện khóa học',
  historyEmpty: 'Chưa có gì — các hoạt động sẽ hiện ở đây.',
  historyError: 'Không thể tải lịch sử. Vui lòng làm mới trang.',
  historyMessageCount: (n) => `${n} tin nhắn`,
  historyInputLabel: 'Bạn đã viết',
  historyResultLabel: 'Câu chuẩn',
  historyContextLabel: 'Bối cảnh',
  historyExpand: 'Hiện tin nhắn',
  historyCollapse: 'Ẩn tin nhắn',
  historyTopicLabel: 'Chủ đề',
  historyLoadCourse: 'Mở',
  historyLessonCount: (n) => `${n} bài học`,
  sourceLangLabel: 'Tiếng mẹ đẻ', targetLangLabel: 'Ngôn ngữ học',
  ageGroupLabel: 'Độ tuổi mục tiêu', industryLabel: 'Lĩnh vực / ngành',
  transformPlaceholder: 'Nhập một câu...',
  coursePlaceholder: 'Nhập chủ đề (ví dụ: Sở thú, Họp công việc)',
  btnTransform: 'Chuyển đổi', btnGenerateCourse: 'Tạo khóa học',
  submitHint: 'Nhấn ⌘/Ctrl+Enter để gửi',
  errorTransform: 'Chuyển đổi thất bại. Vui lòng thử lại.',
  errorCourse: 'Tạo khóa học thất bại. Vui lòng thử lại.',
  cfltThinkingHeader: 'Cấu trúc tư duy Core First',
  targetMappingHeader: 'Ánh xạ sang ngôn ngữ học',
  standardResultHeader: (lang) => `Kết quả ${TARGET_LANG_NAME.Vietnamese[lang as SupportedLang] ?? lang} chuẩn`,
  inferredFooter: 'Các ô nét đứt là phần bạn chưa nói trong câu nhập. Core First yêu cầu đủ cả bốn — chọn gợi ý hoặc tự nhập để hoàn thành câu.',
  youDidntSay: (label) => `bạn chưa nói\n${label.toLowerCase()}`,
  suggest: 'Gợi ý',
  pickOrType: (label) => `Chọn ${label.toLowerCase()} hoặc tự nhập`,
  typeYourOwn: 'Tự nhập',
  typePlaceholder: (label) => `Nhập ${label.toLowerCase()}...`,
  pressEnterToConfirm: 'Nhấn Enter để xác nhận.',
  youPicked: 'BẠN CHỌN', youTyped: 'BẠN NHẬP',
  slotCore: 'Cốt lõi', slotReason: 'Lý do', slotSpace: 'Không gian', slotTime: 'Thời gian',
  statsLoading: 'Đang tải tiến độ của bạn…',
  statsErrorLoad: 'Không tải được dữ liệu tiến độ. Vui lòng làm mới trang.',
  statsEmptyTitle: 'Hành trình của bạn sắp bắt đầu',
  statsEmptyBody: 'Hoàn thành chuyển đổi, thử thách phát âm hoặc đóng vai đầu tiên để bắt đầu theo dõi tiến độ.',
  statsSectionStreak: 'Điểm danh hằng ngày',
  statsSectionAbility: 'Luyện tập & Kỹ năng',
  statsSectionMemory: 'Trí nhớ',
  statsCurrentStreak: 'Chuỗi hiện tại',
  statsLongestStreak: 'Chuỗi dài nhất',
  statsStudyDaysMonth: 'Ngày học tháng này',
  statsStudyDaysTotal: 'Tổng số ngày học',
  statsActivityHeatmap: '30 ngày gần nhất',
  statsActivityNoneToday: 'Hôm nay chưa có hoạt động',
  statsActivityToday: 'Hoạt động hôm nay',
  statsDays: (n) => `${n} ngày`,
  statsTotalSessions: 'Phiên khóa học',
  statsTotalAttempts: 'Lượt phát âm',
  statsAvgScore: 'Điểm trung bình',
  statsTotalTransforms: 'Số lần chuyển đổi',
  statsTotalRoleplay: 'Tin nhắn đóng vai',
  statsLearningCurve: 'Đường cong học tập',
  statsLogicStress: 'Trọng âm logic',
  statsPronunciation: 'Phát âm',
  statsOverallScore: 'Tổng thể',
  statsLearningCurveSubtitle: 'Trung bình theo ngày của các lượt phát âm',
  statsLearningCurveEmpty: 'Hãy thử thách phát âm đầu tiên để bắt đầu vẽ đường cong.',
  statsTopPackages: 'Khóa học luyện nhiều nhất',
  statsTopPackagesEmpty: 'Chưa có lượt luyện khóa học nào.',
  statsAttemptsLabel: (n) => `${n} lượt`,
  statsLanguagePairs: 'Cặp ngôn ngữ',
  statsLanguagePairsEmpty: 'Chưa có chuyển đổi nào.',
  statsVocabulary: 'Từ vựng',
  statsVocabTotal: 'Tổng',
  statsVocabDue: 'Cần ôn hôm nay',
  statsVocabNew: 'Mới',
  statsVocabLearning: 'Đang học',
  statsVocabMature: 'Đã thuộc',
  statsVocabEmpty: 'Chưa có từ vựng nào — hoàn thành một bài học để xây dựng bộ từ.',
  langEnglish: 'tiếng Anh', langChinese: 'tiếng Trung', langJapanese: 'tiếng Nhật',
  langKorean: 'tiếng Hàn', langVietnamese: 'tiếng Việt',
  langSpanish: 'tiếng Tây Ban Nha', langFrench: 'tiếng Pháp', langGerman: 'tiếng Đức',
};

const DICTS: Partial<Record<SupportedLang, Dict>> = { English: en, Chinese: zh, Japanese: ja, Korean: ko, Vietnamese: vi };

export function t(uiLang: string, key: DictKey, arg?: string): string {
  const lang = (DICTS[uiLang as SupportedLang] ? (uiLang as SupportedLang) : 'English');
  const dict = DICTS[lang]!;
  const v = dict[key];
  return typeof v === 'function' ? (v as Resolver)(arg ?? '', lang) : v;
}

// Browser → SupportedLang mapping. Used to seed uiLang on first visit.
export function detectUiLang(): SupportedLang {
  if (typeof navigator === 'undefined') return 'English';
  const tag = (navigator.language || '').toLowerCase();
  if (tag.startsWith('zh')) return 'Chinese';
  if (tag.startsWith('ja')) return 'Japanese';
  if (tag.startsWith('ko')) return 'Korean';
  if (tag.startsWith('vi')) return 'Vietnamese';
  if (tag.startsWith('es')) return 'Spanish';
  if (tag.startsWith('fr')) return 'French';
  if (tag.startsWith('de')) return 'German';
  return 'English';
}

// Sensible default L1/L2 pair given the UI language. The user can still
// override either via the form dropdowns.
export function defaultLangPair(uiLang: SupportedLang): { source: SupportedLang; target: SupportedLang } {
  return uiLang === 'English'
    ? { source: 'English', target: 'Chinese' }
    : { source: uiLang, target: 'English' };
}

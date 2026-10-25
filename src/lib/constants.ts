export const ROLES = ["USER", "CONTRIBUTOR", "MODERATOR", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

const ROLE_WEIGHT: Record<Role, number> = {
  USER: 1,
  CONTRIBUTOR: 2,
  MODERATOR: 3,
  ADMIN: 4,
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasRole(role: string, required: Role): boolean {
  if (!isRole(role)) return false;
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[required];
}

export const ROLE_LABELS: Record<Role, string> = {
  USER: "译者",
  CONTRIBUTOR: "资深译者",
  MODERATOR: "版主",
  ADMIN: "管理员",
};

/* -------------------------------------------------------------------------- */
/* Post status                                                                */
/* -------------------------------------------------------------------------- */

export const POST_STATUS = {
  PENDING_REVIEW: "PENDING_REVIEW",
  PUBLISHED: "PUBLISHED",
  HIDDEN: "HIDDEN",
  REJECTED: "REJECTED",
} as const;

export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  PENDING_REVIEW: "待审核",
  PUBLISHED: "已发布",
  HIDDEN: "已隐藏",
  REJECTED: "已驳回",
};

export const RESOLUTION = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
} as const;

export type Resolution = (typeof RESOLUTION)[keyof typeof RESOLUTION];

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  OPEN: "待定",
  RESOLVED: "已有定译",
};

export const PROPOSAL_STATUS = {
  PROPOSED: "PROPOSED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  SUPERSEDED: "SUPERSEDED",
} as const;

export type ProposalStatus = (typeof PROPOSAL_STATUS)[keyof typeof PROPOSAL_STATUS];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  PROPOSED: "候选",
  ACCEPTED: "已采纳",
  REJECTED: "已否决",
  SUPERSEDED: "已被取代",
};

export const COMMENT_STATUS = {
  VISIBLE: "VISIBLE",
  HIDDEN: "HIDDEN",
  DELETED: "DELETED",
} as const;

export const REPORT_STATUS = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

/* -------------------------------------------------------------------------- */
/* Domains                                                                    */
/* -------------------------------------------------------------------------- */

export type Domain = {
  slug: string;
  name: string;
  group: string;
  description: string;
};

/**
 * Translation domains, ordered roughly by how often terminology disputes come
 * up. Kept in sync with `schemas/glossary-entry.schema.json`.
 */
export const DOMAINS: Domain[] = [
  {
    slug: "legal",
    name: "法律",
    group: "实务领域",
    description: "法条、判决、合同与法律文书的术语与惯用表达",
  },
  {
    slug: "contract",
    name: "合同与商务",
    group: "实务领域",
    description: "合同条款、招投标、商务函件与公司治理用语",
  },
  {
    slug: "patent",
    name: "专利",
    group: "实务领域",
    description: "权利要求、说明书、检索报告与知识产权术语",
  },
  {
    slug: "medical",
    name: "医学与药学",
    group: "实务领域",
    description: "临床、诊断、药物、器械与公共卫生术语",
  },
  {
    slug: "finance",
    name: "金融",
    group: "实务领域",
    description: "证券、会计、审计、保险与金融监管术语",
  },
  {
    slug: "business",
    name: "商务与管理",
    group: "实务领域",
    description: "市场营销、供应链、人力资源与运营管理用语",
  },
  {
    slug: "engineering",
    name: "工程与技术",
    group: "实务领域",
    description: "机械、电气、土木、能源与制造工艺术语",
  },
  {
    slug: "cs",
    name: "计算机",
    group: "实务领域",
    description: "软件、算法、系统、网络与人工智能术语",
  },
  {
    slug: "science",
    name: "自然科学",
    group: "学术与人文",
    description: "物理、化学、生物、地学与数学术语",
  },
  {
    slug: "academic",
    name: "学术写作",
    group: "学术与人文",
    description: "论文、摘要、综述、评审与学术出版惯用语",
  },
  {
    slug: "philosophy",
    name: "哲学",
    group: "学术与人文",
    description: "形而上学、认识论、伦理学与逻辑学概念",
  },
  {
    slug: "religion",
    name: "宗教",
    group: "学术与人文",
    description: "经典、礼仪、神学与宗教研究术语",
  },
  {
    slug: "history",
    name: "历史与考古",
    group: "学术与人文",
    description: "史料、制度、职官、断代与考古学词汇",
  },
  {
    slug: "linguistics",
    name: "语言学",
    group: "学术与人文",
    description: "音系、句法、语义、语用与文字学术语",
  },
  {
    slug: "literature",
    name: "文学",
    group: "文化传播",
    description: "小说、诗歌、戏剧、批评理论与文学史术语",
  },
  {
    slug: "media",
    name: "新闻与传播",
    group: "文化传播",
    description: "新闻写作、传播理论、社交媒体与出版用语",
  },
  {
    slug: "audiovisual",
    name: "影视与字幕",
    group: "文化传播",
    description: "影视字幕、配音、脚本与镜头语言",
  },
  {
    slug: "games",
    name: "游戏本地化",
    group: "文化传播",
    description: "游戏 UI、剧情、技能、装备与成就文本",
  },
  {
    slug: "internet",
    name: "网络用语",
    group: "文化传播",
    description: "梗、缩略语、社区黑话与平台功能名",
  },
  {
    slug: "art",
    name: "艺术与设计",
    group: "文化传播",
    description: "美术、音乐、建筑、设计理论与展览文本",
  },
  {
    slug: "education",
    name: "教育",
    group: "社会与生活",
    description: "课程、评价、教育政策与校园场景用语",
  },
  {
    slug: "government",
    name: "政务与公共治理",
    group: "社会与生活",
    description: "公文、政策、公共服务与机构名称",
  },
  {
    slug: "food",
    name: "饮食与生活",
    group: "社会与生活",
    description: "菜名、食材、烹饪方法与生活消费文本",
  },
  {
    slug: "idiom",
    name: "成语与习语",
    group: "语言转换",
    description: "成语、谚语、俗语、典故与固定搭配",
  },
  {
    slug: "spoken",
    name: "口语与方言",
    group: "语言转换",
    description: "口语、语气词、方言与社会语域差异",
  },
  {
    slug: "name",
    name: "人名与称谓",
    group: "语言转换",
    description: "人名、头衔、亲属称谓与敬称系统",
  },
  {
    slug: "toponym",
    name: "地名",
    group: "语言转换",
    description: "国名、地名、行政区划与机构名转写",
  },
  {
    slug: "standard",
    name: "标准与规范",
    group: "语言转换",
    description: "国标、ISO、行业规范与术语标准化讨论",
  },
  {
    slug: "general",
    name: "通用",
    group: "其他",
    description: "不属于以上领域的日常翻译问题",
  },
];

export const DOMAIN_MAP = new Map(DOMAINS.map((domain) => [domain.slug, domain]));

export function domainName(slug: string): string {
  return DOMAIN_MAP.get(slug)?.name ?? slug;
}

export function isDomainSlug(value: string): boolean {
  return DOMAIN_MAP.has(value);
}

/* -------------------------------------------------------------------------- */
/* Languages                                                                  */
/* -------------------------------------------------------------------------- */

export type Language = {
  code: string;
  name: string;
  native: string;
};

export const LANGUAGES: Language[] = [
  { code: "zh-CN", name: "简体中文", native: "简体中文" },
  { code: "zh-TW", name: "繁体中文", native: "繁體中文" },
  { code: "en", name: "英语", native: "English" },
  { code: "ja", name: "日语", native: "日本語" },
  { code: "ko", name: "韩语", native: "한국어" },
  { code: "fr", name: "法语", native: "Français" },
  { code: "de", name: "德语", native: "Deutsch" },
  { code: "es", name: "西班牙语", native: "Español" },
  { code: "pt", name: "葡萄牙语", native: "Português" },
  { code: "ru", name: "俄语", native: "Русский" },
  { code: "it", name: "意大利语", native: "Italiano" },
  { code: "ar", name: "阿拉伯语", native: "العربية" },
  { code: "tr", name: "土耳其语", native: "Türkçe" },
  { code: "pl", name: "波兰语", native: "Polski" },
  { code: "nl", name: "荷兰语", native: "Nederlands" },
  { code: "sv", name: "瑞典语", native: "Svenska" },
  { code: "da", name: "丹麦语", native: "Dansk" },
  { code: "fi", name: "芬兰语", native: "Suomi" },
  { code: "cs", name: "捷克语", native: "Čeština" },
  { code: "uk", name: "乌克兰语", native: "Українська" },
  { code: "el", name: "希腊语", native: "Ελληνικά" },
  { code: "he", name: "希伯来语", native: "עברית" },
  { code: "hi", name: "印地语", native: "हिन्दी" },
  { code: "th", name: "泰语", native: "ไทย" },
  { code: "vi", name: "越南语", native: "Tiếng Việt" },
  { code: "id", name: "印尼语", native: "Bahasa Indonesia" },
  { code: "ms", name: "马来语", native: "Bahasa Melayu" },
  { code: "fa", name: "波斯语", native: "فارسی" },
  { code: "ur", name: "乌尔都语", native: "اردو" },
  { code: "sw", name: "斯瓦希里语", native: "Kiswahili" },
  { code: "la", name: "拉丁语", native: "Latina" },
  { code: "grc", name: "古希腊语", native: "Ἀρχαία Ἑλληνικὴ γλῶττα" },
  { code: "sa", name: "梵语", native: "संस्कृतम्" },
  { code: "bo", name: "藏语", native: "བོད་སྐད" },
  { code: "mn", name: "蒙古语", native: "ᠮᠣᠩᠭᠣᠯ" },
  { code: "ug", name: "维吾尔语", native: "ئۇيغۇرچە" },
  { code: "eo", name: "世界语", native: "Esperanto" },
];

export const LANGUAGE_MAP = new Map(LANGUAGES.map((language) => [language.code, language]));

export function languageName(code: string): string {
  return LANGUAGE_MAP.get(code)?.name ?? code;
}

export function languagePairLabel(source: string, target: string): string {
  return `${languageName(source)} → ${languageName(target)}`;
}

export function isLanguageCode(value: string): boolean {
  return LANGUAGE_MAP.has(value);
}

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

export const SORT_OPTIONS = {
  hot: "热度",
  new: "最新",
  top: "最高票",
  unanswered: "待定译",
} as const;

export type SortKey = keyof typeof SORT_OPTIONS;

export function isSortKey(value: string | undefined): value is SortKey {
  return !!value && value in SORT_OPTIONS;
}

export const SORTS: SortKey[] = ["hot", "new", "top", "unanswered"];

/* -------------------------------------------------------------------------- */
/* GitHub labels                                                              */
/* -------------------------------------------------------------------------- */

/** Label applied to every post issue. */
export const DISCUSSION_LABEL = "term-post";
/** Label applied when a translation is accepted. */
export const ACCEPTED_LABEL = "translation:accepted";
/** Label prefix for language pairs, e.g. `lang:en-zh-CN`. */
export const LANG_LABEL_PREFIX = "lang:";
/** Label prefix for domains, e.g. `domain:legal`. */
export const DOMAIN_LABEL_PREFIX = "domain:";

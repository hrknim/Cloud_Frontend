import { cookies, headers } from "next/headers";

export const LANG_GROUPS = [
  {
    region: "East Asia",
    langs: [
      { code: 'ko', name: '한국어' },           		// 한국어1
      { code: 'ja', name: '日本語' },           		// 일본어1
      { code: 'zh', name: '简体中文' },         	// 중국어 간체1
      { code: 'zh-hant', name: '繁體中文' },        	// 중국어 번체1
      //{ code: 'yue', name: '粵語' },            		// 광동어
      //{ code: 'wuu', name: '吴语' },            		// 오어
      //{ code: 'mn', name: 'Монгол' },           	// 몽골어2
    ]
  },
  {
    region: "Europe & America",
    langs: [
      { code: 'en', name: 'English' }, 			// 영어1
      { code: 'fr', name: 'Français' }, 			// 프랑스어1 
      { code: 'de', name: 'Deutsch' }, 			// 독일어1
      { code: 'es', name: 'Español' }, 			// 스페인어1
      { code: 'pt', name: 'Português' }, 		// 포르투갈어1
      { code: 'it', name: 'Italiano' }, 			// 이탈리아어1
      { code: 'po', name: 'Polski' }, 			// 폴란드어1
      //{ code: 'nl', name: 'Nederlands' }, 		// 네덜란드어1
      //{ code: 'lb', name: 'Lëtzebuergesch' }, 	// 룩셈부르크어2
      //{ code: 'cs', name: 'Čeština' }, 			// 체코어1
      //{ code: 'sk', name: 'Slovenčina' }, 		// 슬로바키아어2
      //{ code: 'hu', name: 'Magyar' }, 			// 헝가리어1
      //{ code: 'da', name: 'Dansk' }, 			// 덴마크어1
      //{ code: 'no', name: 'Norsk' }, 			// 노르웨이어1
      //{ code: 'nn', name: 'Nynorsk' }, 			// 노르웨이어
      //{ code: 'sv', name: 'Svenska' }, 			// 스웨덴어1
      //{ code: 'fi', name: 'Suomi' }, 			// 핀란드어1
      //{ code: 'ga', name: 'Gaeilge' }, 			// 아일랜드어2
      //{ code: 'is', name: 'íslenska' }, 			// 아이슬란드어2
      //{ code: 'ca', name: 'Català' }, 			// 카탈루냐어2
      //{ code: 'eu', name: 'Euskara' }, 			// 바스크어2
      //{ code: 'gl', name: 'Galego' }, 			// 갈리시아어2
 
      { code: 'ru', name: 'Русский' }, 			// 러시아어1
      //{ code: 'uk', name: 'Українська' }, 		// 우크라이나어1
      //{ code: 'be', name: 'Беларуская' }, 		// 벨라루스어2
      //{ code: 'et', name: 'Eesti' }, 			// 에스토니아어2
      //{ code: 'lv', name: 'Latviešu' }, 			// 라트비아어2
      //{ code: 'lt', name: 'Lietuvių' }, 			// 리투아니아어2
      //{ code: 'tt', name: 'татарча' }, 		// 타타르어2
      //{ code: 'ce', name: 'Нохчийн' }, 		// 체첸어

      //{ code: 'sr', name: 'Srpski' }, 			// 세르비아어2
      //{ code: 'hr', name: 'Hrvatski' }, 			// 크로아티아어2
      //{ code: 'sl', name: 'Slovenščina' }, 		// 슬로베니아어2
      //{ code: 'bs', name: 'Bosanski' }, 			// 보스니아어2
      //{ code: 'mk', name: 'Македонски' }, 		// 마케도니아어2

      //{ code: 'ro', name: 'Română' }, 			// 루마니아어1
      //{ code: 'bg', name: 'Български' }, 		// 불가리아어1
      //{ code: 'el', name: 'Ελληνικά' }, 			// 그리스어1
      //{ code: 'sq', name: 'Shqip' }, 			// 알바니아어2
    ]
  },
  /*
  {
    region: "America",
    langs: [
      //{ code: 'qu', name: 'Runa Simi' }, 		// 케추아어2
    ]
  },
  */
  {
    region: "South East Asia",
    langs: [
      { code: 'vi', name: 'Tiếng Việt' },       	// 베트남어1
      { code: 'id', name: 'Bahasa Indonesia' }, 	// 인도네시아어1
      //{ code: 'ms', name: 'Bahasa Melayu' },    	// 말레이어2
      //{ code: 'th', name: 'ไทย' },              		// 태국어1
      //{ code: 'my', name: 'မြန်မာဘာသာ' },       	// 미얀마어
      //{ code: 'jv', name: 'Jawa' },             		// 자와어
      //{ code: 'su', name: 'Sunda' },            		// 순다어
      //{ code: 'tl', name: 'Tagalog' },          		// 타갈로그어 필리핀2
    ]
  },
  /*
  {
    region: "South Asia",
    langs: [
      { code: 'hi', name: 'हिन्दी' },             		// 힌디어2
      { code: 'bn', name: 'বাংলা' },             		// 뱅골어2
      { code: 'te', name: 'తెలుగు' },           		//텔루구어2
      { code: 'mr', name: 'मराठी' },            		// 마라티어2
      { code: 'ta', name: 'தமிழ்' },           		// 타밀어2
      { code: 'ur', name: 'اردو' },           		// 우르두어2
      { code: 'ml', name: 'മലയാളം' },          	// 말라얄람어2
      { code: 'pa', name: 'ਪੰਜਾਬੀ' }, 			// 펀자브어2
      { code: 'kn', name: 'ಕನ್ನಡ' }, 			// 칸나다어2
      { code: 'gu', name: 'ગુજરાતી' }, 			// 구자라트어2
      { code: 'ne', name: 'नेपाली' }, 			// 네팔어2
      { code: 'si', name: 'සිංහල' }, 			// 싱할라어2
      { code: 'as', name: 'অসমীয়া' }, 			// 아삼어2
      { code: 'sd', name: 'سنڌي' }, 			// 신드어2
      { code: 'or', name: 'ଓଡ଼ିଆ' }, 			// 오디아어2
    ]
  },
  */
 /*
  {
    region: "Middle Asia",
    langs: [
      { code: 'uz', name: 'Oʻzbekcha' }, 		// 우즈베크어2
      { code: 'hy', name: 'Հայերեն' }, 			// 아르메니아어2
      { code: 'kk', name: 'Kazakh' }, 			// 카자흐어2
      { code: 'az', name: 'Azərbaycan' }, 		// 아제르바이잔어2
      { code: 'ka', name: 'ქართული' }, 		// 조지아어2
      { code: 'tg', name: 'Тоҷикӣ' }, 			// 타지크어2
      { code: 'ky', name: 'кыргызча' }, 		// 키르기스어2
    ]
  },
  */
  {
    region: "Middle East",
    langs: [
      { code: 'tr', name: 'Türkçe' }, 			// 터키어1
      //{ code: 'arz', name: 'مصرى' }, 			// 이집트 아랍어
      { code: 'ar', name: 'العربية' }, 			// 아랍어2
      //{ code: 'fa', name: 'فارسی' }, 			// 페르시아어2
      //{ code: 'he', name: 'עברית' }, 			// 히브리어2
      //{ code: 'ku', name: 'Kurdî' }, 			// 쿠르드어
    ]
  },
  /*
  {
    region: "Africa",
    langs: [
      { code: 'sw', name: 'Kiswahili' }, 		// 스와힐리어2
      { code: 'af', name: 'Afrikaans' }, 		// 아프리칸스어2
      //{ code: 'mg', name: 'Malagasy' }, 		// 말라가시어
      { code: 'ha', name: 'Hausa' }, 			// 하우사어2
      { code: 'ig', name: 'Igbo' }, 			// 이보어2
      { code: 'yo', name: 'Yorùbá' }, 			// 요루바어2
      { code: 'am', name: 'አማርኛ' }, 			// 암하라어2
    ]
  }
  */
] as const;

export const SUPPORTED_LANGS = LANG_GROUPS.flatMap(group => group.langs.map(l => l.code));
export type Lang = typeof SUPPORTED_LANGS[number];
export const DEFAULT_LANG: Lang = 'en';

export const localeMap: Record<string, string> = {
  // East Asia
  ko: "ko_KR",      // 한국어
  ja: "ja_JP",      // 日本語
  zh: "zh_CN",      // 简体中文 (간체)
  "zh-hant": "zh_TW", // 繁體中文 (번체)

  // Europe & America
  en: "en_US",      // English
  fr: "fr_FR",      // Français
  de: "de_DE",      // Deutsch
  es: "es_ES",      // Español
  pt: "pt_PT",      // Português
  it: "it_IT",      // Italiano
  pl: "pl_PL",      // Polski
  ru: "ru_RU",      // Русский

  // South East Asia
  vi: "vi_VN",      // Tiếng Việt
  id: "id_ID",      // Bahasa Indonesia

  // Middle East
  tr: "tr_TR",      // Türkçe
  ar: "ar_SA",      // Arabic (사우디아라비아 기준)
};

const PIECES = {
  ko: {
    // account
    account_setting: '계정 설정',
    login: '로그인',
    logout: '로그아웃',
    create_new_account: '새 계정 만들기',
    notuser_title: '방문자님, 환영합니다!',
    notuser_desc: '로그인해서 서비스에 접속하세요.',

    policy_terms: '이용약관',
    policy_privacy: '개인정보처리방침',
    footer_desc: 'Auth',
  },
  en: {
    // account
    account_setting: 'Account Settings',
    login: 'Login',
    logout: 'Logout',
    create_new_account: 'Create Account',
    notuser_title: 'Welcome, Guest!',
    notuser_desc: 'Log in to connect services.',

    policy_terms: 'Terms',
    policy_privacy: 'Privacy',
    footer_desc: 'Auth',
  },
} as const

export type PieceKey = keyof typeof PIECES['en'];
type LangKey = keyof typeof PIECES;
export function t(key: PieceKey, lang: String = 'en'): string {
  return (
    PIECES[lang as LangKey]?.[key] ??
    PIECES.en[key] ??
    key
  )
}

export function ut(language: Lang = 'en') {
  const lang = language as LangKey;
  return {
    account_setting: PIECES[lang]?.['account_setting'],
    login: PIECES[lang]?.['login'],
    logout: PIECES[lang]?.['logout'],
    create_new_account: PIECES[lang]?.['create_new_account'],
    notuser_title: PIECES[lang]?.['notuser_title'],
    notuser_desc: PIECES[lang]?.['notuser_desc'],
  }
}

export function normalizeLang(input?: String) {
  return SUPPORTED_LANGS.includes(input as Lang)
    ? (input as Lang)
    : DEFAULT_LANG
}

export async function GetCurrentLanguage(defaultLang?: Lang) {
  // 1. 로그인 유저 확인
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  if (cookieLocale) return normalizeLang(cookieLocale);

  // 2. 브라우저 헤더 확인 (Accept-Language)
  const headerList = await headers();
  const acceptLang = headerList.get("accept-language");
  
  if (acceptLang) {
    const preferredLang = acceptLang.split(',')[0].substring(0, 2);
    // 지원하는 언어일 때만 반환, 아니면 기본값 'ko'
    return normalizeLang(preferredLang);
  }

  return normalizeLang(defaultLang);
}

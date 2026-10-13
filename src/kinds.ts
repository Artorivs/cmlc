/** What each source type is called, for labelling results and the form. */
export const TYPE_NAMES: Record<string, string> = {
    book: "中文图书",
    article: "期刊论文",
    chapter: "文集、集刊文章",
    newspaper: "报纸文章",
    web: "网络文献",
    wechat: "微信公众号文章",
    thesis: "学位论文",
    statute: "法律法规",
    normative: "规范性文件",
    case: "裁判文书",
    case_gazette: "公报案例",
    case_guiding: "指导性案例",
    case_library: "人民法院案例库",
    en_book: "英文图书",
    en_article: "英文期刊论文",
    en_case_us: "美国案例",
    en_case_uk: "英国案例",
    fr_book: "法文图书",
    fr_article: "法文期刊论文",
    de_book: "德文图书",
    de_article: "德文期刊论文",
    it_book: "意大利文图书",
    it_article: "意大利文期刊论文",
    ru_book: "俄文图书",
    ru_article: "俄文期刊论文",
    ja_book: "日文图书",
    ja_article: "日文期刊论文",
};

/** '法律法规' for 'statute'; an unknown type is shown as it is. */
export const typeName = (type: unknown): string =>
    TYPE_NAMES[String(type)] ?? String(type);

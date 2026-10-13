/**
 * Notes written in traditional characters. The parsers read simplified text, so a note is read through a
 * one-for-one simplified copy; what they pick out is then taken from the same place in the original, and the
 * few words the styles add themselves (载、第…页、号 …) are written in the note's own script.
 */
import { HANT_PAIRS } from "./hant.ts";

const TO_SIMPLIFIED = new Map<string, string>();
for (let i = 0; i < HANT_PAIRS.length; i += 2)
    TO_SIMPLIFIED.set(HANT_PAIRS[i]!, HANT_PAIRS[i + 1]!);

/** Words the styles write, simplified → traditional. */
const STYLE_WORDS =
    "载載页頁号號条條项項译譯编編书書学學论論报報网網访訪问問发發废廢订訂节節册冊辑輯点點题題稳穩为為注註门門";
const TO_TRADITIONAL = new Map<string, string>();
for (let i = 0; i < STYLE_WORDS.length; i += 2)
    TO_TRADITIONAL.set(STYLE_WORDS[i]!, STYLE_WORDS[i + 1]!);

/** Same length as the input, character for character. */
export const simplified = (text: string): string =>
    [...text].map((ch) => TO_SIMPLIFIED.get(ch) ?? ch).join("");

/** Two or more traditional-only characters: one alone may be a name. */
export const isTraditional = (text: string): boolean =>
    [...text].filter((ch) => TO_SIMPLIFIED.has(ch)).length >= 2;

/** Common characters that only simplified text uses. */
const SIMPLIFIED_ONLY =
    /[国这个们为说时会来对学发经过还动进实现与关应开样当从问点长头让书条项号页载编译论报网规办则权证门间检认议设专业务产气电车东华岁决]/;
export const isSimplified = (text: string): boolean =>
    SIMPLIFIED_ONLY.test(text);

/** A text read in both scripts. `original` gives back any piece of `plain` as the author wrote it. */
export class Script {
    readonly text: string;
    readonly plain: string;
    readonly traditional: boolean;

    /** `traditional` may be decided for the whole article, since a short note (上註18) says little about itself. */
    constructor(text: string, traditional = isTraditional(text)) {
        this.text = text;
        this.plain = simplified(text);
        this.traditional = traditional;
    }

    /**
     * The author's own characters for a piece of the simplified copy. A piece put together from parts of the text
     * (生态环境部 + 网站) is restored character by character, wherever the text uses that character one way only.
     */
    original(piece: string): string {
        if (!this.traditional || !piece) return piece;
        const at = this.plain.indexOf(piece);
        if (at >= 0) return this.text.slice(at, at + piece.length);
        return [...piece].map((ch) => this.back().get(ch) ?? ch).join("");
    }

    private backMap?: Map<string, string>;
    private back(): Map<string, string> {
        if (this.backMap) return this.backMap;
        const seen = new Map<string, Set<string>>();
        [...this.plain].forEach((ch, i) =>
            seen.set(ch, (seen.get(ch) ?? new Set()).add([...this.text][i]!))
        );
        this.backMap = new Map(
            [...seen]
                .filter(([, forms]) => forms.size === 1)
                .map(([ch, forms]) => [ch, [...forms][0]!])
        );
        for (const [ch, t] of TO_TRADITIONAL)
            if (!seen.has(ch)) this.backMap.set(ch, t);
        return this.backMap;
    }

    /** The style's own words in traditional script; characters the author used are never changed. */
    restyle(output: string): string {
        if (!this.traditional) return output;
        return [...output]
            .map((ch) =>
                this.text.includes(ch) ? ch : (TO_TRADITIONAL.get(ch) ?? ch)
            )
            .join("");
    }
}

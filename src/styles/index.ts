/** Every citation style, by source type. Adding a type means adding one function to one of these files. */
import { styles as de } from "./de.ts";
import { styles as en } from "./en.ts";
import { styles as fr } from "./fr.ts";
import { styles as it } from "./it.ts";
import { styles as ja } from "./ja.ts";
import { styles as law } from "./law.ts";
import { styles as ru } from "./ru.ts";
import type { Styles } from "./style.ts";
import { styles as zh } from "./zh.ts";

export type { Style, Styles } from "./style.ts";
export const STYLES: Styles = {
    ...zh,
    ...law,
    ...en,
    ...fr,
    ...de,
    ...it,
    ...ru,
    ...ja,
};

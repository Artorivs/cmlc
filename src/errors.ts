/** The raw text matches no known format. */
export class ParseError extends Error {
    override name = "ParseError";
}

/** 未经核实的文献不得引用（第2条）. */
export class UnverifiedSourceError extends Error {
    override name = "UnverifiedSourceError";
}

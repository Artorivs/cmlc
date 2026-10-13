/**
 * Just enough of the zip format to open a Word file, change one member and put it back together,
 * in the browser or in Node, without any library. Members that are not changed are copied byte for byte.
 */

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) =>
    (u16(b, at) | (u16(b, at + 2) << 16)) >>> 0;

/** A member as stored: `data` is still compressed when `method` is 8. */
export interface Entry {
    name: string;
    method: number;
    flags: number;
    time: number;
    date: number;
    crc: number;
    size: number;
    data: Uint8Array;
}

async function through(
    data: Uint8Array,
    stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
    return new Uint8Array(
        await new Response(
            new Blob([data as BlobPart]).stream().pipeThrough(stream)
        ).arrayBuffer()
    );
}

export function readZip(zip: Uint8Array): Entry[] {
    let end = zip.length - 22;
    while (end >= 0 && u32(zip, end) !== 0x06054b50) end--;
    if (end < 0) throw new Error("这不是有效的 Word 文件（.docx）。");
    const entries: Entry[] = [];
    let at = u32(zip, end + 16);
    for (let n = u16(zip, end + 10); n > 0; n--) {
        const nameLength = u16(zip, at + 28);
        const local = u32(zip, at + 42);
        const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
        entries.push({
            name: new TextDecoder().decode(
                zip.subarray(at + 46, at + 46 + nameLength)
            ),
            flags: u16(zip, at + 8),
            method: u16(zip, at + 10),
            time: u16(zip, at + 12),
            date: u16(zip, at + 14),
            crc: u32(zip, at + 16),
            size: u32(zip, at + 24),
            data: zip.subarray(start, start + u32(zip, at + 20)),
        });
        at += 46 + nameLength + u16(zip, at + 30) + u16(zip, at + 32);
    }
    return entries;
}

/** The uncompressed contents of a member. */
export async function contents(entry: Entry): Promise<Uint8Array> {
    if (entry.method === 0) return entry.data;
    if (entry.method === 8)
        return through(entry.data, new DecompressionStream("deflate-raw"));
    throw new Error(`无法解压 ${entry.name}（压缩方式 ${entry.method}）。`);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
});
function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data)
        crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** A member with new contents, compressed, keeping its name and timestamp. */
export async function replaced(entry: Entry, data: Uint8Array): Promise<Entry> {
    return {
        ...entry,
        method: 8,
        crc: crc32(data),
        size: data.length,
        data: await through(data, new CompressionStream("deflate-raw")),
    };
}

export function writeZip(entries: Entry[]): Uint8Array {
    const parts: Uint8Array[] = [],
        central: Uint8Array[] = [];
    let offset = 0;
    for (const e of entries) {
        const name = new TextEncoder().encode(e.name);
        // Sizes go in the local header, so no data descriptor follows (flag bit 3 cleared).
        const fields = (header: DataView, at: number) => {
            header.setUint16(at, 20, true);
            header.setUint16(at + 2, e.flags & ~0x8, true);
            header.setUint16(at + 4, e.method, true);
            header.setUint16(at + 6, e.time, true);
            header.setUint16(at + 8, e.date, true);
            header.setUint32(at + 10, e.crc, true);
            header.setUint32(at + 14, e.data.length, true);
            header.setUint32(at + 18, e.size, true);
            header.setUint16(at + 22, name.length, true);
        };
        const local = new Uint8Array(30 + name.length),
            lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        fields(lv, 4);
        local.set(name, 30);
        const record = new Uint8Array(46 + name.length),
            cv = new DataView(record.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        fields(cv, 6);
        cv.setUint32(42, offset, true);
        record.set(name, 46);
        parts.push(local, e.data);
        central.push(record);
        offset += local.length + e.data.length;
    }
    const size = central.reduce((n, r) => n + r.length, 0);
    const end = new Uint8Array(22),
        ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + size + 22);
    let at = 0;
    for (const part of [...parts, ...central, end]) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

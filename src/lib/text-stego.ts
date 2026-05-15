import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun } from "docx";

const ZW0 = "\u200B";
const ZW1 = "\u200C";

export type TextMethod = "zero-width" | "case" | "spaces" | "color";

export interface TextStegoMethod {
    capacity(cover: string): number;
    encode(cover: string, secret: string): Promise<string> | string;
    decode(stego: string): Promise<string> | string;
}

const ALPHABET_EN = "abcdefghijklmnopqrstuvwxyz";
const ALPHABET_UA = "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя";

export function caesar(text: string, shift: number): string {
    function shiftCharacter(character: string, alphabet: string): string {
        const index = alphabet.indexOf(character);
        if (index === -1) return character;
        const normalizedShift = ((shift % alphabet.length) + alphabet.length) % alphabet.length;
        return alphabet[(index + normalizedShift) % alphabet.length];
    }

    return text.replace(/./g, (character) => {
        const lower = character.toLowerCase();
        const isLower = character === lower;

        if (ALPHABET_EN.includes(lower))
            character = shiftCharacter(lower, ALPHABET_EN);
        if (ALPHABET_UA.includes(lower))
            character = shiftCharacter(lower, ALPHABET_UA);

        return isLower ? character : character.toUpperCase();
    });
}

function textToBits(text: string): string {
    const bytes = Array.from(new TextEncoder().encode(text));
    const length = bytes.length;
    const lengthBits = Array.from({ length: 32 }, (_, index) => ((length >> (31 - index)) & 1) ? "1" : "0").join("");
    const payloadBits = bytes
        .map((byte) => Array.from({ length: 8 }, (_, index) => ((byte >> (7 - index)) & 1) ? "1" : "0").join(""))
        .join("");

    return lengthBits + payloadBits;
}

function bitsToText(bits: string): string {
    if (bits.length < 32) return "";

    const payloadLength = Number.parseInt(bits.slice(0, 32), 2);
    const payloadBits = bits.slice(32, 32 + payloadLength * 8);
    const bytes: number[] = [];

    for (let index = 0; index < payloadBits.length; index += 8) {
        bytes.push(Number.parseInt(payloadBits.slice(index, index + 8), 2));
    }

    return new TextDecoder().decode(new Uint8Array(bytes));
}

function escapeHtml(text: string) {
    return text.replace(/[&<>\"]/g, (character) => {
        if (character === "&") return "&amp;";
        if (character === "<") return "&lt;";
        if (character === ">") return "&gt;";
        return "&quot;";
    });
}

async function exportDocxFromText(text: string, filename: string) {
    const blob = await createTextDocxBlob(text);
    await downloadBlob(blob, filename);
}

async function exportDocxFromHtml(html: string, filename: string) {
    const blob = await createHtmlDocxBlob(html);
    await downloadBlob(blob, filename);
}

async function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export async function createTextDocxBlob(text: string) {
    const doc = new Document({
        sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }],
    });
    return Packer.toBlob(doc);
}

export async function createHtmlDocxBlob(html: string) {
    const container = document.createElement("div");
    try {
        container.innerHTML = html;
        const runs: TextRun[] = [];

        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || "";
                if (text) runs.push(new TextRun({ text }));
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const element = node as HTMLElement;
            if (element.tagName.toLowerCase() === "span" && element.style.color) {
                const color = colorToHex(element.style.color.toLowerCase()) || "#000000";
                runs.push(new TextRun({ text: element.textContent || "", color }));
                return;
            }

            for (const child of Array.from(node.childNodes)) walk(child);
        };

        walk(container);

        const doc = new Document({ sections: [{ children: [new Paragraph({ children: runs })] }] });
        return Packer.toBlob(doc);
    } finally {
        // Cleanup to prevent memory leaks
        container.innerHTML = "";
    }
}


export class ZeroWidthStegoMethod implements TextStegoMethod {
    capacity(): number {
        return Number.POSITIVE_INFINITY;
    }

    encode(cover: string, secret: string): string {
        const bits = textToBits(secret);

        let result = cover;
        for (const bit of bits) {
            result += bit === "1" ? ZW1 : ZW0;
        }

        return result;
    }

    decode(stego: string): string {
        let bits = "";
        for (const character of stego) {
            if (character === ZW0) bits += "0";
            else if (character === ZW1) bits += "1";
        }

        return bitsToText(bits);
    }
}

const CHARACTER_REGEX = /[A-Za-zА-Яа-яІіЇїЩщ]/;

export class CaseStegoMethod implements TextStegoMethod {
    capacity(cover: string): number {
        return Array.from(cover).filter((character) => CHARACTER_REGEX.test(character)).length;
    }

    encode(cover: string, secret: string): string {
        const bits = textToBits(secret).split("");
        const characters = Array.from(cover);
        const capacity = this.capacity(cover);

        if (bits.length > capacity) {
            throw new Error("Secret too large for cover (case-change capacity exceeded)");
        }

        let bitIndex = 0;
        for (let index = 0; index < characters.length && bitIndex < bits.length; index++) {
            if (!CHARACTER_REGEX.test(characters[index])) continue;
            characters[index] = bits[bitIndex] === "1" ? characters[index].toUpperCase() : characters[index].toLowerCase();
            bitIndex++;
        }

        return characters.join("");
    }

    decode(stego: string): string {
        const bits: string[] = [];
        for (const character of stego) {
            if (CHARACTER_REGEX.test(character)) {
                bits.push(character === character.toUpperCase() ? "1" : "0");
            }
        }

        return bitsToText(bits.join(""));
    }
}

const SS0 = " ";
const SS1 = "  ";

export class SpacesStegoMethod implements TextStegoMethod {
    capacity(cover: string): number {
        return cover.trim().length === 0 ? 0 : cover.trim().split(/\s+/).length - 1;
    }

    encode(cover: string, secret: string): string {
        const bits = textToBits(secret).split("");
        const capacity = this.capacity(cover);

        if (bits.length > capacity) {
            throw new Error("Secret too large for cover (spaces capacity exceeded)");
        }

        const tokens = cover.split(/(\s+)/);
        const separatorIndices = tokens.map((_, index) => index).filter((index) => index % 2 === 1);

        for (let index = 0; index < bits.length; index++) {
            tokens[separatorIndices[index]] = bits[index] === "1" ? SS1 : SS0;
        }

        return tokens.join("");
    }

    decode(stego: string): string {
        const tokens = stego.split(/(\s+)/);
        const separatorIndices = tokens.map((_, index) => index).filter((index) => index % 2 === 1);
        const bits = separatorIndices.map((index) => tokens[index] === SS1 ? "1" : "0").join("");

        return bitsToText(bits);
    }
}

const RGB0 = "#000000";
const RGB1 = "#0a0a0a";

function colorToHex(color: string) {
  const nums = color.match(/\d+/g); // extract numbers
  if (!nums) return null;

  const [r, g, b] = nums;

  return (
    "#" +
    [r, g, b]
      .map(x => Number(x).toString(16).padStart(2, "0"))
            .join("")
            .toLowerCase()
  );
}

export class ColorStegoMethod implements TextStegoMethod {
    capacity(cover: string): number {
        return cover.length;
    }

    encode(cover: string, secret: string): string {
        const bits = textToBits(secret).split("");
        const capacity = this.capacity(cover);

        if (bits.length > capacity) {
            throw new Error("Secret too large for cover (color capacity exceeded)");
        }

        const escaped = Array.from(cover).map((character) => escapeHtml(character));
        for (let index = 0; index < bits.length; index++) {
            const color = bits[index] === "1" ? RGB1 : RGB0;
            escaped[index] = `<span style=\"color:${color};\">${escaped[index]}</span>`;
        }

        return escaped.join("");
    }

    decode(stego: string): string {
        const container = document.createElement("div");
        container.innerHTML = stego;

        const bits: string[] = [];
        const walk = (node: Node, inheritedBit: string) => {
            if (node.nodeType === Node.TEXT_NODE) {
                bits.push(...Array.from(node.textContent || "").map(() => inheritedBit));
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const element = node as HTMLElement;
            if (element.tagName.toLowerCase() === "span" && element.style.color) {
                const color = colorToHex(element.style.color.toLowerCase());
                if (color) {
                    const bit = color === RGB1 ? "1" : "0";
                    for (const child of Array.from(node.childNodes)) walk(child, bit);
                    return;
                }
            }

            for (const child of Array.from(node.childNodes)) walk(child, inheritedBit);
        };

        walk(container, "0");

        return bitsToText(bits.join(""));
    }
}



export const textStegoMethods: Record<TextMethod, TextStegoMethod> = {
    "zero-width": new ZeroWidthStegoMethod(),
    case: new CaseStegoMethod(),
    spaces: new SpacesStegoMethod(),
    color: new ColorStegoMethod(),
};

export function getTextStegoMethod(method: TextMethod): TextStegoMethod {
    return textStegoMethods[method];
}

export async function importDocxAsText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

export async function importDocxAsHtml(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value;
}

export async function exportTextDocx(text: string, filename: string) {
    await exportDocxFromText(text, filename);
}

export async function exportHtmlDocx(html: string, filename: string) {
    await exportDocxFromHtml(html, filename);
}

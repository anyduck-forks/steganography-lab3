<script lang="ts">
    export type TextPreviewMethod = "zero-width" | "case" | "spaces" | "color";

    let {
        method,
        stegoText,
        decodedText = "",
    }: {
        method: TextPreviewMethod;
        stegoText: string;
        decodedText?: string;
    } = $props();

    function revealVisible(text: string) {
        if (!text) return "";

        if (method === "zero-width") {
            return text
                .replaceAll("\u200B", "[ZWSP]")
                .replaceAll("\u200C", "[ZWNJ]")
                .replaceAll("\u200D", "[ZWJ]");
        }

        if (method === "spaces") {
            return text.replaceAll(" ", "·").replaceAll("\t", "⇥");
        }

        return text;
    }
</script>

<div class="preview-grid">
    <label>
        Stegotext
        <textarea readonly rows="7">{revealVisible(stegoText)}</textarea>
    </label>

    {#if method === "color" && stegoText}
        <div class="rendered">
            <div class="rendered-title">Rendered preview</div>
            <div class="rendered-body">{@html stegoText}</div>
        </div>
    {/if}

    <label>
        Extracted secret
        <textarea readonly rows="4">{decodedText}</textarea>
    </label>
</div>

<style>
    .preview-grid {
        display: grid;
        gap: 1rem;
    }

    .rendered {
        padding: 0.75rem;
        border: 1px dashed var(--pico-muted-border-color);
        border-radius: 0.75rem;
    }

    .rendered-title {
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
        opacity: 0.75;
    }

    .rendered-body {
        line-height: 1.75;
        word-break: break-word;
    }
</style>

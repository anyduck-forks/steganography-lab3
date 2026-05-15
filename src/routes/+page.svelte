<script lang="ts">
    import { onDestroy } from "svelte";
    import {
        createHtmlDocxBlob,
        createTextDocxBlob,
        getTextStegoMethod,
        importDocxAsHtml,
        importDocxAsText,
        caesar,
    } from "$lib/text-stego";
    import type { TextMethod } from "$lib/text-stego";

    let inputText = $state<string>("");
    let secretText = $state<string>("");
    let encodedText = $state<string>("");
    let encodedSecret = $state<string>("");
    let encodedSecretBits = $state<string>("");
    let decodedBits = $state<string>("");
    let decodedText = $state<string>("");
    let decodedTextAfterCaesar = $state<string>("");
    let stegoText = $state<string>("");
    let textError = $state<string>("");
    let method = $state<TextMethod>("zero-width");
    let useCaesar = $state<boolean>(false);
    let caesarShift = $state<number>(0);
    let capacity = $state<number>(0);
    let downloadUrl = $state<string>("");
    let downloadName = $state<string>("");
    let isGeneratingDocx = $state<boolean>(false);

    const requiredBits = $derived(
        new TextEncoder().encode(secretText).length * 8 + 32,
    );

    function bitsForText(text: string): string {
        return Array.from(new TextEncoder().encode(text))
            .map((byte) => byte.toString(2).padStart(8, "0"))
            .join("");
    }

    function clearDownload() {
        if (downloadUrl) {
            URL.revokeObjectURL(downloadUrl);
            downloadUrl = "";
        }
        downloadName = "";
    }

    async function generateDownloadBlob() {
        if (!encodedText) {
            textError = "Encode a message first before downloading.";
            return;
        }

        isGeneratingDocx = true;
        try {
            const blob =
                method === "color"
                    ? await createHtmlDocxBlob(encodedText)
                    : await createTextDocxBlob(encodedText);

            clearDownload();
            downloadUrl = URL.createObjectURL(blob);
            downloadName = `stego-${method}.docx`;

            // Trigger download immediately
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = downloadName;
            link.click();
        } catch (error: any) {
            textError = error?.message || "Failed to generate DOCX.";
        } finally {
            isGeneratingDocx = false;
        }
    }

    $effect(() => {
        try {
            capacity = getTextStegoMethod(method).capacity(inputText);
        } catch {
            capacity = 0;
        }
    });

    onDestroy(() => {
        clearDownload();
    });

    async function handleInputDrop(event: DragEvent) {
        event.preventDefault();

        const file = event.dataTransfer?.files?.[0];
        if (file) {
            await handleDroppedFile(file);
            return;
        }

        const droppedText = event.dataTransfer?.getData("text/plain");
        if (droppedText) {
            textError = "";
            inputText = droppedText;
        }
    }

    function handleInputDragOver(event: DragEvent) {
        event.preventDefault();
    }

    async function handleDroppedFile(file: File) {
        if (!file) return;

        textError = "";

        try {
            const isDocx =
                file.name.toLowerCase().endsWith(".docx") ||
                file.type.includes("wordprocessingml");
            inputText =
                method === "color" && isDocx
                    ? await importDocxAsHtml(file)
                    : isDocx
                      ? await importDocxAsText(file)
                      : await file.text();
            stegoText = inputText;
        } catch (error: any) {
            textError = error?.message || "Could not read the file.";
        }
    }

    async function handleEncode() {
        textError = "";
        encodedText = "";
        encodedSecret = "";
        encodedSecretBits = "";
        clearDownload();

        if (!inputText.trim()) {
            textError = "Please enter cover text.";
            return;
        }
        if (!secretText) {
            textError = "Please enter a secret message.";
            return;
        }

        const stegoMethod = getTextStegoMethod(method);

        let payload = secretText;
        if (useCaesar) {
            payload = caesar(payload, caesarShift);
        }

        try {
            encodedText = String(await stegoMethod.encode(inputText, payload));
            stegoText = encodedText;
            encodedSecret = payload;
            encodedSecretBits = bitsForText(payload);
        } catch (error: any) {
            textError = error?.message || "Encoding failed.";
        }
    }

    async function handleDecode(sourceText = inputText) {
        textError = "";
        decodedBits = "";
        decodedText = "";
        decodedTextAfterCaesar = "";

        if (!sourceText.trim()) {
            textError = "Paste or drop stegotext first.";
            return;
        }

        const stegoMethod = getTextStegoMethod(method);

        try {
            const extractedText = String(await stegoMethod.decode(sourceText));
            decodedText = extractedText;
            decodedBits = bitsForText(extractedText);
            decodedTextAfterCaesar = useCaesar
                ? caesar(extractedText, -caesarShift)
                : extractedText;
        } catch (error: any) {
            textError = error?.message || "Decoding failed.";
        }
    }

    $effect(() => {
        // reference Caesar settings so the effect re-runs when they change
        void method;
        void useCaesar;
        void caesarShift;

        const sourceText = method === "color" ? stegoText || inputText : inputText;

        if (!sourceText.trim()) {
            decodedBits = "";
            decodedText = "";
            decodedTextAfterCaesar = "";
            return;
        }

        void handleDecode(sourceText);
    });

    $effect(() => {
        // Auto-encode whenever secret or Caesar options change (and input exists)
        if (!secretText) return;
        if (!inputText.trim()) return;

        void useCaesar;
        void caesarShift;

        void handleEncode();
    });
</script>

<svelte:head>
    <title>Text Steganography Lab</title>
</svelte:head>

<h1>Text Steganography</h1>

<section class="top-controls">
    <label class="input-box">
        Method
        <select bind:value={method}>
            <option value="zero-width">Zero-width characters</option>
            <option value="case">Case change</option>
            <option value="spaces">Space manipulation</option>
            <option value="color">Font color</option>
        </select>
    </label>

    <label class="input-box">
        Stego Container
        <textarea
            rows="8"
            bind:value={inputText}
            placeholder="Drop a DOCX file"
            ondrop={handleInputDrop}
            ondragover={handleInputDragOver}
            oninput={() => {
                stegoText = "";
            }}
        ></textarea>
    </label>

    <label>
        <input type="checkbox" bind:checked={useCaesar} />
        Caesar cipher
    </label>
    <input
        type="number"
        bind:value={caesarShift}
        min="0"
        max="99"
        disabled={!useCaesar}
    />

    {#if textError}
        <p class="error"><strong>Error:</strong> {textError}</p>
    {/if}
</section>

<details name="stego-flow" open class="panel">
    <summary>Encode</summary>

    <textarea
        rows="4"
        bind:value={secretText}
        placeholder="Secret message to hide"
    ></textarea>

    <div class="capacity-row">
        <button onclick={handleEncode}>Encode</button>
        <progress
            max={Number.isFinite(capacity) ? Math.max(capacity, 1) : 1}
            value={Number.isFinite(capacity)
                ? Math.min(requiredBits, capacity)
                : 1}
        ></progress>
        <small>
            {#if capacity === Number.POSITIVE_INFINITY}
                Unlimited capacity
            {:else if capacity > 0}
                {requiredBits} / {capacity}
            {:else}
                No input text
            {/if}
        </small>
    </div>

    <div class="result-grid">
        <label>
            Output
            <textarea readonly rows="7">{encodedText}</textarea>
        </label>

        <div class="download-row">
            <button
                onclick={generateDownloadBlob}
                disabled={!encodedText || isGeneratingDocx}
            >
                {isGeneratingDocx ? "Generating..." : "Download DOCX"}
            </button>
        </div>

        <label>
            Secret after Caesar
            <textarea readonly rows="4">{encodedSecret}</textarea>
        </label>

        <label>
            Secret in bits
            <textarea readonly rows="4">{encodedSecretBits}</textarea>
        </label>
    </div>
</details>

<details name="stego-flow" class="panel">
    <summary>Decode</summary>

    <div class="result-grid">
        <label>
            Decoded bits
            <textarea readonly rows="4">{decodedBits}</textarea>
        </label>

        <label>
            Decoded text
            <textarea readonly rows="4">{decodedText}</textarea>
        </label>

        <label>
            Decoded text after Caesar
            <textarea readonly rows="4">{decodedTextAfterCaesar}</textarea>
        </label>
    </div>
</details>

<style>
    .capacity-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin: 0.75rem 0 1rem;
    }

    .capacity-row progress {
        flex: 1;
    }

    .input-box textarea {
        min-height: 12rem;
        resize: vertical;
    }

    .download-row {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        align-items: center;
    }

    .result-grid {
        display: grid;
        gap: 1rem;
    }

    .error {
        color: var(--pico-del-color);
        margin: 0;
    }

</style>

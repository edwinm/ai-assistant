import type {marked as markedType} from "marked";
// This looks stupid, but can't find a better way now
declare const marked: typeof markedType;

let refineText = "";
let hasError = false;

window.addEventListener("load", giveRecommendation);

async function giveRecommendation() {
    if (!window.ai?.languageModel) {
        showError("It seems your browser doesn't support AI. Join the <a href=\"https://developer.chrome.com/docs/ai/built-in#get_an_early_preview\">Early Preview Program</a> to enable it.");
        return;
    }

    const {available} = await window.ai.languageModel.capabilities();
    if (available != 'readily') {
        console.error('Capabilities not available');
        showError("It seems your browser doesn't have the required AI capabilities. Follow the instructions at the <a href=\"https://developer.chrome.com/docs/ai/built-in#get_an_early_preview\">Early Preview Program</a> to enable it.");
        return;
    }

    const tab = await getCurrentTab();

    if (!tab) {
        showError("No tab found.");
        return;
    }

    // Everything okay
    document.getElementById('reload')?.addEventListener('click', giveRecommendation);
    document.getElementById('search-form')?.addEventListener('submit', processSearchForm);
    document.getElementById('refine-form')?.addEventListener('submit', processRefineForm);
    addEventListener("error", (event) => {
        showError(event.message)
    });
    clearError();

    // Inject the script into the page
    const result = await chrome.scripting.executeScript({
        target: {tabId: tab.id!},
        func: injectedFunction,
        args: [null]
    });

    const session = await window.ai.languageModel.create();

    const out = document.getElementById("out")!;

    let products = result?.[0]?.result?.data;

    if (!products) {
        stopThinking();
        document.getElementById("search-form")?.removeAttribute("hidden");
        return;
    }

    products = products.replaceAll('------', `\n---\n`);

    const refineInsert = refineText ? `take the following into account: ${refineText}` : "";

    const prompt = `talk as a personal shopping assistant. what are the best products from the list below.
    recommend one product and also give alternatives. describe for every product its cons and pros.
    ${refineInsert}
    
    ${products}`;

    // console.log('prompt', prompt);

    let initiated = false;
    let timer;

    try {
        const stream = session.promptStreaming(prompt);
        for await (const chunk of stream) {
            // console.log(chunk);
            const clean = cleanOutput(chunk);
            if (clean && !initiated) {
                stopThinking();
                initiated = true;
            }
            out.innerHTML = await marked.parse(clean);
            clearTimeout(timer);
            timer = setTimeout(showRefineForm, 2000);
        }
    } catch (error) {
        console.error(error);
        showError("I have some problems. Please try again.");
    }
}

// ~~~ Page ~~~

// This function will be injected into the page context
function injectedFunction(_messageFromPopup: any) {
    const searchResults = Array.from(document.querySelectorAll(`[data-component-type="s-search-result"]`));
    const data = searchResults.reduce((acc, entry) =>
        entry.textContent?.includes("Sponsored") ? acc : `${acc}------${entry.textContent}`, '').replaceAll('\n', ' ')

    return {type: 'recommendation', data};
}

// ~~~ Functions ~~~

async function getCurrentTab() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    return tabs?.[0];
}

function showError(text: string) {
    stopThinking();
    const out = document.getElementById("out")!;
    out.classList.add('error');
    out.innerHTML = `<h3>Sorry, I did something wrong!</h3><p>${text}</p>`;
    hasError = true;
}

function clearError() {
    const out = document.getElementById("out")!;
    out.classList.remove('error');
    out.innerHTML = ``;
    hasError = false;
}

function startThinking() {
    document.getElementById("thinking")?.removeAttribute("hidden");
}

function stopThinking() {
    document.getElementById("thinking")?.setAttribute("hidden", "");
}

function showRefineForm() {
    if (!hasError) {
        document.getElementById("refine-form")?.removeAttribute("hidden");
    }
}

function processSearchForm(event: Event) {
    event.preventDefault();
    const key = (document.getElementById('search') as HTMLInputElement)?.value;
    const url = new URL("https://www.amazon.com/s?k=");
    url.searchParams.set('k', key);
    chrome.tabs.create({url: url.toString(), active: true});
    return false;
}


function processRefineForm(event: Event) {
    event.preventDefault();
    refineText = (document.getElementById('refine') as HTMLTextAreaElement)?.value;
    startThinking();
    giveRecommendation();
}

// During testing, the output did start with input data
// This function removes this "garbage" data
// Remove this function when the provided data is clean
function cleanOutput(chunk: string) {
    const headingPos = chunk.indexOf('\n#');
    return headingPos == -1 ? "" : chunk.substring(headingPos);
}
import type {marked as markedType} from "marked";
// This looks stupid, but can't find a better way now
declare const marked: typeof markedType;

let refineText = "";
let currentUrl = "";
window.addEventListener("load", initialize);
let products = "";


async function initialize() {
    document.addEventListener('click', documentClick);

    if (!await isAiCapable()) {
        return;
    }

    document.getElementById('search-form')?.addEventListener('submit', processSearchForm);
    document.getElementById('refine-form')?.addEventListener('submit', processRefineForm);
    document.getElementById('refine')?.addEventListener('keyup', handleRefineChange);

    addEventListener("error", (event) => {
        showError(event.message)
    });

    products = await fetchProducts();
    if (products) {
        document.getElementById("refine-form")?.removeAttribute("hidden");
    } else {
        document.getElementById("search-form")?.removeAttribute("hidden");
    }

    currentUrl = await getCurrentUrl();

    const refineKey = `refineText:${currentUrl}`;
    // @ts-ignore
    const refineTextObject = await chrome.storage.session.get([refineKey]);
    refineText = refineTextObject[refineKey];
    if (refineText) {
        (document.getElementById('refine') as HTMLTextAreaElement)!.value = refineText;
        document.getElementById("refine-submit")?.removeAttribute("disabled");
        document.getElementById("skip-refine-submit")?.classList.add("secondary-button");
    }

    const outKey = `outText:${currentUrl}`;
    const outTextObject = await chrome.storage.session.get([outKey]);
    const outText = outTextObject[outKey];
    if (outText) {
        document.getElementById('out')!.innerHTML = await marked.parse(outText);
    }
}

async function isAiCapable() {
    if (!window.ai?.languageModel) {
        showError("It seems your browser doesn't support AI. Join the <a href=\"https://developer.chrome.com/docs/ai/built-in#get_an_early_preview\">Early Preview Program</a> to enable it.");
        return false;
    }

    const {available} = await window.ai.languageModel.capabilities();
    if (available != 'readily') {
        showError("It seems your browser doesn't have the required AI capabilities. Follow the instructions at the <a href=\"https://developer.chrome.com/docs/ai/built-in#get_an_early_preview\">Early Preview Program</a> to enable it.");
        return false;
    }

    return true;
}

async function fetchProducts() {
    const tab = await getCurrentTab();
    if (!tab) {
        showError("No tab found.");
        return "";
    }

    // Inject the script into the page
    const result = await chrome.scripting.executeScript({
        target: {tabId: tab.id!},
        func: injectedFunction,
        args: [null]
    });

    let products = result?.[0]?.result?.data as string;

    return products;
}

async function giveRecommendation() {
    clearError();

    const session = await window.ai.languageModel.create();

    const out = document.getElementById("out")!;

    products = products.replaceAll('------', `\n---\n`);

    const refineInsert = refineText ? `take the following into account ${refineText}` : "";

    const prompt = `talk as a personal shopping assistant. what are the best products from the list below.
    recommend one product and also give alternatives. describe for every product its cons and pros.
    ${refineInsert}
    
    ${products}`;

    // console.log('prompt', prompt);

    let initiated = false;
    try {
        const stream = session.promptStreaming(prompt);
        for await (const chunk of stream) {
            // console.log(chunk);
            const cleanText = cleanOutput(chunk);
            if (cleanText && !initiated) {
                stopThinking();
                initiated = true;
            }
            chrome.storage.session.set({ [`outText:${currentUrl}`]: cleanText });
            out.innerHTML = await marked.parse(cleanText);
        }
    } catch (error) {
        showError(`I have some problems. Please click the button again.`, error as Error);
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

function showError(text: string, error?: Error) {
    stopThinking();
    const out = document.getElementById("out")!;
    out.classList.add('error');
    out.innerHTML = `<h3>Sorry, I did something wrong!</h3><p>${text}</p>${error ? `<p class="error-message">${error.message}</p>` : ''}`;
}

function clearError() {
    const out = document.getElementById("out")!;
    out.classList.remove('error');
    out.innerHTML = ``;
}

function startThinking() {
    document.getElementById("thinking")?.removeAttribute("hidden");
}

function stopThinking() {
    document.getElementById("thinking")?.setAttribute("hidden", "");
}

function processSearchForm(event: SubmitEvent) {
    event.preventDefault();
    const key = (document.getElementById('search') as HTMLInputElement)?.value;
    const url = new URL("https://www.amazon.com/s?k=");
    url.searchParams.set('k', key);
    chrome.tabs.create({url: url.toString(), active: true});
    return false;
}


async function processRefineForm(event: SubmitEvent) {
    event.preventDefault();

    if (event.submitter?.id == "skip-refine-submit") {
        refineText = "";
    } else {
        refineText = (document.getElementById('refine') as HTMLTextAreaElement)?.value;
    }

    chrome.storage.session.set({ [`refineText:${currentUrl}`]: refineText });

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

function handleRefineChange(event: Event) {
    if ((event.target as HTMLTextAreaElement)?.value) {
        document.getElementById("refine-submit")?.removeAttribute("disabled");
        document.getElementById("skip-refine-submit")?.classList.add("secondary-button");
    } else {
        document.getElementById("refine-submit")?.setAttribute("disabled", "");
        document.getElementById("skip-refine-submit")?.classList.remove("secondary-button");
    }
}

async function getCurrentUrl() {
    return new Promise<string>((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            resolve(tabs[0]!.url!);
        });
    })
}

function documentClick(event: MouseEvent) {
    const href = (event.target as HTMLAnchorElement).href;
    if(href) {
        chrome.tabs.create({url: href, active: true});
    }
}
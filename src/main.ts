import type {marked as markedType} from "marked";
// This looks stupid, but can't find a better way now
declare const marked: typeof markedType;

let refineText = "";
let currentUrl = "";
let products = "";
window.addEventListener("load", initialize);


async function initialize() {
    document.addEventListener('click', documentClick);

    if (!await isAiCapable()) {
        return;
    }

    document.getElementById('search-form')?.addEventListener('submit', processSearchForm);
    document.getElementById('refine-form')?.addEventListener('submit', processRefineForm);
    document.getElementById('refine')?.addEventListener('keyup', handleRefineChange);

    addEventListener("error", (event) => {
        showError("Oops, I made an error", (event as ErrorEvent).message);
    });

    products = await fetchProducts();
    if (products) {
        document.getElementById("refine-form")?.removeAttribute("hidden");
        document.getElementById("refine")?.focus();
    } else {
        document.getElementById("search-form")?.removeAttribute("hidden");
        document.getElementById("search")?.focus();
    }

    currentUrl = await getCurrentUrl();

    const refineKey = `refineText:${currentUrl}`;
    const outKey = `outText:${currentUrl}`;

    const sessionStore = await chrome.storage.session.get([refineKey, outKey]);
    refineText = sessionStore[refineKey];
    if (refineText) {
        (document.getElementById('refine') as HTMLTextAreaElement)!.value = refineText;
        document.getElementById("refine-submit")?.removeAttribute("disabled");
        document.getElementById("skip-refine-submit")?.classList.add("secondary-button");
    }

    const outText = sessionStore[outKey];
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
    out.classList.add("grey");

    products = products.replaceAll('------', `\n\n`);

    const prompt = `
talk like a personal shopping assistant. recommend the best product from the list below. then give three alternatives. describe for every product its pros and cons.
use english. don't show table or productlist.
start with a heading with recommended product.
${refineText}

${products}`;

    try {
        const stream = session.promptStreaming(prompt);
        let cleanText;
        for await (const chunk of stream) {
            cleanText = cleanOutput(chunk);
            stopThinking();
            out.innerHTML = await marked.parse(cleanText || chunk);
            if (cleanText) {
                out.classList.remove("grey");
            }
        }
        out.classList.remove("grey");
        chrome.storage.session.set({[`outText:${currentUrl}`]: cleanText});
    } catch (error) {
        showError(`I have some problems. Please click the button again.`, (error as Error).message);
    }
}

// ~~~ Page ~~~

// This function will be injected into the page context
function injectedFunction(_messageFromPopup: any) {
    const searchResults = Array.from(document.querySelectorAll(`[data-component-type="s-search-result"]`));
    const data = searchResults.reduce((acc, entry) =>
        entry.textContent?.includes("Sponsored")
            ? acc
            : `${acc}------${entry.getElementsByClassName('a-size-medium')?.[0]?.textContent} ${Array.from(entry.getElementsByClassName('a-offscreen')).reduce(((acc, el) => `${acc} ${el.textContent}`), '')}`, '').replaceAll('\n', ' ')

    return {type: 'recommendation', data};
}

// ~~~ Functions ~~~

async function getCurrentTab() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    return tabs?.[0];
}

function showError(text: string, message?: string) {
    stopThinking();
    const out = document.getElementById("out")!;
    out.classList.remove("grey");
    out.classList.add('error');
    out.innerHTML = `<h3>Sorry, I did something wrong!</h3><p>${text}</p>${message ? `<p class="error-message">${message}</p>` : ''}`;
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

    chrome.storage.session.set({[`refineText:${currentUrl}`]: refineText});

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
    if (href) {
        chrome.tabs.create({url: href, active: true});
    }
}
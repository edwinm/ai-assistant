import type {marked as markedType} from "marked";
// This looks stupid, but can't find a better way now
declare const marked: typeof markedType;

document.getElementById('start')!.addEventListener('click', async () => {
    if (!window.ai?.languageModel) {
        error("It seems your browser doesn't support AI. Join the <a href=\"https://developer.chrome.com/docs/ai/built-in#get_an_early_preview\">Early Preview Program</a> to enable it.");
        return;
    }

    const {available} = await window.ai.languageModel.capabilities();
    if (available != 'readily') {
        console.error('Capabilities not available');
        error("It seems your browser doesn't have the required AI capabilities. Follow the instructions at the <a href=\"https://developer.chrome.com/docs/ai/built-in#get_an_early_preview\">Early Preview Program</a> to enable it.");
        return;
    }

    const tab = await getCurrentTab();

    if (!tab) {
        error("No tab found.");
        return;
    }

    // Inject the script into the page
    const result = await chrome.scripting.executeScript({
        target: {tabId: tab.id!},
        func: injectedFunction,
        args: [null]
    });

    console.log('result', result);
    // what are the best products from the list below

    const session = await window.ai.languageModel.create();

    const out = document.getElementById("out")!;

    let products = result?.[0]?.result?.data;

    if (!products) {
        console.error('No data');
        error("There are no products found");
        return;
    }

    products = products.replaceAll('------', `\n---\n`);

    const prompt = `what are the best products from the list below
    
    ${products}`;

    console.log('prompt', prompt);

    try {
        const stream = session.promptStreaming(prompt);
        for await (const chunk of stream) {
            out.innerHTML = await marked.parse(chunk);
        }
    } catch (error) {
        console.error(error);
    }


});

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

function error(text: string) {
    const out = document.getElementById("out")!;
    out.classList.add('error');
    out.innerHTML = `<h3>I did something wrong!</h3><p>${text}</p>`;
}
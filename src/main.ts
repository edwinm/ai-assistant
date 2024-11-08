document.getElementById('date')!.textContent = new Date().toLocaleTimeString();

document.getElementById('start')!.addEventListener('click', async () => {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject the script into the page
    const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: injectedFunction,
        args: [null]
    });

    console.log('result', result);
});

// ~~~ Page ~~~

// This function will be injected into the page context
function injectedFunction(_messageFromPopup: any) {
    // which one of the following laptops is best for a student
    // Array.from(document.querySelectorAll(`[data-component-type="s-search-result"]`)).reduce((acc, entry) => `${acc}\n --- next item ---\n ${entry.textContent}`, '')

    // Array.from(document.querySelectorAll(`[data-component-type="s-search-result"]`)).reduce((acc, entry) => `${acc}
    // <item>${entry.textContent}</item>`, '').replaceAll('\n', ' ')

    const data = Array.from(document.querySelectorAll(`[data-component-type="s-search-result"]`)).reduce((acc, entry) => entry.textContent?.includes("Sponsored") ? acc : `${acc}

------
${entry.textContent}`, '').replaceAll('\n', ' ')


    return {type: 'recommendation', data};
}

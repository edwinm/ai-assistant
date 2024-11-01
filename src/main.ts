console.log('Hello World [1]');

document.getElementById('date')!.textContent = new Date().toLocaleTimeString();

document.getElementById('start')!.addEventListener('click', async () => {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject the script into the page
    await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: injectedFunction,
        // You can pass arguments to the injected function
        args: ['Hello from popup!']
    });
});

// Listen for messages from the injected script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.from === 'injected') {
        console.log('Received from injected script:', message.data);
        document.getElementById('out')!.textContent = message.data;
        // You can send a response back if needed
        sendResponse({ received: true });
    }
    // Important: return true if you want to send a response asynchronously
    return true;
});

// This function will be injected into the page context
function injectedFunction(messageFromPopup: any) {
    // To send messages back to the extension
    function sendToExtension(data: any) {
        console.log('sendToExtension', data);

        chrome.runtime.sendMessage({
            from: 'injected',
            data: data
        }, response => {
            console.log('Extension responded:', response);
        });
    }

    // Example: Do something with the message and send a response
    console.log('Page received:', messageFromPopup);
    sendToExtension(`Hello back from ${document.title}`);

    // You can also set up a global function to be called from the page
    // @ts-ignore
    window.sendToExtension = sendToExtension;

    // You can return a value that will be available in the executeScript result
    return 'Injection completed!';
}

// Example of how to call the injected script again
async function executeInjectedScript() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
            // This will call the function we previously injected
            // @ts-ignore
            window.sendToExtension('Message from another injection!');
        }
    });

    console.log('results', results);
}

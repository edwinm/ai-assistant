console.log('Hello World [1]');

async function hello() {
    const [tab] = await chrome.tabs.query({active: true});

    chrome.scripting.executeScript({
        target: {tabId: tab.id!},
        func: () => {
            alert(`Title is: ${document.title}`);
        }
    })
}

document.getElementById('out')!.textContent = new Date().toLocaleTimeString();

document.getElementById('start')!.addEventListener('click', hello);
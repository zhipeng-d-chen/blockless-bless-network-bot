const fs = require('fs').promises;

async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";

async function readNodeAndHardwareId() {
    const data = await fs.readFile('id.txt', 'utf-8');
    const [nodeId, hardwareId] = data.trim().split(':');
    return { nodeId, hardwareId };
}

async function readAuthToken() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.trim();
}

async function registerNode(nodeId, hardwareId) {
    const fetch = await loadFetch();
    const authToken = await readAuthToken();
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    const ipAddress = await fetchIpAddress();
    console.log(`[${new Date().toISOString()}] Registering node with IP: ${ipAddress}, Hardware ID: ${hardwareId}`);
    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
            ipAddress,
            hardwareId
        })
    });

    let data;
    try {
        data = await response.json();
    } catch (error) {
        const text = await response.text();
        console.error(`[${new Date().toISOString()}] Failed to parse JSON. Response text:`, text);
        throw error;
    }

    console.log(`[${new Date().toISOString()}] Registration response:`, data);
    return data;
}

async function startSession(nodeId) {
    const fetch = await loadFetch();
    const authToken = await readAuthToken();
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] Starting session for node ${nodeId}, it might take a while...`);
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Start session response:`, data);
    return data;
}

async function stopSession(nodeId) {
    const fetch = await loadFetch();
    const authToken = await readAuthToken();
    const stopSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/stop-session`;
    console.log(`[${new Date().toISOString()}] Stopping session for node ${nodeId}`);
    const response = await fetch(stopSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Stop session response:`, data);
    return data;
}

async function pingNode(nodeId) {
    const fetch = await loadFetch();
    const chalk = await import('chalk');
    const authToken = await readAuthToken();
    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] Pinging node ${nodeId}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    const data = await response.json();
    
    const lastPing = data.pings[data.pings.length - 1].timestamp;
    const logMessage = `[${new Date().toISOString()}] Ping response, ID: ${chalk.default.green(data._id)}, NodeID: ${chalk.default.green(data.nodeId)}, Last Ping: ${chalk.default.yellow(lastPing)}`;
    console.log(logMessage);
    
    return data;
}

async function fetchIpAddress() {
    const fetch = await loadFetch();
    const response = await fetch(ipServiceUrl);
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP fetch response:`, data);
    return data.ip;
}

async function displayHeader() {
    const chalk = await import('chalk');
    console.log("");
    console.log(chalk.default.yellow(" ============================================"));
    console.log(chalk.default.yellow("|        Blockless Bless Network Bot         |"));
    console.log(chalk.default.yellow("|         github.com/recitativonika          |"));
    console.log(chalk.default.yellow(" ============================================"));
    console.log("");
}

async function runAll() {
    try {
        await displayHeader();

        const { nodeId, hardwareId } = await readNodeAndHardwareId();

        console.log(`[${new Date().toISOString()}] Read nodeId: ${nodeId}, hardwareId: ${hardwareId}`);

        const registrationResponse = await registerNode(nodeId, hardwareId);
        console.log(`[${new Date().toISOString()}] Node registration completed. Response:`, registrationResponse);

        const startSessionResponse = await startSession(nodeId);
        console.log(`[${new Date().toISOString()}] Session started. Response:`, startSessionResponse);

        console.log(`[${new Date().toISOString()}] Sending initial ping...`);
        const initialPingResponse = await pingNode(nodeId);
        // console.log(`[${new Date().toISOString()}] Initial ping response:`, initialPingResponse);

        setInterval(async () => {
            console.log(`[${new Date().toISOString()}] Sending ping...`);
            const pingResponse = await pingNode(nodeId);
        }, 60000);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred:`, error);
    }
}

runAll();

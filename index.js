const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');
const config = require('./config');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";
let useProxy;

async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

async function promptUseProxy() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question('Do you want to use a proxy? (y/n): ', answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

async function fetchIpAddress(fetch, agent) {
    const response = await fetch(ipServiceUrl, { agent });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP fetch response:`, data);
    return data.ip;
}

async function registerNode(nodeId, hardwareId, ipAddress, proxy, authToken) {
    const fetch = await loadFetch();
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
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
        }),
        agent
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

async function startSession(nodeId, proxy, authToken) {
    const fetch = await loadFetch();
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] Starting session for node ${nodeId}, it might take a while...`);
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Start session response:`, data);
    return data;
}

async function pingNode(nodeId, proxy, ipAddress, authToken) {
    const fetch = await loadFetch();
    const chalk = await import('chalk');
    let agent;

    if (proxy) {
        agent = new HttpsProxyAgent(proxy);
    }

    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] Pinging node ${nodeId} using proxy ${proxy}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });
    const data = await response.json();

    let statusColor = data.status.toLowerCase() === 'ok' ? chalk.default.green : chalk.default.red;
    const logMessage = `[${new Date().toISOString()}] Ping response status: ${statusColor(data.status.toUpperCase())}, NodeID: ${chalk.default.cyan(nodeId)}, Proxy: ${chalk.default.yellow(proxy)}, IP: ${chalk.default.yellow(ipAddress)}`;
    console.log(logMessage);
    
    return data;
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

async function processNode(node, proxy, ipAddress, authToken) {
    while (true) {
        try {
            console.log(`[${new Date().toISOString()}] Processing nodeId: ${node.nodeId}, hardwareId: ${node.hardwareId}, IP: ${ipAddress}`);
            
            const registrationResponse = await registerNode(node.nodeId, node.hardwareId, ipAddress, proxy, authToken);
            console.log(`[${new Date().toISOString()}] Node registration completed for nodeId: ${node.nodeId}. Response:`, registrationResponse);
            
            const startSessionResponse = await startSession(node.nodeId, proxy, authToken);
            console.log(`[${new Date().toISOString()}] Session started for nodeId: ${node.nodeId}. Response:`, startSessionResponse);
            
            console.log(`[${new Date().toISOString()}] Sending initial ping for nodeId: ${node.nodeId}`);
            await pingNode(node.nodeId, proxy, ipAddress, authToken);

            setInterval(async () => {
                try {
                    console.log(`[${new Date().toISOString()}] Sending ping for nodeId: ${node.nodeId}`);
                    await pingNode(node.nodeId, proxy, ipAddress, authToken);
                } catch (error) {
                    console.error(`[${new Date().toISOString()}] Error during ping: ${error.message}`);
                    throw error;
                }
            }, 60000);
            
            break;

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error occurred for nodeId: ${node.nodeId}, restarting process: ${error.message}`);
        }
    }
}

async function runAll(initialRun = true) {
    try {
        if (initialRun) {
            await displayHeader();
            useProxy = await promptUseProxy();
        }

        for (const user of config) {
            for (const node of user.nodes) {
                const proxy = useProxy ? node.proxy : null;
                const ipAddress = useProxy ? await fetchIpAddress(await loadFetch(), proxy ? new HttpsProxyAgent(proxy) : null) : null;

                processNode(node, proxy, ipAddress, user.usertoken);
            }
        }
    } catch (error) {
        const chalk = await import('chalk');
        console.error(chalk.default.yellow(`[${new Date().toISOString()}] An error occurred: ${error.message}`));
    }
}

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught exception: ${error.message}`);
    runAll(false);
});

runAll();
